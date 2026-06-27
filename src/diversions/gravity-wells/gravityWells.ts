import type { GravityWellsConfig } from './schema'
import { mulberry32, makeNoise3D } from '../flow-field/noise'

export interface Well {
  x: number
  y: number
  force: number // current attractive strength (≥ 0) — recomputed each frame
  age: number   // ms
  life: number  // ms
}

// Each well lives wellLifespan seconds ± 30% jitter so the pool doesn't all
// peak at once. Force starts at forceMin and ramps toward forceMax over the
// life (see wellForce); a fresh well begins at the floor.
export function spawnWell(rng: () => number, cfg: GravityWellsConfig, w: number, h: number): Well {
  const jitter = 0.7 + rng() * 0.6 // 0.7..1.3
  const life = cfg.wellLifespan * 1000 * jitter
  return {
    x: rng() * w,
    y: rng() * h,
    force: cfg.forceMin,
    age: 0,
    life,
  }
}

// A single smooth arc across the well's life: 0 at birth, 1 at mid-life, 0 at
// death. Drives both the force ramp (forceMin→forceMax→forceMin) and the
// marker's fade, so the well breathes in and out instead of snapping on.
export function wellEnvelope(well: Well): number {
  const { age, life } = well
  if (age <= 0 || age >= life) return 0
  return Math.sin(Math.PI * (age / life))
}

// The well's attractive force right now: ramps forceMin → forceMax → forceMin
// across its life, peaking at mid-life. Attract-only (always ≥ 0).
export function wellForce(well: Well, cfg: GravityWellsConfig): number {
  return cfg.forceMin + (cfg.forceMax - cfg.forceMin) * wellEnvelope(well)
}

export function maintainWells(
  wells: Well[], dt: number, rng: () => number,
  cfg: GravityWellsConfig, w: number, h: number,
): void {
  for (const wl of wells) { wl.age += dt; wl.force = wellForce(wl, cfg) }
  // drop expired (iterate backwards so splice is safe)
  for (let i = wells.length - 1; i >= 0; i--) if (wells[i].age >= wells[i].life) wells.splice(i, 1)
  // trim if maxWells shrank
  while (wells.length > cfg.maxWells) wells.pop()
  // refill up to maxWells
  while (wells.length < cfg.maxWells) wells.push(spawnWell(rng, cfg, w, h))
}

export const SOFTENING = 60      // px — soft core; removes the r->0 singularity
export const G = 26000           // force -> bend-vector scale
export const GRAVITY_K = 0.012   // scales the gravity bend so the wells lead the field
export const FLOW_FLOOR = 0.18   // faint base-flow magnitude — only carries stragglers
                                 // through the dead zones where the wells cancel out

// The summed well vector at a point: inverse-LINEAR (softened) so a well reaches
// across the whole field, not just its neighbourhood. Each well contributes a
// RADIAL component (toward it — a drain) blended with a TANGENTIAL component
// (perpendicular — an orbit), controlled by `swirl` (0 = pure radial pull,
// 1 = pure orbit around). `wl.force` already carries the well's time-varying
// strength. This is a bend direction, not an acceleration — particles never
// accumulate it as momentum.
export function accelAt(
  px: number, py: number, wells: Well[], swirl = 0,
): { ax: number; ay: number } {
  let ax = 0, ay = 0
  for (const wl of wells) {
    if (wl.force === 0) continue
    const dx = wl.x - px, dy = wl.y - py
    const dist = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING)
    const ux = dx / dist, uy = dy / dist            // unit vector toward the well
    const mag = (wl.force * G) / dist
    // radial (ux,uy) blended with perpendicular (-uy,ux) by swirl
    ax += (ux * (1 - swirl) - uy * swirl) * mag
    ay += (uy * (1 - swirl) + ux * swirl) * mag
  }
  return { ax, ay }
}

export const BOUNDS_MARGIN = 0.5 // padded recycle box = canvas grown 50% each side

export interface Particle { x: number; y: number; age: number; life: number; ci: number }

export interface GravityState {
  particles: Particle[]
  wells: Well[]
  rng: () => number
  noise: (x: number, y: number, z: number) => number
  fieldTime: number
  cfg: GravityWellsConfig
  w: number
  h: number
}

