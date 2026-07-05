// Pure, framework-agnostic restricted N-body: two massive galactic cores moving
// under their own mutual (softened) gravity, and thousands of MASSLESS test stars
// that feel only the two cores. As the cores pass, tidal forces draw out tails,
// bridges, and shells — the emergent Toomre-style structure IS the headline look.
//
// No canvas/DOM/GL imports so it stays unit-testable. The integrator is velocity-
// Verlet (leapfrog) for both the 2-core system and every star; it is symplectic,
// so the 2-core energy + momentum stay well-conserved over long unattended runs.
// The per-step loops are allocation-free (typed arrays reused in place).

import { mulberry32 } from '../../framework/rng'

const TAU = Math.PI * 2
const G = 1 // gravitational constant folded into the mass units
export const DISK_R = 1 // galactic disk radius, world units — the scale of everything
const R_MIN = 0.05 // inner radius floor so central stars never sample a singular orbit
export const INITIAL_SEP = 4 // initial core separation (in disk radii); COM sits at origin
// Extra softening for the CORE-CORE force only, so a near-head-on pass swings
// through and separates instead of slingshotting to infinity on one hot step.
const CORE_EXTRA_SOFT = 0.25

/** The subset of the config that shapes the physics. A change to any of these
 *  re-seeds the encounter (index.update returns false); the Look/Color fields
 *  never touch it. */
export interface PhysicsConfig {
  starCount: number
  seed: number
  coreMass: number
  softening: number
  impactParameter: number
  approachSpeed: number
  retrograde: boolean
}

export interface Sim {
  n: number // total stars
  nA: number // stars belonging to galaxy A (the first nA entries)
  // star state (structure-of-arrays, index 0..n-1)
  x: Float32Array
  y: Float32Array
  vx: Float32Array
  vy: Float32Array
  ax: Float32Array // accel from the two cores at the star's CURRENT position
  ay: Float32Array
  coreness: Float32Array // 0 outer disk → 1 dense core (drives colour + size)
  bright: Float32Array // 0..1 render brightness
  gal: Uint8Array // 0 = galaxy A, 1 = galaxy B
  // cores (index 0 = A, 1 = B) — Float64 for a clean long-run trajectory
  cx: Float64Array
  cy: Float64Array
  cvx: Float64Array
  cvy: Float64Array
  cax: Float64Array
  cay: Float64Array
  cm: Float64Array
  eps2: number // star softening, squared
  coreEps2: number // core-core softening, squared
  minSep: number // closest core approach seen so far (staleness policy)
  simTime: number // accumulated sim-time units
}

/** Softened accel on a body at (px,py) from a point mass m at (mx,my). Adds into
 *  the running (axRef) via the returned pair — kept as a tiny inline helper the
 *  hot loops call twice (one per core). */
function coreAccel(px: number, py: number, mx: number, my: number, gm: number, eps2: number): [number, number] {
  const dx = mx - px
  const dy = my - py
  const r2 = dx * dx + dy * dy + eps2
  const inv = gm / (r2 * Math.sqrt(r2)) // gm / r^3  → gives gm·d/r^3 accel
  return [inv * dx, inv * dy]
}

/** Recompute the two cores' mutual accel into cax/cay from their current positions. */
function computeCoreAccel(sim: Sim): void {
  const { cx, cy, cm, cax, cay, coreEps2 } = sim
  const dx = cx[1] - cx[0]
  const dy = cy[1] - cy[0]
  const r2 = dx * dx + dy * dy + coreEps2
  const inv = G / (r2 * Math.sqrt(r2))
  cax[0] = inv * cm[1] * dx
  cay[0] = inv * cm[1] * dy
  cax[1] = -inv * cm[0] * dx
  cay[1] = -inv * cm[0] * dy
}

