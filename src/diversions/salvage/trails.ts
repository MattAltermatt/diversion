import { TRAIL_RECRUIT } from './state'

/** One colour + one strength per cell, not a field per colour: a deposit reinforces a
 *  matching cell or contests a foreign one, and reading the recruiting colour is one
 *  array read. Trails are recruitment and display only — drones pathfind to known
 *  targets, so there is no gradient-following.
 *
 *  Two resolutions of the same field (#318). The COARSE one (`color`/`strength`, one
 *  per grid cell) is what recruits, and its tuning is untouched. The FINE one
 *  (`fcolor`/`fstrength`, `sub`×`sub` per cell) is display only: a drone deposits into
 *  the fine cell under its actual position, so a trail is drawn as a ~2–3 px line along
 *  the path it walked instead of a cell-wide stripe — which is what lets a straight
 *  diagonal path (#317) read as a straight diagonal trail. */
export interface Trails {
  cols: number
  rows: number
  color: Int16Array
  strength: Float32Array
  sub: number
  fcols: number
  frows: number
  fcolor: Int16Array
  fstrength: Float32Array
  /** Seconds of decay the fine field owes; settled by `decayFine` at raster time. */
  fineDue: number
}

/** Target width of a drawn trail, in CSS px. */
export const TRAIL_PX = 2.5
/** Most fine cells the display field may hold. The field is sized by canvas AREA, not
 *  by the arena (one cell per ~2.5 px), so without a cap a 4K viewport rasterises 1.3M
 *  cells a frame (measured 5-8 ms of CPU before the upload). 600k is just above a
 *  1440p viewport: below that the 2.5 px line is kept, above it the fine cell grows
 *  (~3.7 px at 4K) and the cost stays flat. */
export const FINE_CAP = 600_000

/** Fine cells per grid cell for a given Cell size: the fine cell lands between 2 and
 *  3 px at every size in the slider's range, so the fine field costs about the same
 *  (one cell per ~2.5 px of canvas) whether the arena is coarse or fine — until the
 *  canvas is large enough to hit `FINE_CAP`, where `sub` steps down instead. */
export function fineSub(cellSize: number, cols = 1, rows = 1): number {
  let sub = Math.max(1, Math.min(8, Math.round(cellSize / TRAIL_PX)))
  while (sub > 1 && cols * rows * sub * sub > FINE_CAP) sub--
  return sub
}

export function makeTrails(cols: number, rows: number, sub = 1): Trails {
  const fcols = cols * sub, frows = rows * sub
  return { cols, rows, color: new Int16Array(cols * rows).fill(-1), strength: new Float32Array(cols * rows),
           sub, fcols, frows, fcolor: new Int16Array(fcols * frows).fill(-1), fstrength: new Float32Array(fcols * frows),
           fineDue: 0 }
}

function mark(color: Int16Array, strength: Float32Array, i: number, k: number, amount: number): void {
  if (color[i] === k || color[i] === -1) {
    color[i] = k
    const v = strength[i] + amount
    strength[i] = v > 1 ? 1 : v
    return
  }
  const v = strength[i] - amount
  if (v > 0) { strength[i] = v; return }
  color[i] = k
  strength[i] = -v > 1 ? 1 : -v
}

/** Deposit into the coarse (recruiting) field only. Tests seed trails with this; the
 *  sim deposits with `depositAt`, so the drawn trail and the recruiting one agree. */
export function deposit(t: Trails, color: number, cell: number, amount: number): void {
  mark(t.color, t.strength, cell, color, amount)
}

/** Deposit at a walker's position (cell units): the coarse cell recruits, the fine
 *  cell under the walker is what gets drawn. Positions are clamped onto the arena. */
export function depositAt(t: Trails, color: number, x: number, y: number, amount: number): void {
  const col = Math.min(t.cols - 1, Math.max(0, Math.floor(x)))
  const row = Math.min(t.rows - 1, Math.max(0, Math.floor(y)))
  mark(t.color, t.strength, row * t.cols + col, color, amount)
  const fc = Math.min(t.fcols - 1, Math.max(0, Math.floor(x * t.sub)))
  const fr = Math.min(t.frows - 1, Math.max(0, Math.floor(y * t.sub)))
  // A walker crosses a fine cell in 1/sub the time it crosses a coarse one, so the
  // deposit is scaled by sub: the drawn line reaches the strength the cell-wide trail
  // used to show, just narrower.
  mark(t.fcolor, t.fstrength, fr * t.fcols + fc, color, amount * t.sub)
}

/** Exponential decay so `halfLife` is literally seconds-to-half. The coarse field
 *  decays here, every sim step (recruitment reads it). The fine field only BANKS the
 *  time: it is display-only and far larger, so `decayFine` settles it when the
 *  renderer next rasterises — exponential decay composes, so a banked 33 ms equals two
 *  16 ms steps exactly. */
export function decay(t: Trails, dt: number, halfLife: number): void {
  const m = Math.exp(-dt * Math.LN2 / halfLife)
  const s = t.strength
  for (let i = 0; i < s.length; i++) s[i] *= m
  t.fineDue += dt
}

/** Apply the fine field's banked decay. Called by the renderer at its raster cadence. */
export function decayFine(t: Trails, halfLife: number): void {
  if (t.fineDue <= 0) return
  const m = Math.exp(-t.fineDue * Math.LN2 / halfLife)
  t.fineDue = 0
  const f = t.fstrength
  for (let i = 0; i < f.length; i++) f[i] *= m
}

/** The colour a blank drone standing on `cell` would adopt, or -1. */
export function recruitColor(t: Trails, cell: number): number {
  return t.strength[cell] > TRAIL_RECRUIT ? t.color[cell] : -1
}

export function clearTrails(t: Trails): void {
  t.color.fill(-1)
  t.strength.fill(0)
  t.fcolor.fill(-1)
  t.fstrength.fill(0)
  t.fineDue = 0
}
