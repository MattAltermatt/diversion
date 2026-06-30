/**
 * physics.ts — the single phaser-box2d (Box2D v3) seam for BoxCar2D.
 *
 * Everything that touches `phaser-box2d` lives here; the rest of the diversion
 * never imports the engine. The package is untyped, so opaque handles are aliased
 * (`WorldId`/`BodyId`/`JointId`) and the loose API is wrapped behind typed funcs.
 *
 * COORDINATE CONVENTION: this seam works entirely in Box2D's native space —
 * METERS, Y-up. The one and only conversion to canvas space (pixels, Y-down)
 * happens at render time (render.ts), via `* SCALE` and a Y-flip. Keeping the
 * seam meters-native removes the px/Y-flip juggling that otherwise infects every
 * body spawn and read.
 *
 * Deterministic stepping: `stepWorld` runs a FIXED count of `1/60 s` sub-steps —
 * the CALLER owns the step budget (never wall-clock dt), so a given seed + step
 * count reproduces a run exactly (Box2D itself has no internal RNG).
 *
 * Has ZERO React/DOM/Phaser imports → runs headless under vitest.
 */
import {
  CreateWorld,
  CreatePolygon,
  CreateCircle,
  CreateWheelJoint,
  CreateDistanceJoint,
  WorldStep,
  SetWorldScale,
  b2DefaultWorldDef,
  b2DefaultBodyDef,
  b2DefaultShapeDef,
  b2CreateBody,
  b2CreateSegmentShape,
  b2Segment,
  b2Vec2,
  b2Body_GetPosition,
  b2Body_GetRotation,
  b2Body_GetLinearVelocity,
  b2DestroyBody,
  b2DestroyWorld,
  STATIC,
  DYNAMIC,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} from 'phaser-box2d/dist/PhaserBox2D.js'

/* phaser-box2d ships loose/no types; these aliases keep the seam honest without
 * leaking `any` into the rest of the codebase. */
/* eslint-disable @typescript-eslint/no-explicit-any */
export type WorldId = any
export type BodyId = any
export type JointId = any
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface Vec2 {
  x: number
  y: number
}

/** Pixels per meter. The render layer multiplies meters by this to draw. */
export const SCALE = 32

const FIXED_DT = 1 / 60

// ── World lifecycle ──────────────────────────────────────────────────────────
/** Create a world. `gravityY` in m/s² (negative = down, Box2D Y-up). */
export function createWorld(gravityY: number): WorldId {
  SetWorldScale(SCALE)
  const worldDef = b2DefaultWorldDef()
  worldDef.gravity = new b2Vec2(0, gravityY)
  const w = CreateWorld({ worldDef })
  return w.worldId
}

/** Advance the world by exactly `fixedSteps` deterministic 1/60 s sub-steps. */
export function stepWorld(worldId: WorldId, fixedSteps: number): void {
  for (let i = 0; i < fixedSteps; i++) {
    WorldStep({ worldId, deltaTime: FIXED_DT })
  }
}

/** Destroy a world and everything it owns (bodies, shapes, joints). The leak
 *  guard for a long-running screensaver that rebuilds worlds each run. */
export function destroyWorld(worldId: WorldId): void {
  b2DestroyWorld(worldId)
}

// ── Body creation (all distances in METERS, Y-up) ────────────────────────────
export interface PolygonOpts {
  /** Body-center world position, meters. */
  position: Vec2
  /** Convex-ish local vertices, meters (the engine convex-hulls them). */
  vertices: Vec2[]
  density: number
  friction: number
  /** Box2D collision group: shapes sharing a NEGATIVE group never collide. */
  groupIndex: number
}

export function createPolygonBody(worldId: WorldId, opts: PolygonOpts): BodyId {
  const result = CreatePolygon({
    worldId,
    type: DYNAMIC,
    position: new b2Vec2(opts.position.x, opts.position.y),
    vertices: opts.vertices.map((v) => new b2Vec2(v.x, v.y)),
    density: opts.density,
    friction: opts.friction,
    groupIndex: opts.groupIndex,
  })
  return result.bodyId
}

export interface CircleOpts {
  position: Vec2 // world meters
  radius: number // meters
  density: number
  friction: number
  groupIndex: number
}

export function createCircleBody(worldId: WorldId, opts: CircleOpts): BodyId {
  const result = CreateCircle({
    worldId,
    bodyDef: b2DefaultBodyDef(),
    type: DYNAMIC,
    position: new b2Vec2(opts.position.x, opts.position.y),
    radius: opts.radius,
    density: opts.density,
    friction: opts.friction,
    groupIndex: opts.groupIndex,
  })
  return result.bodyId
}

