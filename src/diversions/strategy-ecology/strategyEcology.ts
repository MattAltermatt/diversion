// strategyEcology.ts — spatial Iterated Prisoner's Dilemma on a toroidal grid.
// Pure (no DOM-instantiating imports) so it unit-tests headless. Each cell holds a
// strategy; each step every cell plays its 8 Moore neighbours (optionally itself),
// accumulates payoff from a tiny precomputed strategy×strategy score table, then
// adopts the strategy of the highest-scoring cell it can see (Nowak–May imitation).
// The grid is rendered stretched-to-fill so a resize never rebuilds the world.

import { mulberry32 } from '../../framework/rng'
import type { StrategyEcologyConfig } from './schema'

// Strategy ids. C/D are the two base strategies; TFT/WSLS are memory strategies
// that only diverge from AllC/AllD once the pairwise game is iterated.
export const C = 0, D = 1, TFT = 2, WSLS = 3
const STRAT_COUNT = 4

// Payoff constants (Nowak–May): mutual cooperation = R, sucker = S, mutual
// defection = P, temptation = T = b. R>P and T>R>P>S with S=P=0.
const R = 1, S = 0, P = 0

export interface StrategyState {
  cfg: StrategyEcologyConfig
  w: number
  h: number
  n: number
  strat: Uint8Array // current strategy per cell (0..3)
  next: Uint8Array // scratch double-buffer
  score: Float32Array // this step's accumulated payoff per cell
  changed: Uint8Array // 1 if the cell switched strategy on the last step
  table: Float32Array // 4×4 pairwise score (my strategy row → opponent col)
  active: number[] // strategy ids in play for the current set (2 or 4)
  lut: Uint8Array // 4×3 strategy → rgb
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  quietStreak: number // consecutive steps with almost no change (→ reseed)
  field: ImageData | null
  buf: OffscreenCanvas | HTMLCanvasElement | null
  fractions: Float32Array // strategy fractions, for the HUD
}

// ── colour ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function buildLut(cfg: StrategyEcologyConfig): Uint8Array {
  const lut = new Uint8Array(STRAT_COUNT * 3)
  const put = (i: number, hex: string) => {
    const [r, g, b] = hexRgb(hex)
    lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b
  }
  put(C, cfg.cellColors.cooperate)
  put(D, cfg.cellColors.defect)
  put(TFT, cfg.cellColors.tft)
  put(WSLS, cfg.cellColors.wsls)
  return lut
}

// ── game ──────────────────────────────────────────────────────────────────

/** The action a strategy takes at round r given the last actions of both sides
 *  (0 = cooperate, 1 = defect). Memory strategies read the opponent's last move. */
function action(strat: number, r: number, myLast: number, opLast: number): number {
  switch (strat) {
    case C: return 0
    case D: return 1
    case TFT: return r === 0 ? 0 : opLast
    case WSLS: return r === 0 ? 0 : (opLast === 0 ? myLast : 1 - myLast)
    default: return 0
  }
}

const payoff = (my: number, op: number, T: number): number =>
  my === 0 ? (op === 0 ? R : S) : (op === 0 ? T : P)

/** My total payoff playing strategy `a` against strategy `b` over `rounds` rounds
 *  (single-shot when `iterated` is false). Only 16 combinations exist, so the
 *  caller memoises this into a 4×4 table once per step. */
export function pairScore(a: number, b: number, rounds: number, iterated: boolean, T: number): number {
  if (!iterated) return payoff(action(a, 0, 0, 0), action(b, 0, 0, 0), T)
  let myLast = 0, opLast = 0, total = 0
  for (let r = 0; r < rounds; r++) {
    const my = action(a, r, myLast, opLast)
    const op = action(b, r, opLast, myLast)
    total += payoff(my, op, T)
    myLast = my; opLast = op
  }
  return total
}

/** Build the 4×4 [myStrat][opStrat] score table for the current game settings. */
export function buildTable(cfg: StrategyEcologyConfig): Float32Array {
  const iterated = cfg.strategySet !== 'C / D'
  const t = new Float32Array(STRAT_COUNT * STRAT_COUNT)
  for (let a = 0; a < STRAT_COUNT; a++)
    for (let b = 0; b < STRAT_COUNT; b++)
      t[a * STRAT_COUNT + b] = pairScore(a, b, cfg.roundsPerGame, iterated, cfg.temptation)
  return t
}

// ── build ──────────────────────────────────────────────────────────────────

function activeStrats(cfg: StrategyEcologyConfig): number[] {
  return cfg.strategySet === 'C / D' ? [C, D] : [C, D, TFT, WSLS]
}

/** Lay out the initial grid according to the chosen seed pattern. */
function seedGrid(cfg: StrategyEcologyConfig, n: number, active: number[], rng: () => number): Uint8Array {
  const g = new Uint8Array(n * n)
  if (cfg.seedPattern === 'single-defector') {
    g.fill(C)
    g[((n >> 1) * n) + (n >> 1)] = D
    return g
  }
  if (cfg.seedPattern === 'patches') {
    // A handful of big strategy blobs on a cooperator background.
    g.fill(C)
    const blobs = 10 + ((rng() * 8) | 0)
    for (let k = 0; k < blobs; k++) {
      const cx = (rng() * n) | 0, cy = (rng() * n) | 0
      const rad = 4 + ((rng() * (n / 8)) | 0)
      const s = active[(rng() * active.length) | 0]
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad) continue
          const x = ((cx + dx) % n + n) % n
          const y = ((cy + dy) % n + n) % n
          g[y * n + x] = s
        }
    }
    return g
  }
  // random: mostly cooperators with a defector-heavy sprinkle of every strategy.
  for (let i = 0; i < g.length; i++) {
    const u = rng()
    g[i] = u < 0.55 ? C : active[(rng() * active.length) | 0]
  }
  return g
}

