// The orchestrator. Everything below works in METRES and SECONDS.

import {
  FIXED_DT,
  MAX_SUBSTEPS,
  WALL_FRICTION,
  WALL_RESTITUTION,
  WALL_SHED,
  WALL_SHED_BIAS,
  WAY_FRACTION,
  speedScale,
  throttleForSpeedFraction,
  type PoolNavyConfig,
} from './config'
import { captainTick, type ShipView } from './captain'
import type { Pool } from './helm'
import { dreadnoughtSpec, gunboatSpec } from './hull'
import { speed, step as stepHull, type HullState } from './integrator'
import { mulberry32 } from '../../framework/rng'
import { liveFactions, onSinking, openingFleet, type Fleet } from './fleet'
import { isDreadnought, muzzleOf, type Ship } from './ship'
import { launch, stepProjectiles, applyDamage, type World } from './projectiles'
import { onBearing, trackTurret } from './weapons'

export interface Size { width: number; height: number }

export interface PoolNavyState extends World {
  cfg: PoolNavyConfig
  fleet: Fleet
  /** Seconds since the piece started. */
  t: number
  /** Leftover sub-step time, seconds. */
  acc: number
  rnd: () => number
  size: Size
  /** Metres-to-pixels, derived from the canvas and the pool. */
  scale: number
  offsetX: number
  offsetY: number
}

/** Wake sample spacing, metres. */
const TRAIL_SPACING_M = 0.02
const TRAIL_SAMPLES = 90

function pool(cfg: PoolNavyConfig): Pool {
  return { widthM: cfg.poolWidthM, heightM: cfg.poolHeightM }
}

/**
 * Letterbox the pool into the canvas.
 *
 * ⚠️ Uniform scale, deliberately. Deriving pool height from the canvas aspect
 * instead would change the SIM DOMAIN with the window, so the same seed would
 * not reproduce between a tile and a full screen.
 */
export function fitPool(cfg: PoolNavyConfig, size: Size): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(size.width / cfg.poolWidthM, size.height / cfg.poolHeightM)
  return {
    scale,
    offsetX: (size.width - cfg.poolWidthM * scale) / 2,
    offsetY: (size.height - cfg.poolHeightM * scale) / 2,
  }
}

export function createFleet(cfg: PoolNavyConfig, size: Size): PoolNavyState {
  const rnd = mulberry32(cfg.seed)
  const fleet = openingFleet(cfg, rnd)
  return {
    cfg,
    fleet,
    ships: fleet.ships,
    shells: [], beams: [], splashes: [], flashes: [], sunk: [],
    hitRadius: gunboatSpec(cfg.topSpeedMs, cfg.hullHp).lengthM * 0.45,
    t: 0,
    acc: 0,
    rnd,
    size,
    ...fitPool(cfg, size),
  }
}

/**
 * Reflect off the pool wall, and SHED off it.
 *
 * Two parts. The bounce is Box2D's job, at the same numbers. The shed is the
 * part the prototype never had: the contact impulse acts at the bow, not at
 * the centre of mass, so it applies a torque that swings the hull parallel to
 * the wall — which is how a real boat scrapes clear instead of sitting there
 * under full power.
 */
function bounceWalls(s: Ship, cfg: PoolNavyConfig, dt: number): void {
  const r = s.spec.lengthM * 0.4
  const h = s.hull
  let nx = 0
  let ny = 0

  if (h.x < r) {
    h.x = r
    if (h.vx < 0) { h.vx = -h.vx * WALL_RESTITUTION; h.vy *= 1 - WALL_FRICTION }
    nx = 1
  } else if (h.x > cfg.poolWidthM - r) {
    h.x = cfg.poolWidthM - r
    if (h.vx > 0) { h.vx = -h.vx * WALL_RESTITUTION; h.vy *= 1 - WALL_FRICTION }
    nx = -1
  }
  if (h.y < r) {
    h.y = r
    if (h.vy < 0) { h.vy = -h.vy * WALL_RESTITUTION; h.vx *= 1 - WALL_FRICTION }
    ny = 1
  } else if (h.y > cfg.poolHeightM - r) {
    h.y = cfg.poolHeightM - r
    if (h.vy > 0) { h.vy = -h.vy * WALL_RESTITUTION; h.vx *= 1 - WALL_FRICTION }
    ny = -1
  }

  if (nx === 0 && ny === 0) return

  // Only a hull pointing INTO the wall is being held by it.
  const fx = Math.cos(h.heading)
  const fy = Math.sin(h.heading)
  const into = -(fx * nx + fy * ny)
  if (into <= 0) return

  // Torque from an impulse at the bow: the cross product of the inward normal
  // with the hull's forward axis. Zero at exactly square-on, strongest at 45.
  // ⚠️ SIGN. `nx*fy - ny*fx` torques the bow INTO the wall, which is the
  // opposite of shedding: measured 9.8% stalled against 2.8% for no torque at
  // all, at every magnitude from 2 to 80 — a value-independent worsening,
  // which is the signature of a sign error rather than a scaling one.
  let cross = ny * fx - nx * fy
  if (Math.abs(cross) < WALL_SHED_BIAS) {
    // Square-on is a real balance point. Break it deterministically — never
    // with Math.random, which would make a seeded replay impossible.
    cross = (cross >= 0 ? 1 : -1) * WALL_SHED_BIAS
  }
  // ⚠️ Scaled by dt. Without it this lands 120 times a second at full
  // magnitude — about 150 rad/s^2 — and the hull PIROUETTES against the wall
  // instead of sliding along it. Measured: unscaled made stalls WORSE, 2.8%
  // -> 9.4%.
  h.omega += cross * into * WALL_SHED * s.spec.lengthM * dt
}

