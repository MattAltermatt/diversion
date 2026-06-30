/**
 * car.ts — turns a truss Genome into Box2D bodies and runs a headless solo sim.
 *
 * Each active node → a small circle body (it bumps terrain). The active nodes'
 * local positions are Delaunay-triangulated; every edge → a spring distance joint
 * (a "rigid bar" is just a very high hertz). Each active wheel → a circle body
 * joined to its mount node by a motorized wheel joint with its own SIGNED speed
 * (negative = backward) and torque. There is no single chassis body — progress is
 * tracked via the node centroid.
 */
import {
  createWorld, destroyWorld, stepWorld, buildTerrainBody,
  createCircleBody, createWheelJoint, createDistanceJoint,
  getBodyPosition, type WorldId, type BodyId, type Vec2,
} from './physics'
import { type Genome, pairIndex } from './genome'
import { triangulateEdges } from './triangulate'

export const CAR_GROUP = -1

// 🎚️ mechanism constants (not user balance).
const NODE_RADIUS = 0.10      // m — collision disc for every node
const NODE_FRICTION = 0.5
const HERTZ_MIN = 2          // stiffness 0 → soft spring (floor raised off 0.8 to curb bounce)
const HERTZ_MAX = 10          // stiffness 1 → near-rigid bar (capped to curb 60Hz-step buzz)
const DAMP_MIN = 0.3          // floor raised off 0.1 so even soft springs settle (no ring/jitter)
const DAMP_MAX = 1.0
const WHEEL_HERTZ = 4         // wheel suspension: soft enough to keep traction over
const WHEEL_DAMPING = 1.0     // terrain (drivability), but critically damped so it
                             // absorbs instead of bouncing/wobbling (was 0.7 = bouncy)
// Suspension travel cap (m). The truss members already provide the springy give,
// so the wheel only needs a few cm of axle travel. Bounding it stops a wheel
// sliding off its free-spinning node anchor under a hard impulse.
const WHEEL_TRAVEL = 0.06

export interface CarBodies {
  /** Active nodes only, each tagged with its original genome slot (for pair lookup). */
  nodes: { body: BodyId; slot: number }[]
  /** Members as index pairs into `nodes[]`, plus the edge stiffness (for render). */
  members: { a: number; b: number; stiffness: number }[]
  wheels: { body: BodyId; radius: number }[]
}
export interface SimCfg {
  gravity: number; maxSteps: number; stallSteps: number; progressEps: number
  spawnX: number; spawnY: number
}
export interface SimResult { fitness: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function buildCar(worldId: WorldId, g: Genome, spawn: Vec2): CarBodies {
  const active = g.nodes.map((n, i) => ({ n, slot: i })).filter(o => o.n.present)
  const local = active.map(o => ({ x: o.n.x, y: o.n.y }))
  const nodes = active.map(o => ({
    body: createCircleBody(worldId, {
      position: { x: spawn.x + o.n.x, y: spawn.y + o.n.y },
      radius: NODE_RADIUS, density: o.n.mass, friction: NODE_FRICTION, groupIndex: CAR_GROUP,
    }),
    slot: o.slot,
  }))

  // members = Delaunay edges of the active nodes (indices into the active array)
  const members: CarBodies['members'] = []
  for (const [ai, bi] of triangulateEdges(local)) {
    const pg = g.pairs[pairIndex(nodes[ai].slot, nodes[bi].slot)]
    const dx = local[bi].x - local[ai].x
    const dy = local[bi].y - local[ai].y
    createDistanceJoint(worldId, {
      bodyA: nodes[ai].body, bodyB: nodes[bi].body,
      length: Math.hypot(dx, dy),
      hertz: lerp(HERTZ_MIN, HERTZ_MAX, pg.stiffness),
      dampingRatio: lerp(DAMP_MIN, DAMP_MAX, pg.damping),
    })
    members.push({ a: ai, b: bi, stiffness: pg.stiffness })
  }

  // wheels mount to a node body (repair guarantees the slot is active)
  const slotToArr = new Map(nodes.map((nd, k) => [nd.slot, k]))
  const wheels: CarBodies['wheels'] = []
  for (const w of g.wheels) {
    if (!w.present) continue
    const k = slotToArr.get(w.node)
    if (k === undefined) continue // unreachable after repair; guards a malformed genome
    const np = getBodyPosition(nodes[k].body)
    const body = createCircleBody(worldId, {
      position: { x: np.x, y: np.y }, radius: w.radius, density: w.mass,
      friction: w.grip, groupIndex: CAR_GROUP,
    })
    createWheelJoint(worldId, {
      chassis: nodes[k].body, wheel: body, localAnchorA: { x: 0, y: 0 },
      axisX: 0, axisY: 1, enableSpring: true, hertz: WHEEL_HERTZ, dampingRatio: WHEEL_DAMPING,
      lowerTranslation: -WHEEL_TRAVEL, upperTranslation: WHEEL_TRAVEL,
      // negate so the (always ≥0) gene drives the car forward: the joint motor
      // spins the wheel to move the car +x.
      enableMotor: w.powered, motorSpeed: -w.motorSpeed, maxMotorTorque: w.torque,
    })
    wheels.push({ body, radius: w.radius })
  }

  return { nodes, members, wheels }
}

/** Mean of the node body positions — the car's reference point (no single chassis). */
export function carCentroid(car: CarBodies): Vec2 {
  let sx = 0, sy = 0
  for (const nd of car.nodes) { const p = getBodyPosition(nd.body); sx += p.x; sy += p.y }
  const n = car.nodes.length || 1
  return { x: sx / n, y: sy / n }
}

export function simulateCar(g: Genome, terrain: Vec2[], cfg: SimCfg): SimResult {
  const world = createWorld(cfg.gravity)
  buildTerrainBody(world, terrain)
  const car = buildCar(world, g, { x: cfg.spawnX, y: cfg.spawnY })
  let maxX = cfg.spawnX
  let stall = 0
  for (let i = 0; i < cfg.maxSteps; i++) {
    stepWorld(world, 1)
    const px = carCentroid(car).x
    if (px > maxX + cfg.progressEps) { maxX = px; stall = 0 }
    else if (++stall >= cfg.stallSteps) break
  }
  destroyWorld(world)
  return { fitness: Math.max(0, maxX - cfg.spawnX) }
}
