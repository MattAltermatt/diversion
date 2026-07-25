// chime.ts — framework-agnostic simulation of a field of excitable wells.
//
// Every well sits still and fills with energy at its own rate up to its own
// capacity. When it tops out it RELEASES everything it holds as a single
// expanding ripple whose maximum radius is exactly the energy released — so a
// big, slow well washes the whole screen and a small one barely clears its
// neighbours. A ripple is at full strength at its source and fades linearly to
// nothing at the edge of its reach; when its leading edge sweeps over another
// well that is charged enough and out of its refractory period, that well
// releases too — dumping only what it happens to hold at that moment. Cascades
// therefore produce a spectrum of ripple sizes, and the giants only ever happen
// where the field has been quiet long enough for someone to fill right up.
//
// This is an excitable medium (integrate-and-fire + refractory) whose coupling
// is a travelling front rather than an instant neighbourhood nudge — the delay
// is what makes the patterns: expanding rings, chains, and standing interference.
//
// Positions live in a normalized [0,1]² square and every radius/distance is a
// fraction of the screen DIAGONAL, so the sim is viewport-independent (a resize
// never regenerates the field). All randomness is seeded (mulberry32).

import { mulberry32 } from '../../framework/rng'
import type { ChimeConfig } from './schema'

/** Smallest capacity a well can be dealt (fraction of a full well). */
const MIN_CAPACITY = 0.12
/** Floor on a released ripple's reach, so a near-empty release still shows. */
const MIN_RIPPLE_REACH = 0.015
/** Below this stored energy a well has nothing worth releasing. */
const MIN_RELEASE_ENERGY = 1e-3
/** Seconds for the visual release flare to decay (look only — not the sim). */
const FLARE_DECAY = 0.5

export interface ChimeState {
  cfg: ChimeConfig
  w: number
  h: number
  n: number
  // Per-well state (structure-of-arrays), positions normalized 0..1.
  nx: Float32Array
  ny: Float32Array
  cap: Float32Array // capacity, MIN_CAPACITY..1
  rate: Float32Array // energy / sec
  refrMul: Float32Array // per-well multiplier on the refractory period
  tint: Float32Array // 0..1 fixed palette position (colorBy: 'well')
  energy: Float32Array
  refr: Float32Array // seconds of refractory left
  flare: Float32Array // 0..1 release flash, decays (render only)
  // Ripple pool (swap-removed; `rn` live, `rcap` allocated).
  rcap: number
  rn: number
  rx: Float32Array // centre, normalized
  ry: Float32Array
  rr: Float32Array // current radius, diagonal fractions
  rprev: Float32Array // radius at the previous step (crossing test)
  rmax: Float32Array // reach, diagonal fractions
  renergy: Float32Array // energy released, 0..1 (colorBy: 'energy')
  rtint: Float32Array // source well's tint (colorBy: 'well')
  rsrc: Int32Array
  // Palette LUT cache ([r,g,b] triples), rebuilt when the palette changes.
  lutKey: string
  lut: number[][]
}

/** Place `n` wells in the unit square per the layout mode. Deterministic. */
function placeWells(
  n: number, layout: ChimeConfig['layout'], rng: () => number,
  nx: Float32Array, ny: Float32Array,
): void {
  if (layout === 'grid') {
    // Jittered lattice — enough regularity for the ripples to build clean
    // interference, enough jitter to avoid a dead-mechanical read.
    const cols = Math.max(1, Math.round(Math.sqrt(n)))
    const rows = Math.max(1, Math.ceil(n / cols))
    for (let i = 0; i < n; i++) {
      const cx = i % cols
      const cy = (i / cols) | 0
      nx[i] = (cx + 0.5 + (rng() - 0.5) * 0.45) / cols
      ny[i] = (cy + 0.5 + (rng() - 0.5) * 0.45) / rows
    }
    return
  }
  if (layout === 'scatter') {
    for (let i = 0; i < n; i++) { nx[i] = rng(); ny[i] = rng() }
    return
  }
  // 'even' — dart-throwing blue noise: keep the best-separated candidate, so the
  // field has no clumps or voids but stays organic. Bounded attempts (never loops).
  const minDist = 0.62 / Math.sqrt(n)
  const min2 = minDist * minDist
  for (let i = 0; i < n; i++) {
    let bx = rng()
    let by = rng()
    let bestGap = -1
    for (let attempt = 0; attempt < 12; attempt++) {
      const x = attempt === 0 ? bx : rng()
      const y = attempt === 0 ? by : rng()
      let gap = Infinity
      for (let j = 0; j < i; j++) {
        const dx = nx[j] - x
        const dy = ny[j] - y
        const d2 = dx * dx + dy * dy
        if (d2 < gap) gap = d2
      }
      if (gap > bestGap) { bestGap = gap; bx = x; by = y }
      if (gap >= min2) break
    }
    nx[i] = bx
    ny[i] = by
  }
}

