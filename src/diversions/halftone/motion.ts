import { mulberry32 } from '../../framework/rng'
import type { HalftoneConfig } from './schema'

// The masses are simulated on the CPU (there are only a handful) and passed to the
// fragment shader as a uniform array; the shader computes the field + halftone dots
// per pixel. Positions live in the same aspect-correct uv space the shader draws in:
// uv = (fragCoord*2 - res) / min(res) — so y ∈ [-1, 1] and x ∈ [-aspect, aspect].

export const MAX_MASSES = 8

export type Mass = {
  x: number // current position (uv space) — recomputed each step from the orbit
  y: number
  cx: number // orbit centre
  cy: number
  r: number // orbit radius (uv units)
  w: number // angular speed (signed rad per sim-second)
  phase: number // starting angle
  strength: number // field weight (= cfg.massStrength * strengthFrac), live-tunable
  strengthFrac: number // seeded [0.6, 1.4) factor — keeps strength live-tunable without a reseed
}

/** Seed the orbiting masses deterministically from cfg.seed. Same seed → same set. */
export function seedMasses(cfg: HalftoneConfig, aspect: number): Mass[] {
  const rnd = mulberry32(cfg.seed)
  const masses: Mass[] = []
  for (let i = 0; i < cfg.massCount; i++) {
    const cx = (rnd() * 2 - 1) * aspect * 0.55
    const cy = (rnd() * 2 - 1) * 0.55
    const r = 0.12 + rnd() * 0.33
    const w = (0.15 + rnd() * 0.35) * (rnd() < 0.5 ? -1 : 1) // some orbit CW, some CCW
    const phase = rnd() * Math.PI * 2
    const strengthFrac = 0.6 + rnd() * 0.8
    masses.push({
      cx, cy, r, w, phase, strengthFrac,
      strength: cfg.massStrength * strengthFrac,
      x: cx + r * Math.cos(phase),
      y: cy + r * Math.sin(phase),
    })
  }
  return masses
}

/** Recompute each mass's field weight from its seeded fraction — lets the Mass
 *  strength slider re-tune live (no reseed) when only it moves. */
export function applyStrength(masses: Mass[], cfg: HalftoneConfig): void {
  for (const m of masses) m.strength = cfg.massStrength * m.strengthFrac
}

/** Rescale horizontal orbit centres when the viewport aspect changes (resize /
 *  fullscreen) so masses stay within the visible width. */
export function rescaleX(masses: Mass[], oldAspect: number, newAspect: number): void {
  if (oldAspect <= 0) return
  const k = newAspect / oldAspect
  for (const m of masses) {
    m.cx *= k
    m.x *= k
  }
}

/** Advance the orbits by `dtMs` (clamped, speed-scaled). `t` is accumulated sim
 *  seconds; returns the next value (wrapped to stay finite/precise). */
export function stepMasses(masses: Mass[], cfg: HalftoneConfig, dtMs: number, t: number): number {
  const sdt = (Math.min(dtMs, 50) / 1000) * cfg.speed // clamp tab-stall spikes (matches the loop's 50ms cap)
  const nt = (t + sdt) % 1e4
  for (const m of masses) {
    const a = m.phase + m.w * nt
    m.x = m.cx + m.r * Math.cos(a)
    m.y = m.cy + m.r * Math.sin(a)
  }
  return nt
}

/** The scalar potential field at a point (uv space): Σ strengthᵢ / (distᵢ + spread).
 *  The `spread` softening both broadens each mass's reach and removes the 1/0
 *  singularity at a mass centre. Mirrors the GLSL `fieldAt` in halftone.ts. */
export function fieldAt(masses: Mass[], x: number, y: number, spread: number): number {
  let f = 0
  for (const m of masses) {
    const dx = x - m.x
    const dy = y - m.y
    f += m.strength / (Math.hypot(dx, dy) + spread)
  }
  return f
}
