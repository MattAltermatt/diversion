import { mulberry32 } from '../../framework/rng'
import type { Field } from './field'
import { sampleIntensity } from './field'
import type { SlimeAggregationConfig } from './schema'
import type { Pacemaker } from './field'

// The streaming amoebae — a black-box agent layer on top of the excitable field.
//
// Real Dictyostelium chemotaxis is TEMPORAL, not a naive walk up the instantaneous
// spatial gradient: a cell only responds while the local cAMP concentration is
// *rising* (the wavefront is arriving), and desensitizes once it peaks. That
// distinction matters here because the field's intensity profile PEAKS at a
// wave's freshest (outermost, leading) edge and decays backward through its
// RECOVER tail toward the source — so a spatial gradient sampled anywhere inside
// an already-passed wave points toward the (retreating) front, i.e. AWAY from the
// pacemaker. Sampled at the exact ignition tick, though — the instant an agent's
// own cell flips from REST to WAVE — the gradient is trustworthy: the outward
// neighbor is still unexcited (0) and the inward (source-side) neighbor is still
// near-peak (it ignited a tick earlier, as the same front swept past it), so
// ascent correctly points source-ward. Since a cell's intensity rises for exactly
// that one ignition tick and then strictly decays through the rest of WAVE and all
// of RECOVER (until it heals back to REST and can catch a future pulse), gating
// movement on "intensity just rose since last tick" naturally restricts each
// amoeba to stepping only at that correct instant — one pulsatile surge per wave
// passage, walking it toward the nearest pacemaker over repeated pulses. One-way
// coupling by design: the field drives the agents; agents don't re-ignite the
// field, keeping the excitable medium's own dynamics simple to tune independently.
export const WAVE_RESPONSE_THRESHOLD = 0.22
// Normalized-world tap distance used to estimate the local gradient (~1.5 field
// cells at a typical cellSize/canvas ratio — enough to detect a real wavefront
// without being fooled by a single-cell speckle).
const GRADIENT_TAP = 0.012

// Minimum tick-over-tick rise in sampled intensity to count as "the wavefront
// just arrived" (vs. float noise). The field's real jump is REST(0) → WAVE
// (~0.7-1.0), far above this — this just guards the comparison.
const RISE_EPS = 0.05

export interface AgentSwarm {
  x: Float32Array // normalized [0,1) world position
  y: Float32Array
  moving: Uint8Array // 1 while riding a wave this frame (drives trail deposit + render)
  prevIntensity: Float32Array // last tick's sampled local intensity (temporal-rise gate)
}

export function createAgents(seed: number, count: number): AgentSwarm {
  const rng = mulberry32((seed ^ 0x68e31da4) >>> 0)
  const x = new Float32Array(count)
  const y = new Float32Array(count)
  for (let i = 0; i < count; i++) { x[i] = rng(); y[i] = rng() }
  return { x, y, moving: new Uint8Array(count), prevIntensity: new Float32Array(count) }
}

/** One chemotaxis step for a single agent. `prevHere` is this agent's intensity
 *  reading from the previous tick — movement is gated on the signal having just
 *  risen (the wavefront's ignition tick, the one instant the spatial gradient
 *  reliably points toward the source; see the module comment). Returns the new
 *  position, whether it moved, and this tick's intensity (for the caller to carry
 *  forward as next tick's `prevHere`). */
export function stepAgent(
  field: Field, cfg: SlimeAggregationConfig, x: number, y: number, prevHere: number, dtSec: number,
): { x: number; y: number; moved: boolean; here: number } {
  const here = sampleIntensity(field, cfg, x, y)
  if (here < WAVE_RESPONSE_THRESHOLD || here < prevHere + RISE_EPS) return { x, y, moved: false, here }
  const ixp = sampleIntensity(field, cfg, x + GRADIENT_TAP, y)
  const ixm = sampleIntensity(field, cfg, x - GRADIENT_TAP, y)
  const iyp = sampleIntensity(field, cfg, x, y + GRADIENT_TAP)
  const iym = sampleIntensity(field, cfg, x, y - GRADIENT_TAP)
  let gx = ixp - ixm
  let gy = iyp - iym
  const mag = Math.hypot(gx, gy)
  if (mag < 1e-5) return { x, y, moved: false, here }
  gx /= mag; gy /= mag
  const step = cfg.chemotaxisStrength * dtSec
  const nx = (((x + gx * step) % 1) + 1) % 1
  const ny = (((y + gy * step) % 1) + 1) % 1
  return { x: nx, y: ny, moved: true, here }
}

/** Advance the whole swarm one step in place. */
export function stepAgents(agents: AgentSwarm, field: Field, cfg: SlimeAggregationConfig, dtSec: number): void {
  const { x, y, moving, prevIntensity } = agents
  for (let i = 0; i < x.length; i++) {
    const r = stepAgent(field, cfg, x[i], y[i], prevIntensity[i], dtSec)
    x[i] = r.x; y[i] = r.y
    moving[i] = r.moved ? 1 : 0
    prevIntensity[i] = r.here
  }
}

/** Fraction of agents currently within `radius` (normalized world units) of
 *  their nearest pacemaker — the "how converged is the aggregation" signal the
 *  reseed lifecycle watches for the mound-formed payoff. */
export function aggregationFraction(agents: AgentSwarm, pacemakers: Pacemaker[], radius: number): number {
  if (agents.x.length === 0 || pacemakers.length === 0) return 0
  const r2 = radius * radius
  let count = 0
  for (let i = 0; i < agents.x.length; i++) {
    const ax = agents.x[i], ay = agents.y[i]
    let best = Infinity
    for (const pm of pacemakers) {
      const dx = ax - pm.nx, dy = ay - pm.ny
      const d = dx * dx + dy * dy
      if (d < best) best = d
    }
    if (best <= r2) count++
  }
  return count / agents.x.length
}
