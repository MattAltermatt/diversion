// steering.ts — pure Reynolds boids steering (separation + alignment + cohesion,
// plus an optional predator fear term). Deterministic; no rng. Distances are
// minimum-image on a toroidal world when `wrap` is true, plain deltas otherwise —
// caller picks per the diversion's edgeMode. Zero per-call allocation: writes
// {ax,ay} into a caller-owned 2-float `out` scratch.
export interface FlockParams {
  separationW: number
  alignmentW: number
  cohesionW: number
  fearW: number
  fearRadius: number
}

const wrapDelta = (d: number, L: number) => d - L * Math.round(d / L)

// Weights are unit-vector×weight (0..~2 each). Unscaled that's only a few units/s²
// of accel — negligible against the tens-to-hundreds units/s of flight speed, so
// boids would fly straight and never gather. Scaling to world-units/s² makes the
// forces strong enough to actually turn a boid toward its flock within a fraction
// of a second, so a murmuration SELF-ORGANIZES from a dispersed spawn.
const ACCEL_SCALE = 220

/**
 * Flock acceleration for boid `i` over neighbor indices `neigh` (already within
 * perception). Writes {ax,ay} into `out[0]`,`out[1]` — UNCLAMPED (the caller sums
 * this with any edge-steer force and clamps once, so a single force doesn't get
 * double-clamped away). All deltas are minimum-image on the `worldW`×`worldH`
 * torus when `wrap` is true.
 */
export function flockAccel(
  px: Float32Array, py: Float32Array, vx: Float32Array, vy: Float32Array,
  i: number, neigh: number[], p: FlockParams,
  worldW: number, worldH: number, wrap: boolean,
  predX: number, predY: number, hasPredator: boolean,
  out: Float32Array,
): void {
  let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0
  for (const j of neigh) {
    // dx,dy = vector from j TO i (min-image); cohesion wants the opposite.
    let dx = px[i] - px[j], dy = py[i] - py[j]
    if (wrap) { dx = wrapDelta(dx, worldW); dy = wrapDelta(dy, worldH) }
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
  if (hasPredator) {
    let dx = px[i] - predX, dy = py[i] - predY
    if (wrap) { dx = wrapDelta(dx, worldW); dy = wrapDelta(dy, worldH) }
    const d = Math.hypot(dx, dy)
    if (d < p.fearRadius && d > 1e-6) {
      const f = 1 - d / p.fearRadius // inverse falloff — a distant predator barely tugs
      ax += (dx / d) * p.fearW * f; ay += (dy / d) * p.fearW * f
    }
  }
  out[0] = ax * ACCEL_SCALE; out[1] = ay * ACCEL_SCALE
}
