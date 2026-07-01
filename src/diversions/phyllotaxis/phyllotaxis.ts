// Pure phyllotaxis geometry + sweep motion. No DOM, no framework — unit-tested.
//
// Each floret k sits at angle k·divergence (+ a tiny seeded wobble) and radius
// spacing·√k, centred at the origin. That single golden-angle rule makes the
// interlocking Fibonacci parastichies fall straight out. The look downstream is
// a Voronoi tessellation of these sites (see index.ts); this module only owns
// the point cloud + the divergence-angle sweep.

const DEG2RAD = Math.PI / 180
const JITTER_MAX_DEG = 2 // full jitter=1 maps to ±2° of angular wobble
const SWEEP_POWER = 2 // >1 → dwell near golden, glide fast through the shatter extremes

/** Deterministic per-site wobble in [-1, 1), stable regardless of how many sites
 *  are currently shown (a hash of seed+k, NOT a sequential RNG stream). */
export function siteJitter(seed: number, k: number): number {
  let a = (Math.imul(seed, 0x9e3779b1) ^ k) | 0
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b)
  a = Math.imul(a ^ (a >>> 13), 0xc2b2ae35)
  a ^= a >>> 16
  return ((a >>> 0) / 4294967296) * 2 - 1
}

/** Fill `out` (length ≥ 2·count) with centred [x0,y0,x1,y1,…] site coordinates.
 *  In-place so the caller can reuse one buffer per frame (Delaunay reads a flat
 *  coord array directly). `divergenceDeg` is the live, swept angle. */
export function writeSitePositions(
  out: Float64Array,
  count: number,
  divergenceDeg: number,
  spacing: number,
  jitter: number,
  seed: number,
): void {
  const jAmp = jitter * JITTER_MAX_DEG
  for (let k = 0; k < count; k++) {
    const ang = (k * divergenceDeg + jAmp * siteJitter(seed, k)) * DEG2RAD
    const r = spacing * Math.sqrt(k)
    out[2 * k] = r * Math.cos(ang)
    out[2 * k + 1] = r * Math.sin(ang)
  }
}

/** Convenience allocator (tests / non-hot paths). */
export function sitePositions(
  count: number,
  divergenceDeg: number,
  spacing: number,
  jitter: number,
  seed: number,
): Float64Array {
  const out = new Float64Array(2 * count)
  writeSitePositions(out, count, divergenceDeg, spacing, jitter, seed)
  return out
}

/** Radius of the seed head disk holding `count` florets. */
export function diskRadius(spacing: number, count: number): number {
  return spacing * Math.sqrt(Math.max(0, count))
}

/** Live divergence angle at time `tSec`: oscillates within [base−amp, base+amp],
 *  dwelling near `base` (golden) and gliding quickly through the shatter extremes
 *  (the eased waveform spends more time near 0 offset). */
export function divergenceAt(base: number, amp: number, periodSec: number, tSec: number): number {
  if (amp <= 0 || periodSec <= 0) return base
  const s = Math.sin((2 * Math.PI * tSec) / periodSec)
  const eased = Math.sign(s) * Math.abs(s) ** SWEEP_POWER
  return base + amp * eased
}
