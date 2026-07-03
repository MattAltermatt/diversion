// steering.ts — generic, faction-agnostic steering primitives. Pure, deterministic
// (no rng), zero per-call allocation: each helper ACCUMULATES a weighted contribution
// into a caller-owned 2-float direction accumulator `out` (out[0]=dx, out[1]=dy).
// sim.ts decides which primitives each faction uses and turns the accumulated
// direction into a desired velocity. Unit vectors keep the weights comparable.

/** Push i AWAY from a single point (tx,ty), weighted by w. No falloff. */
export function addAvoid(
  x: number, y: number, tx: number, ty: number, w: number, out: Float32Array,
): void {
  const dx = x - tx, dy = y - ty
  const d = Math.hypot(dx, dy)
  if (d > 1e-6) { out[0] += (dx / d) * w; out[1] += (dy / d) * w }
}

/** Pull i TOWARD (tx,ty), weighted by w (unit direction). */
export function addSeek(
  x: number, y: number, tx: number, ty: number, w: number, out: Float32Array,
): void {
  const dx = tx - x, dy = ty - y
  const d = Math.hypot(dx, dy)
  if (d > 1e-6) { out[0] += (dx / d) * w; out[1] += (dy / d) * w }
}

/** Repel i from every neighbour in `neigh` within `radius` — closer pushes harder
 *  (linear falloff to 0 at the radius edge). Weighted by w. */
export function addFlee(
  px: Float32Array, py: Float32Array, i: number, neigh: number[],
  radius: number, w: number, out: Float32Array,
): void {
  const x = px[i], y = py[i]
  for (const j of neigh) {
    const dx = x - px[j], dy = y - py[j]
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && d < radius) {
      const f = (1 - d / radius) * w
      out[0] += (dx / d) * f; out[1] += (dy / d) * f
    }
  }
}

/** Shove i away from every neighbour in `neigh`, each push falling off LINEARLY to 0 at
 *  `radius` (strong only at genuine overlap, near-nil at rest-packing) and ACCUMULATED —
 *  not normalized. This gives a crowd volume without the pathology the old normalize-to-w
 *  form had: that produced a full-strength shove whose direction flipped to the single
 *  nearest neighbour every step, so in a dense pack the constant `w` noise (> the goal
 *  pull) cancelled coherent motion and the clump froze. Falloff lets the goal win at rest
 *  while still resisting real overlap. Same kernel as addFlee, kept distinct for intent. */
export function addSeparation(
  px: Float32Array, py: Float32Array, i: number, neigh: number[], radius: number, w: number, out: Float32Array,
): void {
  const x = px[i], y = py[i]
  for (const j of neigh) {
    const dx = x - px[j], dy = y - py[j]
    const d = Math.hypot(dx, dy)
    if (d > 1e-6 && d < radius) { const f = (1 - d / radius) * w; out[0] += (dx / d) * f; out[1] += (dy / d) * f }
  }
}

/** Pull i toward the centroid of `neigh` (cohesion / clumping), weighted by w. */
export function addCohesion(
  px: Float32Array, py: Float32Array, i: number, neigh: number[],
  w: number, out: Float32Array,
): void {
  const n = neigh.length
  if (n === 0) return
  let cx = 0, cy = 0
  for (const j of neigh) { cx += px[j]; cy += py[j] }
  addSeek(px[i], py[i], cx / n, cy / n, w, out)
}
