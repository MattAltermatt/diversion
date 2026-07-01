// steering.ts — pure boids + predator steering. Deterministic (no rng); all math
// is a function of positions/velocities/genes. Toroidal (minimum-image) deltas so
// the murmuration stays coherent across the wrapped world edges. Zero per-call
// allocation: flockAccel writes into a caller-owned 2-float `out` scratch and
// iterates predators by count (no temp arrays/objects in the hot loop).
export interface FlockParams {
  separationW: number; alignmentW: number; cohesionW: number
  fearW: number; fearRadius: number; maxForce: number
}

/** Minimum-image delta on a toroidal axis of length `L` (nearest wrapped copy). */
const wrapDelta = (d: number, L: number) => d - L * Math.round(d / L)

// Steering weights are unit-vector×weight (0..~3). Unscaled that's ≤3 px/s² of
// accel — negligible against ~100 px/s flight, so boids fly straight and never
// gather. Scaling to ~px/s² makes the forces strong enough to actually turn a boid
// toward its flock, so a murmuration SELF-ORGANIZES from scattered spawn instead of
// only holding because it started clumped.
const ACCEL_SCALE = 55

/**
 * Flock acceleration for boid `i` over neighbor indices `neigh` (already alive +
 * within perception) and `pn` predators (fear checked here). Writes {ax,ay} into
 * `out[0]`,`out[1]`, clamped to maxForce. All deltas are minimum-image on the
 * `worldW`×`worldH` torus.
 */
export function flockAccel(
  px: Float32Array, py: Float32Array, vx: Float32Array, vy: Float32Array,
  i: number, neigh: number[], pn: number, p: FlockParams,
  ppx: Float32Array, ppy: Float32Array, worldW: number, worldH: number,
  out: Float32Array,
): void {
  let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0
  for (const j of neigh) {
    // dx,dy = vector from j TO i (min-image); cohesion wants the opposite.
    const dx = wrapDelta(px[i] - px[j], worldW)
    const dy = wrapDelta(py[i] - py[j], worldH)
    const d2 = dx * dx + dy * dy || 1e-6
    sepX += dx / d2; sepY += dy / d2 // shove apart, direction weighted by 1/d
    aliX += vx[j]; aliY += vy[j]
    cohX -= dx; cohY -= dy // sum offsets toward neighbors
  }
  let ax = 0, ay = 0
  const n = neigh.length
  if (n > 0) {
    let m = Math.hypot(sepX, sepY)
    if (m > 1e-6) { ax += (sepX / m) * p.separationW; ay += (sepY / m) * p.separationW }
    const avx = aliX / n - vx[i], avy = aliY / n - vy[i]
    m = Math.hypot(avx, avy)
    if (m > 1e-6) { ax += (avx / m) * p.alignmentW; ay += (avy / m) * p.alignmentW }
    const cvx = cohX / n, cvy = cohY / n
    m = Math.hypot(cvx, cvy)
    if (m > 1e-6) { ax += (cvx / m) * p.cohesionW; ay += (cvy / m) * p.cohesionW }
  }
  for (let k = 0; k < pn; k++) {
    const dx = wrapDelta(px[i] - ppx[k], worldW)
    const dy = wrapDelta(py[i] - ppy[k], worldH)
    const d = Math.hypot(dx, dy)
    if (d < p.fearRadius && d > 1e-6) {
      const f = 1 - d / p.fearRadius // inverse falloff — far predators barely tug
      ax += (dx / d) * p.fearW * f; ay += (dy / d) * p.fearW * f
    }
  }
  ax *= ACCEL_SCALE; ay *= ACCEL_SCALE // weights → meaningful px/s² of steering
  const m = Math.hypot(ax, ay)
  if (m > p.maxForce) { ax = (ax / m) * p.maxForce; ay = (ay / m) * p.maxForce }
  out[0] = ax; out[1] = ay
}

/** Aim point ahead of a target along its velocity (predator lead). */
export function predatorAim(
  tx: number, ty: number, tvx: number, tvy: number,
  _hx: number, _hy: number, leadFactor: number,
): { x: number; y: number } {
  const HORIZON = 0.5 // seconds of lead, scaled by the leadFactor gene
  return { x: tx + tvx * leadFactor * HORIZON, y: ty + tvy * leadFactor * HORIZON }
}
