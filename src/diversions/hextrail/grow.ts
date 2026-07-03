import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA, sampleCyclic } from '../../framework/gradient'
import type { RGB } from '../../framework/color'
import {
  ArmPhase,
  buildLattice,
  clearLattice,
  edgeMidpoint,
  isHexAvailable,
  type HexCell,
} from './hex'
import type { HextrailConfig } from './schema'

// Palette look-up table: the colour ramp is constant between config edits, so we
// sample it into 256 RGB entries once (in setup / on a colour edit) and the hot
// path just indexes by u — no per-frame array rebuild or hex re-parse.
const LUT_SIZE = 256
export function buildPalette(cfg: HextrailConfig): RGB[] {
  const stops = cfg.colors.map((c) => c + 'ff')
  const lut: RGB[] = new Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const u = i / (LUT_SIZE - 1)
    const c = cfg.colorWrap ? sampleCyclic(stops, u) : sampleGradientRGBA(stops, u)
    lut[i] = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }
  }
  return lut
}

// ─── Hextrail growth ─────────────────────────────────────────────────────────
// Arms grow outward along the lattice as a sparse tree. Every edge is drawn in two
// forward legs: the origin hex grows centre→edge (OUT), then the neighbour grows
// edge→its-centre (IN) and only THEN sprouts its own 1..N arms toward empty
// neighbours. A global active-arm cap + a queue keep the wavefront thin and calm.
// When the front exhausts below the fill target we inject a fresh seed (never a
// dead frame); at the target we hold, then fade and reseed. All randomness seeded.

const MAX_DT = 250 // ms — background-tab catch-up guard
const SPEED_JITTER = 0.4 // ±20% per-arm speed variation

/** A completed leg, baked once into the accumulation buffer. */
export interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
  u: number // representative colour scalar for this leg
}

export interface ArmRef {
  hex: HexCell
  dir: number
}

export type Phase = 'grow' | 'hold' | 'fade'

export interface HexState {
  cfg: HextrailConfig
  cells: HexCell[]
  centerCell: HexCell
  rng: () => number
  activeArms: ArmRef[] // arms currently OUT or IN
  pendingSprouts: HexCell[] // hexes whose incoming leg finished, waiting to sprout
  capturedCount: number
  phase: Phase
  holdMs: number
  fadeMs: number
  w: number
  h: number
  newSegments: Segment[] // legs completed this frame → render bakes them
  cycle: number // reseed counter (for the record; growth stays on one rng stream)
  palette: RGB[] // 256-entry colour LUT, rebuilt only on a colour edit
}

/** Endpoints of a leg (full, ratio 0→1) for hex/dir/phase. OUT: centre→edge; IN:
 *  edge→centre. `hex.neighbors[dir]` is the origin for IN, the target for OUT. */
export function legEndpoints(hex: HexCell, dir: number, phase: ArmPhase) {
  const n = hex.neighbors[dir]!
  const mid = edgeMidpoint(hex, n)
  if (phase === ArmPhase.OUT) return { sx: hex.cx, sy: hex.cy, ex: mid.x, ey: mid.y }
  return { sx: mid.x, sy: mid.y, ex: hex.cx, ey: hex.cy }
}

/** Representative colour for a leg: hex's own u weighted 3:1 against its neighbour,
 *  so the two legs of an edge drift smoothly from one hex's colour to the other's. */
function legU(hex: HexCell, dir: number): number {
  const n = hex.neighbors[dir]!
  return (3 * hex.u + n.u) / 4
}

/** Child colour: inherit the parent's u, with `driftChance` to step one palette stop. */
function driftU(parentU: number, state: HexState): number {
  const { cfg, rng } = state
  if (rng() >= cfg.driftChance) return parentU
  const step = 1 / (cfg.colors.length - 1)
  if (cfg.colorWrap) return (parentU + step) % 1
  return Math.min(1, parentU + step)
}

function captureHex(state: HexState, h: HexCell, u: number): void {
  if (!h.captured) {
    h.captured = true
    state.capturedCount++
  }
  h.u = u
}

function armSpeed(state: HexState): number {
  const jitter = 1 - SPEED_JITTER / 2 + state.rng() * SPEED_JITTER
  return (state.cfg.growthSpeed / 1000) * jitter
}

/** Fisher-Yates shuffle in place using the seeded stream. */
function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/** Sprout 1..N arms from `h` toward available (entirely-empty) neighbours. */
function addArms(state: HexState, h: HexCell): void {
  const cands: number[] = []
  for (let j = 0; j < 6; j++) {
    const n = h.neighbors[j]
    if (n && isHexAvailable(n)) cands.push(j)
  }
  if (cands.length === 0) return
  shuffle(cands, state.rng)

  // Branch count: always ≥1, each extra arm gated on branchiness (weighted toward 1).
  let target = 1
  while (target < 4 && state.rng() < state.cfg.branchiness) target++
  target = Math.min(target, cands.length)

  for (let k = 0; k < target; k++) {
    const j = cands[k]
    const n = h.neighbors[j]!
    const opp = (j + 3) % 6
    const speed = armSpeed(state)
    h.arms[j].phase = ArmPhase.OUT
    h.arms[j].ratio = 0
    h.arms[j].speed = speed
    n.arms[opp].phase = ArmPhase.WAIT
    n.arms[opp].ratio = 0
    n.arms[opp].speed = speed
    captureHex(state, n, driftU(h.u, state))
    state.activeArms.push({ hex: h, dir: j })
  }
}

