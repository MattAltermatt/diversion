import { mulberry32 } from '../../framework/rng'
import type { Size } from '../../framework/types'
import { buildTessellation, type Tessellation } from './tessellation'
import { buildHueRing } from './colorRing'
import type { DemonConfig } from './schema'

export interface DemonState {
  cfg: DemonConfig
  w: number; h: number
  tess: Tessellation
  n: number
  kEff: number; tEff: number
  cur: Uint8Array; next: Uint8Array
  lut: string[]
  changed: number[]
  acc: number
  needsClear: boolean
  step: number        // generations since the last (re)seed
  quietSteps: number  // consecutive near-frozen generations (reseed trigger)
  reseedCount: number // folds the seed so each reseed grows a different world
}

// Reseed lifecycle (#194): a cyclic CA reaches an absorbing fixed point where no cell
// flips and then stays frozen forever — defeating the screensaver premise. Detect that
// with an ABSOLUTE changed-cell threshold (a live demon cycles hundreds of cells/gen
// across the full grid; a frozen one changes 0) and reseed. Absolute — not grid-
// proportional — per [[gotcha-ca-quiescence-absolute-threshold]].
const QUIET_THRESHOLD = 4  // ≤ this many flips/gen counts as "near-frozen"
const QUIET_WINDOW = 45    // that many consecutive near-frozen gens → reseed (~5s at 8/s)
const MIN_STEPS = 45       // never reseed before this many gens (let it organize first)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Fill an occupancy array with fresh uniform noise over `n` colors. */
function fillNoise(arr: Uint8Array, n: number, rng: () => number): void {
  for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(rng() * n)
}

function clampK(reach: number, n: number): number {
  return clamp(reach, 1, Math.max(1, Math.floor((n - 1) / 2)))
}
function makeLut(cfg: DemonConfig): string[] {
  return buildHueRing(cfg.colors, cfg.color.hueStart, cfg.color.hueSpan, cfg.color.saturation, cfg.color.lightness)
}

export function createDemonState(cfg: DemonConfig, w: number, h: number): DemonState {
  const tess = buildTessellation(cfg.field, cfg.cellSize, w, h)
  const n = cfg.colors
  const cur = new Uint8Array(tess.cellCount)
  fillNoise(cur, n, mulberry32(cfg.seed >>> 0))
  return {
    cfg, w, h, tess, n,
    kEff: clampK(cfg.dominanceReach, n),
    tEff: clamp(cfg.threshold, 1, tess.degree),
    cur, next: new Uint8Array(tess.cellCount),
    lut: makeLut(cfg),
    changed: [],
    acc: 0,
    needsClear: true,
    step: 0, quietSteps: 0, reseedCount: 0,
  }
}

/** Re-noise the grid with a folded seed → a fresh world after an absorbing freeze.
 *  Resets the lifecycle counters and flags a full repaint. */
export function reseedDemon(st: DemonState): void {
  st.reseedCount++
  const folded = ((st.cfg.seed >>> 0) ^ Math.imul(st.reseedCount, 0x9e3779b1)) >>> 0
  fillNoise(st.cur, st.n, mulberry32(folded))
  st.step = 0
  st.quietSteps = 0
  st.needsClear = true
}

/** True once the CA has settled into an absorbing/near-frozen state and should reseed.
 *  Call after `stepDemon`; drives the reseed lifecycle from `frame`. */
export function shouldReseedDemon(st: DemonState): boolean {
  return st.step >= MIN_STEPS && st.quietSteps >= QUIET_WINDOW
}

/** One synchronous CA generation. Fills `changed` with indices whose color flipped. */
export function stepDemon(st: DemonState): void {
  const { cur, next, tess, n, kEff, tEff } = st
  const { nbrStart, nbrIdx } = tess
  const changed = st.changed
  changed.length = 0
  for (let i = 0; i < cur.length; i++) {
    const c = cur[i]
    let result = c
    const start = nbrStart[i], end = nbrStart[i + 1]
    for (let j = 1; j <= kEff; j++) {
      const p = (c + j) % n
      let cnt = 0
      for (let e = start; e < end; e++) {
        if (cur[nbrIdx[e]] === p) { cnt++; if (cnt >= tEff) break }
      }
      if (cnt >= tEff) { result = p; break }
    }
    next[i] = result
    if (result !== c) changed.push(i)
  }
  st.cur = next
  st.next = cur
  st.step++
  // Absorbing-state detection: a live demon flips hundreds of cells/gen; a frozen one
  // flips ≤ QUIET_THRESHOLD. Count consecutive near-frozen gens — reseed after a window.
  if (changed.length <= QUIET_THRESHOLD) st.quietSteps++
  else st.quietSteps = 0
}

/** Live-apply tunable params; return false to force a structural rebuild. */
export function updateDemonState(st: DemonState, cfg: DemonConfig, _size: Size): boolean {
  if (cfg.field !== st.cfg.field || cfg.cellSize !== st.cfg.cellSize
      || cfg.colors !== st.cfg.colors || cfg.seed !== st.cfg.seed) {
    return false // structural: grid geometry or state-space changed → teardown + setup
  }
  // A full-grid repaint is only needed when current pixels actually change colour —
  // a recolor (palette/hue/sat/light → new lut) or a background change. Pure-dynamics
  // tweaks (speed/threshold/dominanceReach) leave the painted field untouched, so
  // dragging those sliders shouldn't trigger a needless repaint of every cell.
  const bgChanged = cfg.background !== st.cfg.background
  const newLut = makeLut(cfg)
  const lutChanged = newLut.length !== st.lut.length || newLut.some((c, i) => c !== st.lut[i])
  st.cfg = cfg
  st.kEff = clampK(cfg.dominanceReach, st.n)
  st.tEff = clamp(cfg.threshold, 1, st.tess.degree)
  st.lut = newLut
  st.quietSteps = 0 // dynamics just changed → give the new regime a fresh quiescence window
  st.needsClear = lutChanged || bgChanged
  return true
}

/** Rebuild the grid for a new canvas size (reseeds noise). */
export function resizeDemonState(st: DemonState, size: Size): void {
  const fresh = createDemonState(st.cfg, size.width, size.height)
  Object.assign(st, fresh)
}