export interface WheelJointOpts {
  chassis: BodyId
  wheel: BodyId
  /** Mount point in CHASSIS-LOCAL meters (the axle on the chassis). */
  localAnchorA: Vec2
  /** Suspension axis (chassis-local). (0,1) = vertical travel. */
  axisX: number
  axisY: number
  enableSpring: boolean
  hertz: number
  dampingRatio: number
  enableMotor: boolean
  motorSpeed: number
  maxMotorTorque: number
  /** Suspension travel limits (meters along the axis). Omit → unlimited travel.
   *  Bounding this stops a wheel sliding off its anchor when the anchor body
   *  spins (truss nodes are free-spinning circles, unlike a big rigid chassis). */
  lowerTranslation?: number
  upperTranslation?: number
}

/** Motorized wheel joint = the canonical BoxCar2D wheel (drive + suspension). */
export function createWheelJoint(worldId: WorldId, opts: WheelJointOpts): JointId {
  const result = CreateWheelJoint({
    worldId,
    bodyIdA: opts.chassis,
    bodyIdB: opts.wheel,
    anchorA: new b2Vec2(opts.localAnchorA.x, opts.localAnchorA.y),
    anchorB: new b2Vec2(0, 0), // wheel center
    axis: new b2Vec2(opts.axisX, opts.axisY),
    enableSpring: opts.enableSpring,
    hertz: opts.hertz,
    dampingRatio: opts.dampingRatio,
    enableLimit: opts.lowerTranslation !== undefined || opts.upperTranslation !== undefined,
    lowerTranslation: opts.lowerTranslation,
    upperTranslation: opts.upperTranslation,
    enableMotor: opts.enableMotor,
    motorSpeed: opts.motorSpeed,
    maxMotorTorque: opts.maxMotorTorque,
    collideConnected: false,
  })
  return result.jointId
}

export interface DistanceJointOpts {
  bodyA: BodyId
  bodyB: BodyId
  /** Rest length in meters (set to the bodies' current separation at build). */
  length: number
  /** Spring frequency (Hz). High ≈ rigid bar; low ≈ floppy spring. */
  hertz: number
  dampingRatio: number
}

/** Spring distance joint between two node bodies = one truss member. Anchored at
 *  each body's center (node circles are centered on the node), so `length` is the
 *  node-to-node rest distance. A "rigid bar" is simply a very high `hertz`. */
export function createDistanceJoint(worldId: WorldId, opts: DistanceJointOpts): JointId {
  const result = CreateDistanceJoint({
    worldId,
    bodyIdA: opts.bodyA,
    bodyIdB: opts.bodyB,
    anchorA: new b2Vec2(0, 0),
    anchorB: new b2Vec2(0, 0),
    length: opts.length,
    enableSpring: true,
    hertz: opts.hertz,
    dampingRatio: opts.dampingRatio,
    collideConnected: false,
  })
  return result.jointId
}

/** Static terrain from a polyline (meters, Y-up) → one body, per-segment edges. */
export function buildTerrainBody(worldId: WorldId, points: Vec2[]): BodyId {
  const bodyDef = b2DefaultBodyDef()
  bodyDef.type = STATIC
  const bodyId = b2CreateBody(worldId, bodyDef)
  const shapeDef = b2DefaultShapeDef()
  shapeDef.friction = 0.9
  for (let i = 1; i < points.length; i++) {
    const seg = new b2Segment(
      new b2Vec2(points[i - 1].x, points[i - 1].y),
      new b2Vec2(points[i].x, points[i].y),
    )
    b2CreateSegmentShape(bodyId, shapeDef, seg)
  }
  return bodyId
}

// ── Body reads (METERS, Y-up — render flips for canvas) ───────────────────────
export function getBodyPosition(bodyId: BodyId): Vec2 {
  const p = b2Body_GetPosition(bodyId)
  return { x: p.x, y: p.y }
}

/** Body angle in radians (Box2D Y-up convention). Render negates for canvas. */
export function getBodyAngle(bodyId: BodyId): number {
  const r = b2Body_GetRotation(bodyId)
  return Math.atan2(r.s, r.c)
}

/** Horizontal velocity (m/s) — for stall detection. */
export function getBodyLinearVelocityX(bodyId: BodyId): number {
  return b2Body_GetLinearVelocity(bodyId).x
}

export function destroyBody(bodyId: BodyId): void {
  b2DestroyBody(bodyId)
}