export function createStrategyState(cfg: StrategyEcologyConfig, w: number, h: number): StrategyState {
  const n = cfg.gridResolution
  const rng = mulberry32(cfg.seed | 0)
  const active = activeStrats(cfg)
  const strat = seedGrid(cfg, n, active, rng)
  return {
    cfg, w, h, n,
    strat,
    next: new Uint8Array(n * n),
    score: new Float32Array(n * n),
    changed: new Uint8Array(n * n),
    table: buildTable(cfg),
    active,
    lut: buildLut(cfg),
    rng,
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    quietStreak: 0,
    field: null, buf: null,
    fractions: new Float32Array(STRAT_COUNT),
  }
}

// ── simulation ──────────────────────────────────────────────────────────────

/** One imitation step: score every cell against its neighbourhood, then let each
 *  cell adopt the strategy of the best-scoring cell it can see. Toroidal. */
export function step(state: StrategyState): void {
  const { n, strat, next, score, changed, table } = state
  const selfPlay = state.cfg.selfPlay
  state.tick++

  // Pass 1 — accumulate payoff. Toroidal Moore neighbourhood.
  for (let y = 0; y < n; y++) {
    const yUp = (y - 1 + n) % n, yDn = (y + 1) % n
    for (let x = 0; x < n; x++) {
      const xLf = (x - 1 + n) % n, xRt = (x + 1) % n
      const me = strat[y * n + x]
      const row = me * STRAT_COUNT
      let s = selfPlay ? table[row + me] : 0
      s += table[row + strat[yUp * n + xLf]]
      s += table[row + strat[yUp * n + x]]
      s += table[row + strat[yUp * n + xRt]]
      s += table[row + strat[y * n + xLf]]
      s += table[row + strat[y * n + xRt]]
      s += table[row + strat[yDn * n + xLf]]
      s += table[row + strat[yDn * n + x]]
      s += table[row + strat[yDn * n + xRt]]
      score[y * n + x] = s
    }
  }

  // Pass 2 — imitation. Adopt the strategy of the strictly-best cell in the
  // Moore neighbourhood + self; ties keep the incumbent (stable).
  let changedCount = 0
  const frac = state.fractions
  frac.fill(0)
  for (let y = 0; y < n; y++) {
    const yUp = (y - 1 + n) % n, yDn = (y + 1) % n
    for (let x = 0; x < n; x++) {
      const xLf = (x - 1 + n) % n, xRt = (x + 1) % n
      const i = y * n + x
      let bestStrat = strat[i]
      let bestScore = score[i]
      const consider = (j: number) => {
        if (score[j] > bestScore) { bestScore = score[j]; bestStrat = strat[j] }
      }
      consider(yUp * n + xLf); consider(yUp * n + x); consider(yUp * n + xRt)
      consider(y * n + xLf); consider(y * n + xRt)
      consider(yDn * n + xLf); consider(yDn * n + x); consider(yDn * n + xRt)
      next[i] = bestStrat
      const ch = bestStrat !== strat[i] ? 1 : 0
      changed[i] = ch
      changedCount += ch
      frac[bestStrat]++
    }
  }

  // Swap buffers.
  state.strat.set(next)
  const total = n * n
  for (let k = 0; k < STRAT_COUNT; k++) frac[k] /= total

  // Screensaver liveness: if the world has all but frozen, count it toward a reseed.
  state.quietStreak = changedCount <= 4 ? state.quietStreak + 1 : 0
}

export function advance(state: StrategyState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 6
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
  }
}

// ── rendering ──────────────────────────────────────────────────────────────

function ensureBuf(state: StrategyState): void {
  if (state.buf && state.field) return
  const n = state.n
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.field = bctx.createImageData(n, n)
}

export function render(state: StrategyState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, strat, changed, lut } = state
  ensureBuf(state)
  const img = state.field!
  const data = img.data
  const hi = cfg.highlightChanges
  for (let i = 0; i < n * n; i++) {
    const o = strat[i] * 3
    let r = lut[o], g = lut[o + 1], b = lut[o + 2]
    if (hi && changed[i]) {
      // Brighten a just-switched cell toward white so invasion fronts read crisply.
      r = (r + 255 * 2) / 3 | 0; g = (g + 255 * 2) / 3 | 0; b = (b + 255 * 2) / 3 | 0
    }
    const p = i * 4
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255
  }
  const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  bctx.putImageData(img, 0, 0)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  if (cfg.showHud) {
    const f = state.fractions
    const labels = cfg.strategySet === 'C / D'
      ? [`C ${(f[C] * 100) | 0}%`, `D ${(f[D] * 100) | 0}%`]
      : [`C ${(f[C] * 100) | 0}%`, `D ${(f[D] * 100) | 0}%`, `TFT ${(f[TFT] * 100) | 0}%`, `WSLS ${(f[WSLS] * 100) | 0}%`]
    ctx.globalAlpha = 0.9
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    let x = 14
    for (let k = 0; k < labels.length; k++) {
      const sid = cfg.strategySet === 'C / D' ? [C, D][k] : [C, D, TFT, WSLS][k]
      ctx.fillStyle = `rgb(${lut[sid * 3]},${lut[sid * 3 + 1]},${lut[sid * 3 + 2]})`
      ctx.fillText(labels[k], x, 14)
      x += ctx.measureText(labels[k]).width + 16
    }
    ctx.globalAlpha = 1
  }
}
