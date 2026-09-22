// Every number the simulation reads, in METRES and SECONDS.
//
// The framework's dt is MILLISECONDS; `index.ts` converts once and nothing
// else in this folder ever sees a millisecond.

export interface PoolNavyConfig {
  seed: number
  /** Playback rate. */
  tempo: number
  poolWidthM: number
  poolHeightM: number
  /** Hulls per side at t=0, and hulls one new faction supplies. */
  sideSize: number
  topSpeedMs: number
  hullHp: number
  /** Speed at LIMP_HP condition, as a fraction of top speed. */
  limpSpeed: number
  /** Chance a replacement is a dreadnought, when the single slot is free. */
  dreadnoughtChance: number
  background: string
  palette: string[]
  showWakes: boolean
}

export const DEFAULTS: PoolNavyConfig = {
  seed: 1,
  tempo: 0.6,
  poolWidthM: 8,
  poolHeightM: 4.5,
  sideSize: 3,
  topSpeedMs: 0.5,
  hullHp: 90,
  limpSpeed: 0.09,
  dreadnoughtChance: 0.08,
  background: '#1f7fb8',
  palette: ['#e5534b', '#4a9df0', '#54d98c', '#f5c518'],
  showWakes: true,
}

/** Fixed sim step, SECONDS. */
export const FIXED_DT = 1 / 120
/** Catch-up cap, so a backgrounded tab does not spiral. */
export const MAX_SUBSTEPS = 480

/** Linear drag as a multiple of the quadratic term at top speed. */
export const LINEAR_DRAG_FRACTION = 1.2
/** Lateral vs forward drag. The single difference between a boat and a puck. */
export const LATERAL_DRAG_RATIO = 15
/** Steady turn radius at cruise, in hull lengths. */
export const TURN_RADIUS_HULLS = 3.0
export const ANGULAR_DRAG_FACTOR = 2.0

export const HELM_P_GAIN = 2.2
export const HELM_D_GAIN = 0.85
export const HELM_CRUISE_THROTTLE = 1.0

export const STANDOFF_FRACTION = 0.75
export const STANDOFF_ENGAGE_FRACTION = 1.15
export const TARGET_SWITCH_HYSTERESIS = 0.25

/**
 * Fraction of top speed below which a rudder has too little flow to bite.
 * Relative, not absolute: the roster's top speed is a live config field, and an
 * absolute threshold would silently reclassify healthy hulls as stalled.
 */
export const WAY_FRACTION = 0.065

/**
 * Speed a hull makes at zero condition.
 *
 * ⚠️ NOT a look choice — it is the stall guard. Below WAY_FRACTION a rudder
 * has no flow over it and the hull cannot steer at all, so it pins on the
 * first wall it touches (measured without wall avoidance: 74.9% of
 * ship-samples stalled, 99.9% against a wall).
 *
 * It sat at 3x that threshold while `limpSpeed` was 0.25. The owner asked for
 * a hull at 20% condition to be "basically dead in the water", which is 0.09 —
 * BELOW the old floor — so the floor has to come down with it. 1.15x is the
 * narrowest margin that still leaves a dying hull steerable; going to 1.0x
 * hands it to the nearest wall. The stall rate is measured after this change,
 * not assumed.
 */
export const SPEED_FLOOR = 1.15 * WAY_FRACTION

/** The condition `limpSpeed` is quoted at. */
export const LIMP_HP = 0.2

/**
 * Wall avoidance, measured. Turn circles of clearance, and how hard the wall
 * bends the ordered heading.
 *
 * Swept with walls present and the stall counter live (backyard, 5 seeds):
 *   1.50 / 2.2 -> 37.2 %    2.25 / 2.2 -> 15.2 %    3.00 / 4.0 -> 0.1 %
 *   1.50 / 7.0 ->  7.6 %    2.25 / 4.0 ->  2.8 %    2.25 / 7.0 -> 0.4 %
 * 3.00 scores marginally better but a margin is a no-go zone, and 3.00 turn
 * circles is 2.25 m into a 4.5 m pool — the hulls stop using the ends and the
 * pool reads smaller than it is. 2.25 / 7.0 is the best score at a margin that
 * still leaves open water.
 */
export const WALL_MARGIN_RADII = 2.25
export const WALL_AVOID_GAIN = 7.0
export const WALL_RESTITUTION = 0.15

