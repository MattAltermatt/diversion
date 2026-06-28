// Squiral — clean-room reimplementation of the algorithm from xscreensaver's
// "squiral" by Jeff Epler (1999). Faithful mechanic; presentation upgraded.
// Original © Jeff Epler; xscreensaver © Jamie Zawinski.
import type { Size } from '../../framework/types'
import type { SquiralConfig } from './schema'

import { mulberry32 } from '../../framework/rng'
import { parseHex8, parseHex6, type RGBA } from '../../framework/color'
import { sampleGradientRGBA, sampleCyclic } from '../../framework/gradient'

// PRNG, colour parsing + gradient sampling now live in the framework; re-exported
// so existing squiral imports (and its tests) keep resolving them from here.
export { mulberry32, parseHex8, parseHex6, sampleCyclic }
export type { RGBA }

// Heading deltas: 0 up, 1 right, 2 down, 3 left.
const DH = [0, 1, 0, -1]
const DV = [-1, 0, 1, 0]

export interface Worm {
  col: number; row: number
  type: number              // 0 = CCW-preferring, 1 = CW-preferring
  dir: number               // heading 0..3
  fixed: RGBA               // colour when not cycling / palette pick
  colorPos: number          // 0..1 position along the colour set (cycling)
  colorStep: number         // per-step advance (0 when not cycling)
}

export interface DirtyCell { col: number; row: number; c: RGBA }

export interface SquiralState {
  cfg: SquiralConfig
  w: number; h: number       // CSS px
  cols: number; rows: number
  fill: Uint8Array           // occupancy (0/1)
  filledOrder: number[]      // FIFO of filled indices (rolling recycle)
  coverage: number
  worms: Worm[]
  palette: RGBA[]            // palette colours (cfg.color.colors)
  bg: RGBA
  rng: () => number
  cycle: number              // cycle index (varies per-cycle seed)
  phase: 'spiraling' | 'fading' | 'wiping'
  fadeElapsed: number
  fadeAlpha: number          // per-frame fade composite alpha (fade mode)
  wipeRow: number            // rows cleared from each edge so far (wipe mode)
  stepAcc: number
  dirty: DirtyCell[]         // cells filled this frame (renderer drains)
  expired: DirtyCell[]       // cells cleared this frame → repaint bg (renderer drains)
  needsClear: boolean        // repaint whole bg next frame (after resize)
}

/** Toroidal cell index. */
export function idx(st: SquiralState, col: number, row: number): number {
  const c = ((col % st.cols) + st.cols) % st.cols
  const r = ((row % st.rows) + st.rows) % st.rows
  return r * st.cols + c
}

/** Are both cells one and two steps ahead along heading `d` empty? */
function clearAhead(st: SquiralState, w: Worm, d: number): boolean {
  const c1 = idx(st, w.col + DH[d], w.row + DV[d])
  const c2 = idx(st, w.col + 2 * DH[d], w.row + 2 * DV[d])
  return st.fill[c1] === 0 && st.fill[c2] === 0
}

/** Mark a cell filled; track coverage + FIFO order. */
function fillCell(st: SquiralState, col: number, row: number, c: RGBA): void {
  const i = idx(st, col, row)
  if (st.fill[i] === 0) { st.coverage++; st.filledOrder.push(i) }
  st.fill[i] = 1
  st.dirty.push({
    col: ((col % st.cols) + st.cols) % st.cols,
    row: ((row % st.rows) + st.rows) % st.rows,
    c,
  })
}

/** A worm's colour for the current draw: cycled along the colour set, a fixed
 *  palette pick, or sampled by position for a positional gradient. */
export function getWormColor(st: SquiralState, w: Worm): RGBA {
  const col = st.cfg.color
  if (st.cfg.cycle) {
    const set = col.mode === 'gradient' ? col.stops : col.colors
    return sampleCyclic(set, w.colorPos)
  }
  if (col.mode === 'gradient') {
    const t = col.source === 'y' ? w.row / Math.max(1, st.rows - 1)
                                 : w.col / Math.max(1, st.cols - 1)
    return sampleGradientRGBA(col.stops, t)
  }
  return w.fixed
}

export function spawnWorm(st: SquiralState, w: Worm): void {
  w.col = Math.floor(st.rng() * st.cols)
  w.row = Math.floor(st.rng() * st.rows)
  w.type = st.rng() < st.cfg.handedness ? 1 : 0
  w.dir = Math.floor(st.rng() * 4)
  w.fixed = st.palette[Math.floor(st.rng() * st.palette.length)] ?? st.palette[0]
  w.colorPos = st.rng()
  w.colorStep = st.cfg.cycle ? (0.004 + st.rng() * 0.012) : 0
}

/** Faithful do_worm: prefer same-sense turn → straight → other turn; else respawn. */
export function stepWorm(st: SquiralState, w: Worm): void {
  if (st.rng() < st.cfg.disorder) w.type = st.rng() < st.cfg.handedness ? 1 : 0
  const CCW = (w.dir + 3) % 4, CW = (w.dir + 1) % 4, STR = w.dir
  const order = w.type === 0 ? [CCW, STR, CW] : [CW, STR, CCW]
  for (const d of order) {
    if (clearAhead(st, w, d)) {
      const c = getWormColor(st, w)
      fillCell(st, w.col + DH[d], w.row + DV[d], c)
      fillCell(st, w.col + 2 * DH[d], w.row + 2 * DV[d], c)
      w.col = (((w.col + 2 * DH[d]) % st.cols) + st.cols) % st.cols
      w.row = (((w.row + 2 * DV[d]) % st.rows) + st.rows) % st.rows
      w.dir = d
      if (w.colorStep !== 0) { w.colorPos = (w.colorPos + w.colorStep) % 1 }
      return
    }
  }
  spawnWorm(st, w)
}

