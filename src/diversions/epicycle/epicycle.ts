// Framework-agnostic epicycle math + seeded generation. Pure functions only (no
// DOM / canvas), so it unit-tests cleanly. An epicycle chain is a list of arms;
// arm k has a radius, an integer angular frequency, and a phase offset. The pen at
// the final tip is the sum of the arm vectors — a Fourier / Ptolemaic roulette that
// closes after one full revolution (theta 0 → 2π) because every frequency is integer.
import { mulberry32 } from '../../framework/rng'
import type { EpicycleConfig } from './schema'

const TAU = Math.PI * 2

export interface Arm {
  radius: number // in unit space (largest arm = 1), scaled to the canvas at draw time
  freq: number // integer angular frequency (± = counter-rotating); nonzero
  phase: number // radians, 0..2π starting offset
}

export interface SampledCurve {
  xs: Float64Array
  ys: Float64Array
  count: number
  maxR: number // max distance from origin — used to fit the curve to the canvas
}

/** Seeded PRNG from a config seed (0/undefined → 1 so a stream always advances). */
export function makeRng(seed: number): () => number {
  return mulberry32((seed >>> 0) || 1)
}

/** All nonzero integers in [-spread, spread] — the pool of pickable frequencies. */
function freqPool(spread: number): number[] {
  const pool: number[] = []
  for (let f = -spread; f <= spread; f++) if (f !== 0) pool.push(f)
  return pool
}

/** Build the arm chain for one curve. Radii decay geometrically (the first arm is the
 *  dominant circle); frequencies are DISTINCT nonzero integers, so the pen never
 *  degenerates to a single circle. The largest radius is paired with the slowest
 *  frequency (classic nested look — a big slow ring carrying faster small ones). All
 *  randomness is seeded, so the same rng replays the same arms. */
export function buildArms(rng: () => number, cfg: EpicycleConfig): Arm[] {
  const n = cfg.armCount

  // Geometric radii, normalized so the dominant arm is 1.
  const radii: number[] = []
  let r = 1
  for (let k = 0; k < n; k++) { radii.push(r); r *= cfg.radiusDecay }

  // Distinct nonzero integer frequencies. Widen the pool if it can't supply n of them.
  let spread = Math.max(1, cfg.freqSpread)
  let pool = freqPool(spread)
  while (pool.length < n) { spread++; pool = freqPool(spread) }
  // Seeded Fisher–Yates shuffle, then take n.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
  }
  const chosen = pool.slice(0, n)
  // Slowest frequency on the biggest radius.
  chosen.sort((a, b) => Math.abs(a) - Math.abs(b))

  const arms: Arm[] = []
  for (let k = 0; k < n; k++) {
    arms.push({ radius: radii[k], freq: chosen[k], phase: rng() * TAU })
  }
  return arms
}

/** Pen position (sum of arm vectors) at parameter theta, in unit space. */
export function penAt(arms: Arm[], theta: number): { x: number; y: number } {
  let x = 0, y = 0
  for (const a of arms) {
    const ang = a.freq * theta + a.phase
    x += a.radius * Math.cos(ang)
    y += a.radius * Math.sin(ang)
  }
  return { x, y }
}

/** Sample the closed roulette over theta ∈ [0, 2π]. The last sample coincides with the
 *  first (theta = 2π ≡ 0), so drawing the full polyline closes the loop exactly. */
export function sampleCurve(arms: Arm[], samples: number): SampledCurve {
  const xs = new Float64Array(samples)
  const ys = new Float64Array(samples)
  let maxR = 0
  const denom = Math.max(1, samples - 1)
  for (let i = 0; i < samples; i++) {
    const theta = (i / denom) * TAU
    let x = 0, y = 0
    for (const a of arms) {
      const ang = a.freq * theta + a.phase
      x += a.radius * Math.cos(ang)
      y += a.radius * Math.sin(ang)
    }
    xs[i] = x; ys[i] = y
    const rr = Math.hypot(x, y)
    if (rr > maxR) maxR = rr
  }
  return { xs, ys, count: samples, maxR }
}