/** Hull-hull contact: push apart, bleed the closing speed. Per-ship radii. */
function separate(ships: readonly Ship[]): void {
  for (let i = 0; i < ships.length; i++) {
    const a = ships[i]!
    if (!a.alive) continue
    for (let j = i + 1; j < ships.length; j++) {
      const b = ships[j]!
      if (!b.alive) continue
      const dx = b.hull.x - a.hull.x
      const dy = b.hull.y - a.hull.y
      const d = Math.hypot(dx, dy)
      // ⚠️ Per-ship, not fleet-wide: a 0.6 m dreadnought beside a 0.25 m
      // gunboat needs its own radius or the big hull swallows the small one.
      const overlap = (a.spec.lengthM + b.spec.lengthM) * 0.38 - d
      if (overlap <= 0 || d < 1e-9) continue
      const nx = dx / d
      const ny = dy / d
      a.hull.x -= nx * overlap * 0.5
      a.hull.y -= ny * overlap * 0.5
      b.hull.x += nx * overlap * 0.5
      b.hull.y += ny * overlap * 0.5
      const rel = (b.hull.vx - a.hull.vx) * nx + (b.hull.vy - a.hull.vy) * ny
      if (rel >= 0) continue
      const imp = rel * 0.5
      a.hull.vx += nx * imp
      a.hull.vy += ny * imp
      b.hull.vx -= nx * imp
      b.hull.vy -= ny * imp
    }
  }
}

function viewOf(s: Ship): ShipView {
  return { id: s.id, faction: s.faction, spec: s.spec, x: s.hull.x, y: s.hull.y, hp: s.alive ? s.hp : 0 }
}

function stepWeapons(state: PoolNavyState, dt: number): void {
  state.beams = []
  for (const s of state.ships) {
    if (!s.alive) continue
    s.reload = Math.max(0, s.reload - dt)
  }

  for (const s of state.ships) {
    if (!s.alive || !s.captain?.targetId) continue
    const target = state.ships.find((x) => x.id === s.captain!.targetId)
    if (!target || !target.alive || target.faction === s.faction) continue

    const w = s.weapon
    const from = s.hull
    const to = target.hull
    s.turretBearing = trackTurret(s.turretBearing, from.heading, from, to, w.traverseDegPerSec, dt)

    const range = Math.hypot(to.x - from.x, to.y - from.y)
    if (range > w.rangeM) continue
    if (!onBearing(s.turretBearing, from.heading, from, to)) continue

    if (w.kind === 'laser') {
      // Continuous: no reload, no projectile. Damage accrues only while the
      // beam is held, so breaking lock is the counter. Kills go on the SAME
      // queue as the projectile path — deaths arise in two places.
      applyDamage(state, target, w.damage * dt)
      // From the MUZZLE, not the hull centre — the beam was visibly emerging
      // from the middle of the boat.
      const m = muzzleOf(s)
      state.beams.push({
        x0: m.x, y0: m.y,
        x1: m.x + Math.cos(m.angle) * range, y1: m.y + Math.sin(m.angle) * range,
        faction: s.faction,
      })
      continue
    }

    if (s.reload > 0) continue
    s.reload = 1 / w.rateOfFirePerSec
    launch(state, s, target, w)
  }
}

function sampleTrail(s: Ship): void {
  const last = s.trail[s.trail.length - 1]
  if (!last || Math.hypot(s.hull.x - last.x, s.hull.y - last.y) >= TRAIL_SPACING_M) {
    s.trail.push({ x: s.hull.x, y: s.hull.y })
    if (s.trail.length > TRAIL_SAMPLES) s.trail.shift()
  }
}

