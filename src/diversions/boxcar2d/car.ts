import {
  createWorld, destroyWorld, stepWorld, buildTerrainBody,
  createPolygonBody, createCircleBody, createWheelJoint,
  getBodyPosition, type WorldId, type BodyId, type Vec2,
} from './physics'
import { type Genome, N_VERTICES } from './genome'

export const CAR_GROUP = -1

export interface CarBodies {
  chassis: BodyId
  wheels: { body: BodyId; radius: number }[]
  /** Chassis local vertices (meters) — computed once at build, reused by render. */
  verts: Vec2[]
}
export interface SimCfg {
  gravity: number; maxSteps: number; stallSteps: number; progressEps: number
  motorSpeed: number; motorTorque: number; spawnX: number; spawnY: number
}
export interface SimResult { fitness: number }

export function chassisVertices(g: Genome): Vec2[] {
  return g.mags.map((m, k) => {
    const a = (k / N_VERTICES) * Math.PI * 2
    return { x: Math.cos(a) * m, y: Math.sin(a) * m }
  })
}

export function buildCar(
  worldId: WorldId, g: Genome, spawn: Vec2, motor: { speed: number; torque: number },
): CarBodies {
  const verts = chassisVertices(g)
  const chassis = createPolygonBody(worldId, {
    position: { x: spawn.x, y: spawn.y },
    vertices: verts, density: g.chassisDensity, friction: 0.4, groupIndex: CAR_GROUP,
  })
  const wheels: { body: BodyId; radius: number }[] = []
  for (const w of g.wheels) {
    if (!w.present) continue
    const v = verts[w.vertex]
    const body = createCircleBody(worldId, {
      position: { x: spawn.x + v.x, y: spawn.y + v.y },
      radius: w.radius, density: w.density, friction: 1.0, groupIndex: CAR_GROUP,
    })
    createWheelJoint(worldId, {
      chassis, wheel: body, localAnchorA: v, axisX: 0, axisY: 1,
      enableSpring: true, hertz: 4, dampingRatio: 0.7,
      enableMotor: true, motorSpeed: -motor.speed, maxMotorTorque: motor.torque,
    })
    wheels.push({ body, radius: w.radius })
  }
  return { chassis, wheels, verts }
}

export function simulateCar(g: Genome, terrain: Vec2[], cfg: SimCfg): SimResult {
  const world = createWorld(cfg.gravity)
  buildTerrainBody(world, terrain)
  const car = buildCar(world, g, { x: cfg.spawnX, y: cfg.spawnY }, { speed: cfg.motorSpeed, torque: cfg.motorTorque })
  let maxX = cfg.spawnX
  let stall = 0
  // stall = no NEW forward distance for `stallSteps` (mirrors the live diversion)
  for (let i = 0; i < cfg.maxSteps; i++) {
    stepWorld(world, 1)
    const px = getBodyPosition(car.chassis).x
    if (px > maxX + cfg.progressEps) {
      maxX = px
      stall = 0
    } else if (++stall >= cfg.stallSteps) break
  }
  destroyWorld(world)
  return { fitness: Math.max(0, maxX - cfg.spawnX) }
}