/** Build the field from a seed. Deterministic for a given (config, seed). */
export function createChimeState(cfg: ChimeConfig, w: number, h: number): ChimeState {
  const n = cfg.nodeCount
  const rng = mulberry32(cfg.seed >>> 0)

  const nx = new Float32Array(n)
  const ny = new Float32Array(n)
  placeWells(n, cfg.layout, rng, nx, ny)

  const cap = new Float32Array(n)
  const rate = new Float32Array(n)
  const refrMul = new Float32Array(n)
  const tint = new Float32Array(n)
  const energy = new Float32Array(n)

  // Skewing the capacity draw makes giants RARE without making them impossible:
  // u^1 is uniform, u^5 is mostly-small-with-a-few-monsters.
  const skew = 1 + cfg.sizeSkew * 4
  for (let i = 0; i < n; i++) {
    cap[i] = MIN_CAPACITY + (1 - MIN_CAPACITY) * Math.pow(rng(), skew)
    rate[i] = Math.max(0.004, cfg.chargeSpeed * (1 + cfg.rateSpread * (rng() * 2 - 1)))
    refrMul[i] = 0.7 + rng() * 0.6
    tint[i] = rng()
    // Start part-charged (and never all at once) so the field opens mid-conversation.
    energy[i] = rng() * cap[i] * 0.9
  }

  // A well can ring again while its previous ripple is still travelling, so the
  // pool needs headroom over n. Fixed at setup — no allocation in the hot loop.
  const rcap = Math.max(64, n * 3)

  return {
    cfg, w, h, n,
    nx, ny, cap, rate, refrMul, tint, energy,
    refr: new Float32Array(n),
    flare: new Float32Array(n),
    rcap,
    rn: 0,
    rx: new Float32Array(rcap),
    ry: new Float32Array(rcap),
    rr: new Float32Array(rcap),
    rprev: new Float32Array(rcap),
    rmax: new Float32Array(rcap),
    renergy: new Float32Array(rcap),
    rtint: new Float32Array(rcap),
    rsrc: new Int32Array(rcap),
    lutKey: '',
    lut: [],
  }
}

/** Release well `i`: dump everything it holds as one ripple, then go deaf. */
function release(s: ChimeState, i: number): void {
  const e = s.energy[i]
  s.energy[i] = 0
  s.refr[i] = s.cfg.refractory * s.refrMul[i]
  s.flare[i] = 1
  if (e < MIN_RELEASE_ENERGY || s.rn >= s.rcap) return
  const k = s.rn++
  s.rx[k] = s.nx[i]
  s.ry[k] = s.ny[i]
  s.rr[k] = 0
  s.rprev[k] = 0
  s.rmax[k] = Math.max(MIN_RIPPLE_REACH, e * s.cfg.reach)
  s.renergy[k] = e
  s.rtint[k] = s.tint[i]
  s.rsrc[k] = i
}

/** Drop ripple `k` by swapping the last live one into its slot. */
function killRipple(s: ChimeState, k: number): void {
  const last = --s.rn
  if (k !== last) {
    s.rx[k] = s.rx[last]; s.ry[k] = s.ry[last]
    s.rr[k] = s.rr[last]; s.rprev[k] = s.rprev[last]
    s.rmax[k] = s.rmax[last]; s.renergy[k] = s.renergy[last]
    s.rtint[k] = s.rtint[last]; s.rsrc[k] = s.rsrc[last]
  }
}