function fixedStep(state: PoolNavyState, dt: number): void {
  state.t += dt
  const p = pool(state.cfg)
  const views = state.ships.map(viewOf)

  for (let i = 0; i < state.ships.length; i++) {
    const s = state.ships[i]!
    if (!s.alive) continue
    const decision = captainTick({
      self: views[i]!,
      hull: s.hull,
      world: views,
      pool: p,
      prevTargetId: s.captain?.targetId ?? null,
      ...(s.prevHeadingError === undefined ? {} : { prevHeadingError: s.prevHeadingError }),
    })
    s.captain = decision.captain
    s.prevHeadingError = decision.headingError

    // Condition caps the throttle: the captain still orders full ahead and
    // simply does not get it.
    const cap = throttleForSpeedFraction(speedScale(s.hp / s.spec.hp, state.cfg.limpSpeed))
    stepHull(s.hull, Math.min(decision.captain.throttle, cap), decision.captain.rudder, s.spec, dt)

    // ORDER: bounce, THEN sample speed, so the metric sees the velocity the
    // hull actually ends the step with rather than the one it arrived with.
    //
    // ⚠️ This ordering is DEFENSIVE, not load-bearing at the shipped
    // constants, and it is worth writing that down rather than pretending
    // otherwise. Swapping the two lines leaves the whole suite green, and a
    // test that separates them cannot honestly be built: at restitution 0.15
    // the bounce only crosses the way threshold for approach speeds between
    // 0.033 and 0.217 m/s, and the captain's thrust moves the hull within that
    // same window inside one sub-step. Over a real pin the hull is below
    // threshold in both orderings for every frame but the first, so the
    // difference is one frame of lag.
    //
    // It stays because the cost is zero and the failure it guards against is
    // one this piece has already paid for once: a stall metric that could not
    // see the thing it was measuring, reporting a defect as fixed.
    bounceWalls(s, state.cfg, dt)
    s.stalledFor = speed(s.hull) < WAY_FRACTION * s.spec.topSpeedMs ? s.stalledFor + dt : 0
    sampleTrail(s)
  }

  separate(state.ships)
  stepWeapons(state, dt)
  stepProjectiles(state, dt)

  // Drain the kill queue into the escalation rule. One sinking in, one hull of
  // the current new faction out — which is what holds the population at
  // 2 x sideSize forever.
  while (state.sunk.length > 0) {
    const victim = state.sunk.shift()!
    onSinking(state.fleet, victim, state.cfg, state.rnd)
  }
  state.ships = state.fleet.ships
}

/** Advance the world by `seconds`. */
export function step(state: PoolNavyState, seconds: number): void {
  state.acc += seconds
  let n = 0
  while (state.acc >= FIXED_DT && n < MAX_SUBSTEPS) {
    fixedStep(state, FIXED_DT)
    state.acc -= FIXED_DT
    n++
  }
  // Drop unpayable debt rather than staying pinned at the cap forever.
  if (n >= MAX_SUBSTEPS) state.acc = 0
}

export function resizeArena(state: PoolNavyState, size: Size): void {
  state.size = size
  Object.assign(state, fitPool(state.cfg, size))
}

/**
 * Live-apply a config change.
 *
 * ⚠️ There is NO debounce between a slider and this function, so every
 * intermediate value of a drag lands here. Structural fields return false and
 * let the framework re-run setup; everything else reconciles in place.
 */
export function applyConfig(state: PoolNavyState, cfg: PoolNavyConfig, size: Size): boolean {
  const structural: Array<keyof PoolNavyConfig> = ['seed', 'sideSize', 'poolWidthM', 'poolHeightM']
  for (const k of structural) if (cfg[k] !== state.cfg[k]) return false

  if (cfg.topSpeedMs !== state.cfg.topSpeedMs || cfg.hullHp !== state.cfg.hullHp) {
    for (const s of state.ships) {
      const frac = s.hp / s.spec.hp
      s.spec = isDreadnought(s)
        ? dreadnoughtSpec(cfg.topSpeedMs, cfg.hullHp)
        : gunboatSpec(cfg.topSpeedMs, cfg.hullHp)
      s.hp = Math.max(1, frac * s.spec.hp)
    }
    state.hitRadius = gunboatSpec(cfg.topSpeedMs, cfg.hullHp).lengthM * 0.45
  }
  state.cfg = cfg
  resizeArena(state, size)
  return true
}

export { liveFactions }
export type { HullState }
