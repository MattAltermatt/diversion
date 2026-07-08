// Turtle-graphics core: pure, framework-agnostic, unit-testable in isolation.
// A worm is a turtle with position + heading + a *turning velocity* that itself
// randomly drifts each step (clamped) — the source of the meandering, self-similar
// wiggle that reads as "vermiculated" (worm-tracked) rather than a rigid spiral.
// This mirrors the real xscreensaver `vermiculate.c` mode where the turn amount
// (`spiturn`) accumulates a small per-step increment instead of being fixed —
// clean-room reimplemented here as an explicit angular-velocity random walk.

export interface Turtle {
  x: number
  y: number
  heading: number // radians
  turnVel: number // radians turned per step (itself drifts each step)
  pathDist: number // total distance crawled since the last respawn (drives color cycling)
  stuckStreak: number // consecutive steps landing on already-dense ground
}

export interface StepCfg {
  stepSize: number // px per step
  turnJitter: number // radians — max random delta applied to turnVel per step
  turnClamp: number // radians — clamp on |turnVel|
}

export interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** A freshly spawned turtle at the origin, facing right, not yet turning. Callers
 *  place it (position/heading) before stepping — see sim.ts `respawn`. */
export function makeTurtle(): Turtle {
  return { x: 0, y: 0, heading: 0, turnVel: 0, pathDist: 0, stuckStreak: 0 }
}

/** Advance a turtle by one discrete step, mutating it in place, and return the
 *  segment just traced. Order: the turn rate itself drifts (random walk, clamped),
 *  heading integrates the (new) turn rate, then position advances by `stepSize`
 *  along the new heading. Pure given `rng` — same turtle + cfg + rng sequence
 *  always produces the same segment (determinism keystone). */
export function stepTurtle(t: Turtle, cfg: StepCfg, rng: () => number): Segment {
  const x0 = t.x
  const y0 = t.y
  if (cfg.turnJitter > 0) {
    t.turnVel += (rng() * 2 - 1) * cfg.turnJitter
  }
  if (t.turnVel > cfg.turnClamp) t.turnVel = cfg.turnClamp
  else if (t.turnVel < -cfg.turnClamp) t.turnVel = -cfg.turnClamp
  t.heading += t.turnVel
  const x1 = x0 + Math.cos(t.heading) * cfg.stepSize
  const y1 = y0 + Math.sin(t.heading) * cfg.stepSize
  t.x = x1
  t.y = y1
  t.pathDist += cfg.stepSize
  return { x0, y0, x1, y1 }
}