/** Advance the field by `dtSec` seconds. Deterministic given (state, dt).
 *
 *  `tempo` dilates time for the WHOLE piece: charging, wave travel, refractory
 *  recovery and the wake all live in sim-seconds, so scaling dt slows every one
 *  of them by the same factor. Release rate falls by `tempo` while each ripple
 *  lives 1/tempo longer, which leaves the number of fronts on screen — and so
 *  the composition at any instant — unchanged. That's what makes it a pace knob
 *  rather than a density knob. */
export function stepChime(state: ChimeState, dtSec: number): void {
  const { cfg, n, cap, rate, energy, refr, flare } = state
  // Clamp dt so a throttled/background tab can't teleport the sim (and can't
  // make a wavefront jump over a whole well without ever touching it). Clamped
  // again after the tempo scale so speeding time up can't reopen that hole.
  const dt = Math.min(Math.max(dtSec, 0) * cfg.tempo, 0.05)
  if (dt === 0) return
  const diag = Math.hypot(state.w, state.h) || 1
  const flareDecay = Math.exp(-dt / FLARE_DECAY)

  // 1) Charge every well; anything that tops out (and has recovered) rings.
  for (let i = 0; i < n; i++) {
    if (refr[i] > 0) refr[i] = Math.max(0, refr[i] - dt)
    flare[i] *= flareDecay
    const e = energy[i] + rate[i] * dt
    energy[i] = e < cap[i] ? e : cap[i]
    if (energy[i] >= cap[i] && refr[i] <= 0) release(state, i)
  }

  // 2) Expand every ripple and fire whatever its leading edge sweeps over.
  //    Releases append to the pool; those new ripples start at radius 0 and are
  //    simply picked up by this same loop (their first step is one frame short —
  //    sub-pixel, and it keeps the cascade single-pass).
  const speed = cfg.waveSpeed
  const sens = cfg.sensitivity
  const shield = cfg.depthShield
  const minCharge = cfg.minCharge
  let k = 0
  while (k < state.rn) {
    const prev = state.rr[k]
    const r = prev + speed * dt
    if (r >= state.rmax[k]) { killRipple(state, k); continue }
    state.rprev[k] = prev
    state.rr[k] = r

    const cx = state.rx[k] * state.w
    const cy = state.ry[k] * state.h
    const invMax = 1 / state.rmax[k]
    const src = state.rsrc[k]
    for (let j = 0; j < n; j++) {
      if (j === src || refr[j] > 0) continue
      if (energy[j] < minCharge * cap[j] || energy[j] < MIN_RELEASE_ENERGY) continue
      const dx = state.nx[j] * state.w - cx
      const dy = state.ny[j] * state.h - cy
      const d = Math.sqrt(dx * dx + dy * dy) / diag
      // The front swept across this well during THIS step (each ripple can only
      // ever reach a given well once — the radius is monotonic).
      if (d <= prev || d > r) continue
      // A deep well is harder to disturb than a shallow one. Without this the
      // biggest wells are ALWAYS tipped part-charged by the ambient chatter long
      // before they fill, and a screen-wide release is structurally impossible.
      const thr = sens + (1 - sens) * shield * cap[j] * cap[j]
      if (1 - d * invMax < thr) continue
      release(state, j)
    }
    k++
  }
}

/** Palette position 0..1 for ripple `k` under the current colour mode. In 'energy'
 *  mode the low end is floored well above 0: the smallest releases are the most
 *  common, and parked on the palette's darkest stop they'd be invisible against
 *  the ground (invariant #5 — err toward contrast). */
export function rippleTone(s: ChimeState, k: number): number {
  switch (s.cfg.colorBy) {
    case 'well': return s.rtint[k]
    case 'age': return s.rr[k] / s.rmax[k]
    default: return 0.15 + 0.85 * Math.min(1, s.renergy[k])
  }
}

/** Wave strength at the leading edge right now: 1 at the source, 0 at the reach. */
export function rippleAmplitude(s: ChimeState, k: number): number {
  const a = 1 - s.rr[k] / s.rmax[k]
  return a > 0 ? a : 0
}
