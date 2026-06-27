import type { GravityWellsConfig } from './schema'
import { mulberry32, makeNoise3D } from '../flow-field/noise'

export interface Well {
  x: number
  y: number
  force: number // signed: negative repels, positive attracts
  age: number   // ms
  life: number  // ms
  fade: number  // ms of fade-in and (separately) fade-out
}

// Each well lives wellLifespan seconds ± 30% jitter so the pool doesn't all
// flip at once; fade is 35% of life (no cap) so longer-lived wells breathe in
// and out slowly rather than snapping on.
export function spawnWell(rng: () => number, cfg: GravityWellsConfig, w: number, h: number): Well {
  const jitter = 0.7 + rng() * 0.6 // 0.7..1.3
  const life = cfg.wellLifespan * 1000 * jitter
  return {
    x: rng() * w,
    y: rng() * h,
    force: cfg.forceMin + rng() * (cfg.forceMax - cfg.forceMin),
    age: 0,
    life,
    fade: life * 0.35,
  }
}

// Trapezoid envelope: ramp 0->1 over the first `fade`, hold at 1, ramp 1->0 over
// the last `fade`. Keeps the bend from ever appearing/vanishing instantly.
export function wellEnvelope(well: Well): number {
  const { age, life, fade } = well
  if (age <= 0 || age >= life) return 0
  if (age < fade) return age / fade
  if (age > life - fade) return (life - age) / fade
  return 1
}

export function maintainWells(
  wells: Well[], dt: number, rng: () => number,
  cfg: GravityWellsConfig, w: number, h: number,
): void {
  for (const wl of wells) wl.age += dt
  // drop expired (iterate backwards so splice is safe)
  for (let i = wells.length - 1; i >= 0; i--) if (wells[i].age >= wells[i].life) wells.splice(i, 1)
  // trim if maxWells shrank
  while (wells.length > cfg.maxWells) wells.pop()
  // refill up to maxWells
  while (wells.length < cfg.maxWells) wells.push(spawnWell(rng, cfg, w, h))
}

export const SOFTENING = 60      // px — soft core; removes the r->0 singularity
export const G = 26000           // force -> bend-vector scale
export const GRAVITY_K = 0.002   // scales the gravity bend to ~unit (noise) near wells

// The summed gravity vector at a point: inverse-LINEAR (softened) so a well
// reaches across the whole field, not just its neighbourhood. This is a bend
// direction, not an acceleration — particles never accumulate it as momentum.
export function accelAt(px: number, py: number, wells: Well[]): { ax: number; ay: number } {
  let ax = 0, ay = 0
  for (const wl of wells) {
    const env = wellEnvelope(wl)
    if (env === 0) continue
    const dx = wl.x - px, dy = wl.y - py
    const dist = Math.sqrt(dx * dx + dy * dy + SOFTENING * SOFTENING)
    const mag = (wl.force * env * G) / dist // signed: + pulls toward well, - pushes away
    ax += (dx / dist) * mag
    ay += (dy / dist) * mag
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

export interface FieldSample { dx: number; dy: number; strength: number }

// The blended flow direction at a point: the noise current bent by gravity.
// Returns a unit step direction plus the local gravity-bend strength (0..1) for
// the `field` color source.
export function fieldAt(state: GravityState, px: number, py: number): FieldSample {
  const { noise, fieldTime, cfg, wells } = state
  const a = noise(px * cfg.noiseScale, py * cfg.noiseScale, fieldTime) * Math.PI * 2
  let fx = Math.cos(a), fy = Math.sin(a)
  const { ax, ay } = accelAt(px, py, wells)
  const k = GRAVITY_K * cfg.gravityInfluence
  fx += ax * k
  fy += ay * k
  const len = Math.hypot(fx, fy) || 1
  const gravMag = Math.hypot(ax, ay)
  return { dx: fx / len, dy: fy / len, strength: Math.min(1, gravMag * GRAVITY_K) }
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