/** Build a fresh encounter from a physics config. Deterministic in `seed`. */
export function initSim(cfg: PhysicsConfig): Sim {
  const n = Math.max(2, cfg.starCount)
  const nA = Math.ceil(n / 2)
  const rng = mulberry32(cfg.seed >>> 0)
  const M = cfg.coreMass
  const eps = cfg.softening
  const eps2 = eps * eps
  const coreEps = eps + CORE_EXTRA_SOFT
  const b = cfg.impactParameter
  const s = cfg.approachSpeed

  const sim: Sim = {
    n,
    nA,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    ax: new Float32Array(n),
    ay: new Float32Array(n),
    coreness: new Float32Array(n),
    bright: new Float32Array(n),
    gal: new Uint8Array(n),
    // A on the left moving right (+x), B on the right moving left (−x); offset in
    // ±y by half the impact parameter. Equal masses + antisymmetric setup ⇒ the
    // centre of mass is pinned at the origin for all time (nothing to re-centre).
    cx: new Float64Array([-INITIAL_SEP / 2, INITIAL_SEP / 2]),
    cy: new Float64Array([b / 2, -b / 2]),
    cvx: new Float64Array([s, -s]),
    cvy: new Float64Array([0, 0]),
    cax: new Float64Array(2),
    cay: new Float64Array(2),
    cm: new Float64Array([M, M]),
    eps2,
    coreEps2: coreEps * coreEps,
    minSep: INITIAL_SEP,
    simTime: 0,
  }

  for (let i = 0; i < n; i++) {
    const g = i < nA ? 0 : 1
    const px0 = sim.cx[g]
    const py0 = sim.cy[g]
    const vx0 = sim.cvx[g]
    const vy0 = sim.cvy[g]
    // Radius biased toward the centre (exponent > 0.5 pushes the CDF inward),
    // so the disk is denser at its core — which reads as a bright bulge.
    const r = Math.max(R_MIN, DISK_R * Math.pow(rng(), 0.7))
    const theta = rng() * TAU
    const ct = Math.cos(theta)
    const st = Math.sin(theta)
    // Circular orbital speed consistent with the SAME softened core force, so an
    // isolated disk sits in near-equilibrium until the other galaxy perturbs it.
    const [arx, ary] = coreAccel(px0 + r * ct, py0 + r * st, px0, py0, G * M, eps2)
    const aRad = Math.hypot(arx, ary)
    const vCirc = Math.sqrt(aRad * r)
    // Galaxy A spins CCW (prograde); B matches unless retrograde flips it CW.
    const spin = g === 1 && cfg.retrograde ? -1 : 1
    sim.x[i] = px0 + r * ct
    sim.y[i] = py0 + r * st
    // tangential (perpendicular to radial) + the parent core's bulk velocity
    sim.vx[i] = vx0 + spin * vCirc * -st
    sim.vy[i] = vy0 + spin * vCirc * ct
    const coreness = Math.min(1, Math.max(0, 1 - r / DISK_R))
    sim.coreness[i] = coreness
    sim.bright[i] = 0.3 + 0.7 * coreness
    sim.gal[i] = g
  }

  // Seed the accelerations so the first Verlet step is well-formed.
  computeCoreAccel(sim)
  const { cx, cy, cm, ax, ay, x, y, eps2: e2 } = sim
  for (let i = 0; i < n; i++) {
    const [a0x, a0y] = coreAccel(x[i], y[i], cx[0], cy[0], G * cm[0], e2)
    const [a1x, a1y] = coreAccel(x[i], y[i], cx[1], cy[1], G * cm[1], e2)
    ax[i] = a0x + a1x
    ay[i] = a0y + a1y
  }
  return sim
}

/** Advance the whole sim by one velocity-Verlet step of size `dt` (sim-time units).
 *  Cores are integrated first so the stars' end-of-step kick sees the cores'
 *  new positions — a moving external field, exactly as the CPU two-pass intends. */