/**
 * Along-wall friction. Zero: the pool wall is smooth tile and the hull is
 * smooth plastic.
 *
 * ⚠️ Honest about its own weight. Friction WAS the first fix found for hulls
 * pinning on the tiles, and alone it was worth a lot — 9.8% of ship-samples
 * stalled at 0.2 against 2.8% at 0.0. But WALL_SHED below was added afterwards
 * and subsumes it. Re-measured in the shipped code (kiddie, 3 seeds, 300 sim-s):
 *
 *     shed 12, friction 0.0 -> 0.83%     shed 0, friction 0.0 -> 9.32%
 *     shed 12, friction 0.2 -> 0.98%     shed 0, friction 0.2 -> 7.04%
 *
 * So with the shed present, friction moves the stall rate by 0.15 points and
 * no test can separate 0.0 from 0.2. It stays at 0 because that is what a
 * tiled pool is and it is marginally better — NOT because it carries the
 * mechanism. The 9.8/2.8 figures predate the shed; they are history here, not
 * a current claim.
 */
export const WALL_FRICTION = 0.0

/**
 * How hard a wall slews a hull that noses into it, as a fraction of the
 * contact impulse acting at the bow.
 *
 * ⚠️ This is the mechanism, not the friction. The wall's reaction does not act
 * through the centre of mass — it acts at whatever part is touching, which is
 * the bow — so an off-centre impulse is a TORQUE, and it turns a boat parallel
 * to the wall. Without it a hull driven square into the tiles has no along-wall
 * component to slide with and simply sits there at full throttle. It vanishes
 * at exactly 90 degrees, which is a real balance point; WALL_SHED_BIAS breaks
 * it, standing in for the fact that no hull is perfectly symmetric.
 *
 * This is the DOMINANT wall fix, not the friction above. Measured in the
 * shipped code (kiddie, 3 seeds, 300 sim-s):
 *   torque off   ->  9.32% stalled, worst pin 100 s
 *   torque 12    ->  0.83% stalled, worst pin  13 s   <- ship this
 * And with the sign backwards, in an earlier sweep: 9.82% / 240 s — a
 * value-independent worsening, which is the signature of a sign error.
 */
export const WALL_SHED = 12.0
export const WALL_SHED_BIAS = 0.12

export const BEARING_TOLERANCE_DEG = 2.5
export const SPLASH_LIFE_SEC = 0.25
export const MUZZLE_LIFE_SEC = 0.09

/**
 * Exponent that makes the damage->speed curve pass through (LIMP_HP, limpSpeed).
 *
 * The shape is `floor + (1 - floor) * h^p` rather than a straight line, and the
 * reason is load-bearing: a line is pinned at both ends, so the only way to drag
 * 20% condition down to a limp is to drag the zero-condition floor with it —
 * straight into SPEED_FLOOR's stall threshold. A power curve sags in the middle
 * while holding the floor up, so a wounded hull is slow AND still steerable.
 */
export function limpExponent(limpSpeed: number): number {
  const reach = (limpSpeed - SPEED_FLOOR) / (1 - SPEED_FLOOR)
  // A limp at or below the floor is unreachable; clamp to a near-step curve.
  if (reach <= 1e-6) return 12
  return Math.log(reach) / Math.log(LIMP_HP)
}

/** Speed a hull may still make, as a fraction of its own top speed. */
export function speedScale(hpFraction: number, limpSpeed: number): number {
  const h = Math.max(0, Math.min(1, hpFraction))
  return SPEED_FLOOR + (1 - SPEED_FLOOR) * Math.pow(h, limpExponent(limpSpeed))
}

/**
 * Throttle that settles a hull at `target` of its top speed.
 *
 * Drag carries a linear AND a quadratic term, so scaling throttle by condition
 * directly would produce a slow-down curve nobody chose. Inverting the drag law
 * makes the knob mean what it says:
 *   T(v) = kQuad * (v^2 + f*vt*v),  T(vt) = kQuad * vt^2 * (1 + f)
 *   => T(s*vt) / T(vt) = (s^2 + f*s) / (1 + f)
 */
export function throttleForSpeedFraction(target: number): number {
  const f = LINEAR_DRAG_FRACTION
  const s = Math.max(0, Math.min(1, target))
  return (s * s + f * s) / (1 + f)
}