function randomLife(rng: () => number): number {
  // 4..12 s — staggers particle recycling
  return (4 + rng() * 8) * 1000
}

export function respawnParticle(p: Particle, rng: () => number, w: number, h: number): void {
  p.x = rng() * w
  p.y = rng() * h
  p.age = 0
  p.life = randomLife(rng)
}

export function createGravityState(cfg: GravityWellsConfig, w: number, h: number): GravityState {
  const rng = mulberry32(cfg.seed)
  const noise = makeNoise3D(cfg.seed)
  const particles: Particle[] = []
  for (let i = 0; i < cfg.particles; i++) {
    const life = randomLife(rng)
    particles.push({
      x: rng() * w, y: rng() * h,
      age: rng() * life, // stagger so recycles don't pulse
      life,
      ci: 0, // assigned by the diversion from its palette length at setup
    })
  }
  const wells: Well[] = []
  for (let i = 0; i < cfg.maxWells; i++) wells.push(spawnWell(rng, cfg, w, h))
  return { particles, wells, rng, noise, fieldTime: 0, cfg, w, h }
}

export function outOfBounds(p: Particle, w: number, h: number): boolean {
  const mx = w * BOUNDS_MARGIN, my = h * BOUNDS_MARGIN
  return p.x < -mx || p.x > w + mx || p.y < -my || p.y > h + my
}

// Advance the noise morph clock; fieldDrift=0 freezes the base flow.
export function advanceFieldTime(t: number, dt: number, fieldDrift: number): number {
  return t + fieldDrift * dt * 0.00012
}

// Knee for the strength tonemap below. The well bend `h = hypot(gx, gy)` runs
// from ~0 in the open field to well over 1 near a well (the inverse-LINEAR reach
// keeps it high across the whole canvas). A hard min(1,h) clamped almost
// everything to the top of the gradient — one flat colour. h/(h+k) instead
// spreads it smoothly across 0..1: cool open field, hot cores, a real gradient
// in between. k≈3 puts a typical mid-field bend around the gradient's middle. (#46)
export const FIELD_STRENGTH_K = 3

// Map a raw bend magnitude to a 0..1 strength via a Reinhard-style tonemap, so
// the `field` colour source never flat-saturates. Monotonic, fieldStrength(0)=0,
// asymptotes to 1 but never reaches it.
export function fieldStrength(h: number): number {
  return h / (h + FIELD_STRENGTH_K)
}

export interface FieldSample { dx: number; dy: number; strength: number }

// The flow direction at a point: the WELLS drive it (radial + swirl), with a
// faint noise floor underneath that only matters where the wells cancel out.
// Returns a unit step direction plus the local well-bend strength (0..1) for the
// `field` color source. gravityInfluence 0 → pure flow field (the floor alone).
export function fieldAt(state: GravityState, px: number, py: number): FieldSample {
  const { noise, fieldTime, cfg, wells } = state
  const { ax, ay } = accelAt(px, py, wells, cfg.swirl)
  const k = GRAVITY_K * cfg.gravityInfluence
  const gx = ax * k, gy = ay * k
  // faint base flow — additive, so where the wells are strong they swamp it and
  // where they vanish (dead zones / saddle points) it keeps particles drifting.
  const a = noise(px * cfg.noiseScale, py * cfg.noiseScale, fieldTime) * Math.PI * 2
  const fx = gx + Math.cos(a) * FLOW_FLOOR
  const fy = gy + Math.sin(a) * FLOW_FLOOR
  const len = Math.hypot(fx, fy) || 1
  return { dx: fx / len, dy: fy / len, strength: fieldStrength(Math.hypot(gx, gy)) }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function colorT(
  source: 'flow-angle' | 'field' | 'x' | 'y',
  p: Particle, angle: number, strength: number, w: number, h: number,
): number {
  if (source === 'field') return clamp01(strength)
  if (source === 'x') return clamp01(p.x / w)
  if (source === 'y') return clamp01(p.y / h)
  // flow-angle: map the direction angle onto 0..1, cyclically
  return ((angle / (Math.PI * 2)) % 1 + 1) % 1
}
