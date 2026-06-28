import { mulberry32 } from '../../framework/rng'
import type { MetaballsConfig } from './schema'

export type Blob = {
  x: number // current horizontal position, [-aspect, aspect]
  x0: number // horizontal rest position (noise oscillates around it)
  y: number // vertical position, [-1, 1] (+y = up = cold ceiling)
  vy: number // vertical velocity
  T: number // temperature in [0, 1] — drives buoyancy
  radius: number // in the shader's uv units (derived from radiusFrac live)
  radiusFrac: number // seeded [0,1) — keeps radius live-tunable without a reseed
  kRate: number // per-blob heat/cool rate — the anti-synchronization key
  xPhase: number // horizontal-noise phase offset
}

// Internal tuning constants (not exposed as sliders — dialed in during verify).
//
// Motion is a *relaxation oscillator*, NOT a damped spring: a blob heats only
// in the floor zone and cools only in the ceiling zone, holding temperature
// through the middle. So a hot blob rising past the neutral centre keeps
// rising (no restoring force there to stall it at mid-height), reaches the
// top, cools, sinks, reheats at the floor — a genuine limit cycle that spans
// the screen and cannot collapse to the centre (the failure a continuous
// linear gradient produced: equilibrium at y=0 → blobs pooled on a mid-line).
const T_NEUTRAL = 0.5 // buoyancy is zero at this temperature
const HEAT_ZONE = 0.32 // yNorm below this (the floor) → blob heats
const COOL_ZONE = 0.68 // yNorm above this (the ceiling) → blob cools
const BUOY_K = 2.2 // buoyancy gain so the exposed 0..1 slider has real force
const DAMP_K = 1.2 // damping scale: vy *= exp(-DAMP_K * viscosity * dt)
const KRATE_MIN = 0.25 // per-blob thermal rate spread (heat/cool per second)
const KRATE_MAX = 0.5
const NOISE_AMP = 0.12 // horizontal drift amplitude (uv units)
const WALL = 0.92 // soft |y| limit; blobs pool into the wall band
const WALL_BOUNCE = 0.4 // fraction of vy retained on a wall hit (absorptive)

export function seedBlobs(cfg: MetaballsConfig, aspect: number): Blob[] {
  const rnd = mulberry32(cfg.seed)
  const blobs: Blob[] = []
  for (let i = 0; i < cfg.blobCount; i++) {
    const x0 = (rnd() * 2 - 1) * aspect * 0.85
    const radiusFrac = rnd()
    blobs.push({
      x: x0,
      x0,
      y: rnd() * 2 - 1,
      vy: 0,
      T: rnd(), // random initial temperature so blobs launch out of phase
      radiusFrac,
      radius: cfg.radiusMin + radiusFrac * (cfg.radiusMax - cfg.radiusMin),
      kRate: KRATE_MIN + rnd() * (KRATE_MAX - KRATE_MIN),
      xPhase: rnd() * Math.PI * 2,
    })
  }
  return blobs
}

/** Recompute each blob's radius from its seeded fraction — lets the radius
 *  bounds re-tune live (no reseed) when only those sliders move. */
export function applyRadius(blobs: Blob[], cfg: MetaballsConfig): void {
  for (const b of blobs) {
    b.radius = cfg.radiusMin + b.radiusFrac * (cfg.radiusMax - cfg.radiusMin)
  }
}

/** Rescale horizontal positions when the viewport aspect changes (resize /
 *  fullscreen), so blobs stay within the visible width instead of pinned to
 *  the setup-time aspect. */
export function rescaleX(blobs: Blob[], oldAspect: number, newAspect: number): void {
  if (oldAspect <= 0) return
  const k = newAspect / oldAspect
  for (const b of blobs) {
    b.x0 *= k
    b.x *= k
  }
}

/** Step the sim by `dtMs` (clamped, speed-scaled). `t` is accumulated sim
 *  seconds; returns the next value (wrapped to stay float32-precise). */
export function stepBlobs(
  blobs: Blob[],
  cfg: MetaballsConfig,
  dtMs: number,
  t: number,
): number {
  const sdt = (Math.min(dtMs, 33) / 1000) * cfg.speed // clamp tab-stall spikes
  const nt = (t + sdt) % 1e4
  for (const b of blobs) {
    // --- vertical: thermal relaxation oscillator ---
    const yNorm = (b.y + 1) / 2 // 0 at floor, 1 at ceiling
    if (yNorm < HEAT_ZONE) b.T += b.kRate * sdt // reheat at the floor
    else if (yNorm > COOL_ZONE) b.T -= b.kRate * sdt // cool at the ceiling
    if (b.T > 1) b.T = 1
    else if (b.T < 0) b.T = 0
    b.vy += BUOY_K * cfg.buoyancy * (b.T - T_NEUTRAL) * sdt // warm rises, cool sinks
    b.vy *= Math.exp(-DAMP_K * cfg.viscosity * sdt) // contraction → stable
    b.y += b.vy * sdt
    if (b.y > WALL) {
      b.y = WALL
      b.vy = -Math.abs(b.vy) * WALL_BOUNCE
    } else if (b.y < -WALL) {
      b.y = -WALL
      b.vy = Math.abs(b.vy) * WALL_BOUNCE
    }
    // --- horizontal: two incommensurate sines (never exactly repeats) ---
    b.x =
      b.x0 +
      NOISE_AMP *
        (Math.sin(nt * 0.37 + b.xPhase) + 0.5 * Math.sin(nt * 0.91 + b.xPhase * 1.7))
  }
  return nt
}
