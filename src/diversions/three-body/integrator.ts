// Pure planar three-body integrator — no DOM, no canvas, fully unit-testable.
// Equal masses, gravitational constant G = m1 = m2 = m3 = 1. The state is a flat
// length-12 Float64Array laid out as [positions, velocities]:
//   [ x1,y1, x2,y2, x3,y3,  vx1,vy1, vx2,vy2, vx3,vy3 ]
// A small fixed-step RK4 advances it. There is NO force softening on purpose —
// softening changes the orbit and destroys periodicity; the close two-body
// approaches are handled with a small timestep instead.

/** Scratch buffers so an RK4 step allocates nothing on the hot path. */
export interface RK4Scratch {
  k1: Float64Array
  k2: Float64Array
  k3: Float64Array
  k4: Float64Array
  tmp: Float64Array
}

export function makeScratch(): RK4Scratch {
  return {
    k1: new Float64Array(12),
    k2: new Float64Array(12),
    k3: new Float64Array(12),
    k4: new Float64Array(12),
    tmp: new Float64Array(12),
  }
}

// Body i's position lives at (2i, 2i+1) within the position half of the state.
// The three unordered pairs, precomputed so the force loop stays branch-light.
const PAIRS: readonly [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
]

/** Newtonian accelerations of the three bodies from their positions. Reads the
 *  6 position components of `y` and writes 6 acceleration components into
 *  `out[off .. off+5]`. Allocation-free. */
export function accelerations(y: Float64Array, out: Float64Array, off = 0): void {
  for (let k = 0; k < 6; k++) out[off + k] = 0
  for (let p = 0; p < PAIRS.length; p++) {
    const i = PAIRS[p][0]
    const j = PAIRS[p][1]
    const ix = 2 * i
    const jx = 2 * j
    const dx = y[jx] - y[ix]
    const dy = y[jx + 1] - y[ix + 1]
    const r2 = dx * dx + dy * dy
    const r = Math.sqrt(r2)
    // 1 / r^3 — the pairwise force magnitude factor (m = 1). r is never 0 for a
    // valid periodic orbit; a tiny floor guards a numerically degenerate step.
    const inv = 1 / Math.max(r2 * r, 1e-30)
    const fx = dx * inv
    const fy = dy * inv
    out[off + ix] += fx
    out[off + ix + 1] += fy
    out[off + jx] -= fx
    out[off + jx + 1] -= fy
  }
}

/** Time derivative of the full state: position′ = velocity, velocity′ =
 *  acceleration. Writes into `out` (length 12). Allocation-free. */
export function deriv(y: Float64Array, out: Float64Array): void {
  // position components' derivatives are the velocities
  out[0] = y[6]
  out[1] = y[7]
  out[2] = y[8]
  out[3] = y[9]
  out[4] = y[10]
  out[5] = y[11]
  // velocity components' derivatives are the accelerations
  accelerations(y, out, 6)
}

/** One classical RK4 step of size `dt`, mutating `y` in place. Uses the supplied
 *  scratch so the per-frame render loop allocates nothing. */
export function rk4Step(y: Float64Array, dt: number, s: RK4Scratch): void {
  const { k1, k2, k3, k4, tmp } = s
  deriv(y, k1)
  for (let k = 0; k < 12; k++) tmp[k] = y[k] + 0.5 * dt * k1[k]
  deriv(tmp, k2)
  for (let k = 0; k < 12; k++) tmp[k] = y[k] + 0.5 * dt * k2[k]
  deriv(tmp, k3)
  for (let k = 0; k < 12; k++) tmp[k] = y[k] + dt * k3[k]
  deriv(tmp, k4)
  const c = dt / 6
  for (let k = 0; k < 12; k++) y[k] += c * (k1[k] + 2 * k2[k] + 2 * k3[k] + k4[k])
}

/** Total mechanical energy (kinetic + gravitational potential), G = m = 1. A
 *  faithful integrator conserves this; the test asserts it stays put over a
 *  period. */
export function energy(y: Float64Array): number {
  let ke = 0
  for (let i = 0; i < 3; i++) {
    const vx = y[6 + 2 * i]
    const vy = y[6 + 2 * i + 1]
    ke += 0.5 * (vx * vx + vy * vy)
  }
  let pe = 0
  for (let p = 0; p < PAIRS.length; p++) {
    const i = PAIRS[p][0]
    const j = PAIRS[p][1]
    const dx = y[2 * j] - y[2 * i]
    const dy = y[2 * j + 1] - y[2 * i + 1]
    pe -= 1 / Math.sqrt(dx * dx + dy * dy)
  }
  return ke + pe
}

/** Net linear momentum (Σ m·v, m = 1). Zero-momentum initial conditions keep the
 *  centre of mass fixed at the origin. */
export function momentum(y: Float64Array): { px: number; py: number } {
  return {
    px: y[6] + y[8] + y[10],
    py: y[7] + y[9] + y[11],
  }
}