export function step(sim: Sim, dt: number): void {
  const { cx, cy, cvx, cvy, cax, cay, cm } = sim
  const half = 0.5 * dt

  // ── cores: velocity-Verlet ──
  for (let j = 0; j < 2; j++) {
    cx[j] += cvx[j] * dt + half * cax[j] * dt
    cy[j] += cvy[j] * dt + half * cay[j] * dt
  }
  const oax0 = cax[0], oay0 = cay[0], oax1 = cax[1], oay1 = cay[1]
  computeCoreAccel(sim)
  cvx[0] += half * (oax0 + cax[0])
  cvy[0] += half * (oay0 + cay[0])
  cvx[1] += half * (oax1 + cax[1])
  cvy[1] += half * (oay1 + cay[1])

  // ── stars: velocity-Verlet in the two cores' field ──
  const { x, y, vx, vy, ax, ay, n, eps2 } = sim
  const c0x = cx[0], c0y = cy[0], gm0 = G * cm[0]
  const c1x = cx[1], c1y = cy[1], gm1 = G * cm[1]
  // drift (uses each star's accel from the START-of-step configuration)
  for (let i = 0; i < n; i++) {
    x[i] += vx[i] * dt + half * ax[i] * dt
    y[i] += vy[i] * dt + half * ay[i] * dt
  }
  // kick (accel re-evaluated at the new positions in the cores' NEW field)
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i]
    let dx = c0x - xi, dy = c0y - yi
    let r2 = dx * dx + dy * dy + eps2
    let inv = gm0 / (r2 * Math.sqrt(r2))
    let nax = inv * dx, nay = inv * dy
    dx = c1x - xi; dy = c1y - yi
    r2 = dx * dx + dy * dy + eps2
    inv = gm1 / (r2 * Math.sqrt(r2))
    nax += inv * dx; nay += inv * dy
    vx[i] += half * (ax[i] + nax)
    vy[i] += half * (ay[i] + nay)
    ax[i] = nax
    ay[i] = nay
  }

  sim.simTime += dt
  const sep = Math.hypot(cx[1] - cx[0], cy[1] - cy[0])
  if (sep < sim.minSep) sim.minSep = sep
}

/** Current core separation (world units). */
export function coreSeparation(sim: Sim): number {
  return Math.hypot(sim.cx[1] - sim.cx[0], sim.cy[1] - sim.cy[0])
}

/** A robust world-extent to frame: mean stellar radius + 2σ, so a handful of
 *  flung-out stars in a long tail don't shrink the whole scene. O(n), no alloc.
 *  Cores sit near the origin (COM), so radius is measured from the origin. */
export function frameExtent(sim: Sim): number {
  const { x, y, n } = sim
  let sum = 0, sum2 = 0
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(x[i] * x[i] + y[i] * y[i])
    sum += r
    sum2 += r * r
  }
  const mean = sum / n
  const varr = Math.max(0, sum2 / n - mean * mean)
  return Math.max(DISK_R, mean + 2 * Math.sqrt(varr))
}

/** Total 2-core energy (KE + softened PE). Massless stars carry no energy, so
 *  this is the conserved quantity the integrator test watches. */
export function coreEnergy(sim: Sim): number {
  const { cvx, cvy, cm, cx, cy, coreEps2 } = sim
  const ke = 0.5 * cm[0] * (cvx[0] * cvx[0] + cvy[0] * cvy[0])
    + 0.5 * cm[1] * (cvx[1] * cvx[1] + cvy[1] * cvy[1])
  const dx = cx[1] - cx[0]
  const dy = cy[1] - cy[0]
  const r = Math.sqrt(dx * dx + dy * dy + coreEps2) // softened distance
  const pe = -G * cm[0] * cm[1] / r
  return ke + pe
}

/** Total 2-core linear momentum (should stay ~0: equal masses, antisymmetric setup). */
export function coreMomentum(sim: Sim): [number, number] {
  const { cvx, cvy, cm } = sim
  return [cm[0] * cvx[0] + cm[1] * cvx[1], cm[0] * cvy[0] + cm[1] * cvy[1]]
}