function randomAvailableCell(state: HexState): HexCell | null {
  const avail = state.cells.filter(isHexAvailable)
  if (avail.length === 0) return null
  return avail[Math.floor(state.rng() * avail.length)]
}

function plantSeeds(state: HexState): void {
  const seedU = state.cfg.colorWrap ? state.rng() : 0
  // First seed at (or near) centre for a coherent central bloom.
  captureHex(state, state.centerCell, seedU)
  state.pendingSprouts.push(state.centerCell)
  for (let s = 1; s < state.cfg.seeds; s++) {
    const c = randomAvailableCell(state)
    if (!c) break
    captureHex(state, c, state.cfg.colorWrap ? state.rng() : 0)
    state.pendingSprouts.push(c)
  }
}

function nearestToCenter(cells: HexCell[], w: number, h: number): HexCell {
  let best = cells[0]
  let bestD = Infinity
  for (const c of cells) {
    const d = (c.cx - w / 2) ** 2 + (c.cy - h / 2) ** 2
    if (d < bestD) { bestD = d; best = c }
  }
  return best
}

export function createHexState(cfg: HextrailConfig, w: number, h: number): HexState {
  const cells = buildLattice(w, h, cfg.hexSize)
  const state: HexState = {
    cfg,
    cells,
    centerCell: nearestToCenter(cells, w, h),
    rng: mulberry32(cfg.seed >>> 0),
    activeArms: [],
    pendingSprouts: [],
    capturedCount: 0,
    phase: 'grow',
    holdMs: 0,
    fadeMs: 0,
    w,
    h,
    newSegments: [],
    cycle: 0,
    palette: buildPalette(cfg),
  }
  plantSeeds(state)
  return state
}

/** Restart growth on the same lattice, continuing the same rng stream (deterministic). */
function reseed(state: HexState): void {
  clearLattice(state.cells)
  state.activeArms.length = 0
  state.pendingSprouts.length = 0
  state.capturedCount = 0
  state.phase = 'grow'
  state.holdMs = 0
  state.fadeMs = 0
  state.cycle++
  plantSeeds(state)
}

/** Advance the sim by dt ms. Fills `newSegments` with legs completed this frame. */
export function stepHex(state: HexState, dt: number): void {
  state.newSegments.length = 0
  const d = Math.min(dt, MAX_DT)

  if (state.phase === 'hold') {
    state.holdMs += d
    if (state.holdMs >= state.cfg.holdSeconds * 1000) { state.phase = 'fade'; state.fadeMs = 0 }
    return
  }
  if (state.phase === 'fade') {
    state.fadeMs += d
    if (state.fadeMs >= state.cfg.fadeSeconds * 1000) reseed(state)
    return
  }

  // ── grow ──
  // 1. Drain queued sprouts up to the active-arm cap (throttles rate, loses nothing).
  while (state.activeArms.length < state.cfg.maxDoing && state.pendingSprouts.length > 0) {
    addArms(state, state.pendingSprouts.shift()!)
  }

  // 2. Advance every active arm; compact survivors in place.
  const active = state.activeArms
  let w = 0
  for (let i = 0; i < active.length; i++) {
    const ref = active[i]
    const arm = ref.hex.arms[ref.dir]
    arm.ratio += arm.speed * d
    if (arm.ratio < 1) {
      active[w++] = ref // still growing
      continue
    }
    // leg complete → bake it
    const { sx, sy, ex, ey } = legEndpoints(ref.hex, ref.dir, arm.phase)
    state.newSegments.push({ x0: sx, y0: sy, x1: ex, y1: ey, u: legU(ref.hex, ref.dir) })
    if (arm.phase === ArmPhase.OUT) {
      arm.phase = ArmPhase.DONE
      // Hand off: neighbour's paired WAIT arm becomes IN and starts growing.
      const n = ref.hex.neighbors[ref.dir]!
      const opp = (ref.dir + 3) % 6
      n.arms[opp].phase = ArmPhase.IN
      n.arms[opp].ratio = 0
      active[w++] = { hex: n, dir: opp }
    } else {
      // IN complete → this hex has fully arrived; queue it to sprout.
      arm.phase = ArmPhase.DONE
      state.pendingSprouts.push(ref.hex)
    }
  }
  active.length = w

  // 3. Front exhausted? Inject a seed to reach the fill target, else hold.
  if (active.length === 0 && state.pendingSprouts.length === 0) {
    const coverage = state.capturedCount / state.cells.length
    if (coverage < state.cfg.fillFraction) {
      const c = randomAvailableCell(state)
      if (c) {
        captureHex(state, c, state.cfg.colorWrap ? state.rng() : 0)
        state.pendingSprouts.push(c)
        return
      }
    }
    state.phase = 'hold'
    state.holdMs = 0
  }
}

/** Live-apply a config edit. Structural changes (lattice size, seed) → full re-setup. */
export function updateHexState(state: HexState, cfg: HextrailConfig): boolean {
  if (cfg.hexSize !== state.cfg.hexSize || cfg.seed !== state.cfg.seed || cfg.seeds !== state.cfg.seeds) {
    return false
  }
  state.cfg = cfg
  state.palette = buildPalette(cfg) // cheap; runs only on a config edit, never per frame
  return true
}

export function resizeHexState(state: HexState, w: number, h: number): void {
  state.w = w
  state.h = h
  state.cells = buildLattice(w, h, state.cfg.hexSize)
  state.centerCell = nearestToCenter(state.cells, w, h)
  state.activeArms.length = 0
  state.pendingSprouts.length = 0
  state.capturedCount = 0
  state.phase = 'grow'
  state.holdMs = 0
  state.fadeMs = 0
  plantSeeds(state)
}
