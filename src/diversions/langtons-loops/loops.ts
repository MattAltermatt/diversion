import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import type { LangtonsLoopsConfig } from './schema'
import { nextState } from './rule'

export const SEED_W = 10
export const SEED_H = 10

// Canonical 10x10 Langton seed (sheath square + circulating signals + arm).
const SEED: number[][] = [
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
  [2, 4, 0, 1, 4, 0, 1, 1, 1, 2],
  [2, 1, 2, 2, 2, 2, 2, 2, 1, 2],
  [2, 0, 2, 0, 0, 0, 0, 2, 1, 2],
  [2, 7, 2, 0, 0, 0, 0, 2, 7, 2],
  [2, 1, 2, 0, 0, 0, 0, 2, 0, 2],
  [2, 0, 2, 0, 0, 0, 0, 2, 1, 2],
  [2, 7, 2, 2, 2, 2, 2, 2, 7, 2],
  [2, 1, 0, 6, 1, 0, 7, 1, 0, 2],
  [0, 2, 2, 2, 2, 2, 2, 2, 2, 0],
]

export type Phase = 'running' | 'hold' | 'fade'

export interface LoopsState {
  cfg: LangtonsLoopsConfig
  w: number; h: number        // CSS pixels
  cols: number; rows: number  // grid dims
  cur: Uint8Array; next: Uint8Array
  bornStep: Int32Array        // step at which each cell last changed (for aging)
  changed: number[]
  step: number
  acc: number                 // sub-step accumulator (steps/sec)
  rng: () => number
  // lifecycle
  phase: Phase
  phaseTimer: number          // seconds remaining in hold/fade
  quietSteps: number
  needsClear: boolean
}

const QUIET_WINDOW = 90        // consecutive low-change steps -> quiescent
const MIN_STEPS = 200          // never declare quiescence before this many steps
const HOLD_SECONDS = 3
const FADE_SECONDS = 2

function gridDims(cfg: LangtonsLoopsConfig, w: number, h: number) {
  return {
    cols: Math.max(SEED_W, Math.floor(w / cfg.cellSize)),
    rows: Math.max(SEED_H, Math.floor(h / cfg.cellSize)),
  }
}

/** Rotate the 10x10 seed by 0/90/180/270 degrees (k quarter-turns). */
function rotatedSeed(k: number): number[][] {
  let g = SEED
  for (let n = 0; n < (k & 3); n++) {
    const r: number[][] = Array.from({ length: SEED_W }, () => new Array(SEED_H).fill(0))
    for (let y = 0; y < SEED_H; y++) for (let x = 0; x < SEED_W; x++) r[x][SEED_H - 1 - y] = g[y][x]
    g = r
  }
  return g
}

/** Plant one seed loop with top-left at (ox,oy) in a random orientation. */
function plantSeed(st: LoopsState, ox: number, oy: number): void {
  const g = rotatedSeed(Math.floor(st.rng() * 4))
  for (let y = 0; y < SEED_H; y++) {
    for (let x = 0; x < SEED_W; x++) {
      const gx = ox + x, gy = oy + y
      if (gx < 0 || gy < 0 || gx >= st.cols || gy >= st.rows) continue
      const i = gy * st.cols + gx
      st.cur[i] = g[y][x]
      st.bornStep[i] = 0
    }
  }
}

/** Clear the grid and plant `cfg.seeds` loops (1 = centre; >1 = scattered). */
function seedGrid(st: LoopsState): void {
  st.cur.fill(0); st.bornStep.fill(0)
  st.step = 0; st.quietSteps = 0
  const n = st.cfg.seeds
  if (n === 1) {
    plantSeed(st, (st.cols - SEED_W) >> 1, (st.rows - SEED_H) >> 1)
  } else {
    for (let s = 0; s < n; s++) {
      const ox = Math.floor(st.rng() * Math.max(1, st.cols - SEED_W))
      const oy = Math.floor(st.rng() * Math.max(1, st.rows - SEED_H))
      plantSeed(st, ox, oy)
    }
  }
}

export function createLoopsState(cfg: LangtonsLoopsConfig, w: number, h: number): LoopsState {
  const { cols, rows } = gridDims(cfg, w, h)
  const st: LoopsState = {
    cfg, w, h, cols, rows,
    cur: new Uint8Array(cols * rows), next: new Uint8Array(cols * rows),
    bornStep: new Int32Array(cols * rows),
    changed: [], step: 0, acc: 0,
    rng: mulberry32(cfg.seed >>> 0),
    phase: 'running', phaseTimer: 0, quietSteps: 0, needsClear: true,
  }
  seedGrid(st)
  return st
}

/** One synchronous CA generation. Fills `changed`; advances the lifecycle. */
export function stepLoops(st: LoopsState): void {
  st.changed.length = 0 // clear first so hold/fade frames repaint nothing stale
  if (st.phase !== 'running') return
  const { cur, next, cols, rows } = st
  const changed = st.changed
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      const c = cur[i]
      const t = y > 0 ? cur[i - cols] : 0
      const b = y < rows - 1 ? cur[i + cols] : 0
      const l = x > 0 ? cur[i - 1] : 0
      const r = x < cols - 1 ? cur[i + 1] : 0
      const nv = nextState(c, t, r, b, l)
      next[i] = nv
      if (nv !== c) { changed.push(i); st.bornStep[i] = st.step + 1 }
    }
  }
  st.cur = next; st.next = cur
  st.step++
  // Quiescence: an ABSOLUTE small threshold, not grid-proportional. A single
  // living loop always cycles >= ~8 signal cells/step; a sealed dead coral
  // changes ~0. A proportional threshold (e.g. 0.1% of a big grid = dozens)
  // would falsely flag a lone, still-growing colony as quiescent and reseed it
  // mid-growth — breaking the seeds:1 "watch one colony spread" mode.
  const QUIET_THRESHOLD = 4
  if (changed.length <= QUIET_THRESHOLD) st.quietSteps++
  else st.quietSteps = 0
  if (st.step >= MIN_STEPS && st.quietSteps >= QUIET_WINDOW) {
    st.phase = 'hold'; st.phaseTimer = HOLD_SECONDS
  }
}

/** Advance the hold/fade timers (called from `frame` with real dt seconds). */
export function tickLifecycle(st: LoopsState, dtSeconds: number): void {
  if (st.phase === 'running') return
  st.phaseTimer -= dtSeconds
  if (st.phaseTimer > 0) return
  if (st.phase === 'hold') { st.phase = 'fade'; st.phaseTimer = FADE_SECONDS; return }
  if (st.phase === 'fade') {
    seedGrid(st)
    st.phase = 'running'
    st.needsClear = true
  }
}

/** 0..1 fade-to-background progress during the FADE phase (0 elsewhere). */
export function fadeAlpha(st: LoopsState): number {
  if (st.phase !== 'fade') return 0
  return 1 - Math.max(0, st.phaseTimer) / FADE_SECONDS
}

/** Live-apply tunables; return false to force structural teardown + setup. */
export function updateLoopsState(st: LoopsState, cfg: LangtonsLoopsConfig, _size: Size): boolean {
  if (cfg.cellSize !== st.cfg.cellSize || cfg.seeds !== st.cfg.seeds || cfg.seed !== st.cfg.seed) {
    return false // structural: grid geometry / seed layout changed
  }
  st.cfg = cfg          // color-only change
  st.needsClear = true  // repaint whole field with new palette next frame
  return true
}

export function resizeLoopsState(st: LoopsState, size: Size): void {
  Object.assign(st, createLoopsState(st.cfg, size.width, size.height))
}