/** Per-cycle seed so each cycle is reproducible from cfg.seed. */
function cycleSeed(seed: number, cycle: number): number {
  return (seed + cycle * 0x85ebca6b) >>> 0
}

export function createSquiralState(cfg: SquiralConfig, w: number, h: number): SquiralState {
  const W = Math.max(1, w), H = Math.max(1, h)
  const cols = Math.max(1, Math.floor(W / cfg.cellSize))
  const rows = Math.max(1, Math.floor(H / cfg.cellSize))
  const st: SquiralState = {
    cfg, w: W, h: H, cols, rows,
    fill: new Uint8Array(cols * rows),
    filledOrder: [], coverage: 0,
    worms: [],
    palette: cfg.color.colors.map(parseHex8),
    bg: parseHex6(cfg.background),
    rng: mulberry32(cycleSeed(cfg.seed, 0)),
    cycle: 0,
    phase: 'spiraling', fadeElapsed: 0, fadeAlpha: 0, wipeRow: 0,
    stepAcc: 0, dirty: [], expired: [], needsClear: false,
  }
  st.worms = Array.from({ length: cfg.count }, () => {
    const wm: Worm = { col: 0, row: 0, type: 0, dir: 0, fixed: st.palette[0], colorPos: 0, colorStep: 0 }
    spawnWorm(st, wm)
    return wm
  })
  return st
}

const MAX_STEPS_PER_FRAME = 60

function threshold(st: SquiralState): number {
  return Math.floor((st.cfg.fillThreshold / 100) * st.cols * st.rows)
}

function clearCell(st: SquiralState, i: number): void {
  if (st.fill[i] === 0) return
  st.fill[i] = 0; st.coverage--
  st.expired.push({ col: i % st.cols, row: Math.floor(i / st.cols), c: st.bg })
}

/** Reset to a fresh grid for a new cycle (fade/wipe end). */
function reseed(st: SquiralState): void {
  st.fill.fill(0); st.filledOrder.length = 0; st.coverage = 0
  st.cycle++
  st.rng = mulberry32(cycleSeed(st.cfg.seed, st.cycle))
  for (const w of st.worms) spawnWorm(st, w)
  st.phase = 'spiraling'
  st.fadeElapsed = 0; st.wipeRow = 0
  st.needsClear = true // renderer repaints bg over the faded/wiped field
}

/** Per-frame driver. Fills st.dirty / st.expired for the renderer. */
export function stepSquiral(st: SquiralState, dt: number): void {
  if (st.phase === 'fading') {
    const total = st.cfg.fadeTime * 1000
    st.fadeElapsed += dt
    const remaining = Math.max(dt, total - (st.fadeElapsed - dt))
    st.fadeAlpha = Math.min(1, dt / remaining)
    if (st.fadeElapsed >= total) reseed(st)
    return
  }
  if (st.phase === 'wiping') {
    const band = Math.max(1, Math.ceil(st.rows / 60)) // ~1s sweep at 60fps
    for (let k = 0; k < band && st.wipeRow < Math.ceil(st.rows / 2); k++, st.wipeRow++) {
      for (let c = 0; c < st.cols; c++) {
        clearCell(st, st.wipeRow * st.cols + c)
        clearCell(st, (st.rows - 1 - st.wipeRow) * st.cols + c)
      }
    }
    if (st.wipeRow >= Math.ceil(st.rows / 2)) reseed(st)
    return
  }
  // spiraling
  st.stepAcc += st.cfg.speed * (dt / 1000)
  let steps = Math.floor(st.stepAcc); st.stepAcc -= steps
  if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
  for (let s = 0; s < steps; s++) for (const w of st.worms) stepWorm(st, w)

  if (st.cfg.clearMode === 'rolling') {
    const cap = threshold(st)
    while (st.coverage > cap && st.filledOrder.length > 0) {
      clearCell(st, st.filledOrder.shift()!)
    }
  } else if (st.coverage >= threshold(st)) {
    st.phase = st.cfg.clearMode === 'wipe' ? 'wiping' : 'fading'
    st.fadeElapsed = 0; st.wipeRow = 0
  }
}

/** Apply a config change live; false for structural changes (→ framework re-setup). */
export function updateSquiralState(st: SquiralState, cfg: SquiralConfig, _size: Size): boolean {
  if (
    cfg.count !== st.cfg.count ||
    cfg.cellSize !== st.cfg.cellSize ||
    cfg.fillThreshold !== st.cfg.fillThreshold ||
    cfg.seed !== st.cfg.seed ||
    cfg.background !== st.cfg.background
  ) return false
  st.cfg = cfg
  st.palette = cfg.color.colors.map(parseHex8)
  return true
}

/** Rebuild at a new size; flag a bg repaint (grid resets). */
export function resizeSquiralState(st: SquiralState, size: Size): void {
  const fresh = createSquiralState(st.cfg, Math.max(1, size.width), Math.max(1, size.height))
  st.w = fresh.w; st.h = fresh.h; st.cols = fresh.cols; st.rows = fresh.rows
  st.fill = fresh.fill; st.filledOrder = fresh.filledOrder; st.coverage = 0
  st.worms = fresh.worms; st.palette = fresh.palette; st.bg = fresh.bg
  st.rng = fresh.rng; st.cycle = 0
  st.phase = 'spiraling'; st.fadeElapsed = 0; st.fadeAlpha = 0; st.wipeRow = 0
  st.stepAcc = 0; st.dirty = []; st.expired = []; st.needsClear = true
}
