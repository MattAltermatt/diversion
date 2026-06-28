import { mulberry32 } from '../../framework/rng'
import type { TurmiteConfig } from './schema'

export type Turn = 'L' | 'R' | 'U' | 'N'

// Heading index: 0=N, 1=E, 2=S, 3=W. DIRS[h] = [dx, dy] in grid cells.
export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], [1, 0], [0, 1], [-1, 0],
]

/** Rotate a heading index by a turn letter. L = ccw (-1), R = cw (+1),
 *  U = 180° (+2), N = no turn. Wraps mod 4. */
export function applyTurn(h: number, t: Turn): number {
  switch (t) {
    case 'L': return (h + 3) & 3
    case 'R': return (h + 1) & 3
    case 'U': return (h + 2) & 3
    default: return h
  }
}

/** A rule string → array of per-state turn letters. Upper-cased for safety. */
export function parseRule(rule: string): Turn[] {
  return rule.toUpperCase().split('') as Turn[]
}

export interface Ant { x: number; y: number; h: number }

export interface TurmiteState {
  cfg: TurmiteConfig
  cols: number
  rows: number
  cell: number          // px per cell (cfg.cellSize)
  grid: Uint8Array      // length cols*rows, values 0..N-1
  ants: Ant[]
  turns: Turn[]         // parsed rule
  nStates: number       // turns.length
  painted: number       // count of cells currently non-zero (coverage)
  carry: number         // fractional step accumulator (frame-rate independence)
  styles: string[]      // precomputed fillStyle per state (palette[s % len])
  fading: boolean       // mid-reseed crossfade
  fadeT: number         // crossfade progress 0..1
  generation: number    // reseed counter (folds into the seed)
}

/** Build a fresh sim state: grid sized to the canvas, ants seeded from
 *  mulberry32(seed + generation). Pure — no canvas access. */
export function createTurmiteState(
  cfg: TurmiteConfig, width: number, height: number, generation = 0,
): TurmiteState {
  const cell = cfg.cellSize
  const cols = Math.max(1, Math.ceil(width / cell))
  const rows = Math.max(1, Math.ceil(height / cell))
  const grid = new Uint8Array(cols * rows)
  const turns = parseRule(cfg.rule)
  const rand = mulberry32((cfg.seed | 0) + generation * 0x9e3779b1)
  const ants: Ant[] = []
  for (let i = 0; i < cfg.ants; i++) {
    ants.push({
      x: Math.floor(rand() * cols),
      y: Math.floor(rand() * rows),
      h: Math.floor(rand() * 4),
    })
  }
  return {
    cfg, cols, rows, cell, grid, ants,
    turns, nStates: turns.length,
    painted: 0, carry: 0,
    styles: cfg.palette.map((c) => hex8ToRgba(c)),
    fading: false, fadeT: 0, generation,
  }
}

/** "#rrggbbaa" → "rgba(r, g, b, a)". (Local to the sim; mirrors flow-field.) */
export function hex8ToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = parseInt(hex.slice(7, 9), 16) / 255
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
}

/** Advance every ant one CA step. `paint(x, y, newState)` is called for each
 *  visited cell so the caller owns rendering (keeps this canvas-free). Mutates
 *  grid / ants / painted. */
export function stepOnce(s: TurmiteState, paint: (x: number, y: number, state: number) => void): void {
  const { cols, rows, grid, turns, nStates } = s
  for (const ant of s.ants) {
    const idx = ant.y * cols + ant.x
    const cur = grid[idx]
    const next = cur + 1 >= nStates ? 0 : cur + 1
    if (cur === 0 && next !== 0) s.painted++
    else if (cur !== 0 && next === 0) s.painted--
    grid[idx] = next
    paint(ant.x, ant.y, next)
    ant.h = applyTurn(ant.h, turns[cur])
    const [dx, dy] = DIRS[ant.h]
    ant.x = ant.x + dx
    if (ant.x < 0) ant.x = cols - 1
    else if (ant.x >= cols) ant.x = 0
    ant.y = ant.y + dy
    if (ant.y < 0) ant.y = rows - 1
    else if (ant.y >= rows) ant.y = 0
  }
}

const COVERAGE_RESEED = 0.95   // reseed when ~95% of cells are non-zero
const MAX_STEPS_PER_FRAME = 20000 // anti spiral-of-death clamp

/** dt(ms) + speed(steps/s) → whole steps to run this frame, carrying the
 *  fractional remainder so the long-run rate is exact and frame-rate independent. */
export function stepsForDt(s: TurmiteState, dt: number): number {
  const want = s.carry + (s.cfg.speed * dt) / 1000
  let n = Math.floor(want)
  s.carry = want - n
  if (n > MAX_STEPS_PER_FRAME) { n = MAX_STEPS_PER_FRAME; s.carry = 0 }
  return n < 0 ? 0 : n
}

/** True when the grid is saturated enough to warrant a fresh generation. */
export function shouldReseed(s: TurmiteState): boolean {
  return s.painted >= s.cols * s.rows * COVERAGE_RESEED
}

const FADE_RATE = 0.04 // crossfade speed per frame-ish (scaled by dt below)

/** Paint the full background (setup + resize + reseed start). */
export function fillBackground(s: TurmiteState, ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = s.cfg.background
  ctx.fillRect(0, 0, w, h)
}

/** Per-frame driver. Runs steps (incremental cell paints) or, when reseeding,
 *  fades the canvas toward background then rebuilds a new generation. */
export function advance(s: TurmiteState, ctx: CanvasRenderingContext2D, dt: number, w: number, h: number): void {
  if (s.fading) {
    // Calm crossfade: translucent background wash over the whole canvas.
    s.fadeT += FADE_RATE * (dt / 16.7)
    ctx.globalAlpha = Math.min(1, FADE_RATE * (dt / 16.7) * 2)
    ctx.fillStyle = s.cfg.background
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
    if (s.fadeT >= 1) {
      // Rebuild next generation in place (same cfg/size, new seed offset).
      const next = createTurmiteState(s.cfg, w, h, s.generation + 1)
      Object.assign(s, next)
      fillBackground(s, ctx, w, h)
    }
    return
  }

  const steps = stepsForDt(s, dt)
  const cell = s.cell
  for (let i = 0; i < steps; i++) {
    stepOnce(s, (x, y, state) => {
      ctx.fillStyle = s.styles[state % s.styles.length]
      ctx.fillRect(x * cell, y * cell, cell, cell)
    })
  }
  if (shouldReseed(s)) { s.fading = true; s.fadeT = 0 }
}
