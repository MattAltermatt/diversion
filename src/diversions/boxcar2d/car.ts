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
  getBodyPosition, getBodyAngle, type WorldId, type BodyId, type Vec2,
} from './physics'
import { type Genome, pairIndex } from './genome'
import { triangulateEdges } from './triangulate'

export const CAR_GROUP = -1

// A car that flings to astronomical distance (rare with the raised motor ceilings —
// measured 6.5e244 m) would poison distance-mode fitness/selection totals. This cap
// is ~200× any real goal, so it never clips a legit run; it only catches blow-ups.
export const SANE_DIST_CAP = 100_000
export function isExploded(px: number, spawnX: number): boolean {
  return !Number.isFinite(px) || px - spawnX > SANE_DIST_CAP
}

// 🎚️ mechanism constants (not user balance). Node size/friction and wheel
// suspension (hertz/damping/axis/travel) are now per-car GENES (genome.ts) — only
// the truss-member spring bounds stay fixed here (pinned to the 60Hz-substep buzz
// limit, deliberately NOT widened).
const HERTZ_MIN = 2          // stiffness 0 → soft spring (floor raised off 0.8 to curb bounce)
const HERTZ_MAX = 10          // stiffness 1 → near-rigid bar (capped to curb 60Hz-step buzz)
const DAMP_MIN = 0.3          // floor raised off 0.1 so even soft springs settle (no ring/jitter)
const DAMP_MAX = 1.0

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
      radius: o.n.radius, density: o.n.mass, friction: o.n.friction, groupIndex: CAR_GROUP,
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
      // suspension axis is now a gene: θ=0 is vertical, ±θ rakes the strut.
      axisX: Math.sin(w.suspensionAxis), axisY: Math.cos(w.suspensionAxis),
      enableSpring: true, hertz: w.suspensionHertz, dampingRatio: w.suspensionDamping,
      lowerTranslation: -w.suspensionTravel, upperTranslation: w.suspensionTravel,
      // negate so the (always ≥0) gene drives the car forward: the joint motor
      // spins the wheel to move the car +x.
      enableMotor: w.powered, motorSpeed: -w.motorSpeed, maxMotorTorque: w.torque,
    })
    wheels.push({ body, radius: w.radius })
  }

  return { nodes, members, wheels }
}

/** Flat per-step pose snapshot for ghost recording (#227): every node's (x,y) then
 *  every wheel's (x,y,angle), world meters — the exact order ghost.ts decodes. */
export function capturePose(car: CarBodies): number[] {
  const out: number[] = []
  for (const nd of car.nodes) { const p = getBodyPosition(nd.body); out.push(p.x, p.y) }
  for (const w of car.wheels) {
    const p = getBodyPosition(w.body)
    out.push(p.x, p.y, getBodyAngle(w.body))
  }
  return out
}

/** A car's static rest shape (local meters, Y-up), derived purely from its Genome —
 *  NO physics world. Mirrors buildCar's active-node filter, Delaunay members, and
 *  wheel-mount logic so a thumbnail matches the body the sim builds. Used by the
 *  leaderboard (#225) to draw champion mini-cars, precomputed once per champion. */
export interface CarShape {
  nodes: { x: number; y: number }[]
  members: { a: number; b: number; stiffness: number }[]
  wheels: { x: number; y: number; radius: number }[]
  /** Local-space bbox over nodes + wheel discs, precomputed so the thumbnail fit is
   *  a few arithmetic ops per frame instead of a rescan of every point. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
}
export function staticCarShape(g: Genome): CarShape {
  const active = g.nodes.map((n, i) => ({ n, slot: i })).filter((o) => o.n.present)
  const local = active.map((o) => ({ x: o.n.x, y: o.n.y }))
  const members: CarShape['members'] = triangulateEdges(local).map(([ai, bi]) => ({
    a: ai,
    b: bi,
    stiffness: g.pairs[pairIndex(active[ai].slot, active[bi].slot)].stiffness,
  }))
  const slotToArr = new Map(active.map((o, k) => [o.slot, k]))
  const wheels: CarShape['wheels'] = []
  for (const w of g.wheels) {
    if (!w.present) continue
    const k = slotToArr.get(w.node)
    if (k === undefined) continue // unreachable after repair; guards a malformed genome
    wheels.push({ x: local[k].x, y: local[k].y, radius: w.radius })
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const n of local) {
    minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x)
    minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y)
  }
  for (const wl of wheels) {
    minX = Math.min(minX, wl.x - wl.radius); maxX = Math.max(maxX, wl.x + wl.radius)
    minY = Math.min(minY, wl.y - wl.radius); maxY = Math.max(maxY, wl.y + wl.radius)
  }
  return { nodes: local, members, wheels, bounds: { minX, maxX, minY, maxY } }
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
    if (isExploded(px, cfg.spawnX)) break // do NOT let a blow-up (6.5e244) become fitness
    if (px > maxX + cfg.progressEps) { maxX = px; stall = 0 }
    else if (++stall >= cfg.stallSteps) break
  }
  destroyWorld(world)
  return { fitness: Math.max(0, maxX - cfg.spawnX) }
}
