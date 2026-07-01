import { describe, it, expect } from 'vitest'
import { simulateCar, buildCar, carCentroid } from './car'
import { randomGenome } from './genome'
import { makeTerrain, terrainPoints } from './terrain'
import { createWorld, destroyWorld, buildTerrainBody, stepWorld, getBodyPosition } from './physics'
import { mulberry32 } from '../../framework/rng'
import { triangulateEdges } from './triangulate'

const TERRAIN = terrainPoints(makeTerrain(1, 0.5), 0, 300, 1.5)
const CFG = { gravity: -10, maxSteps: 1200, stallSteps: 180, progressEps: 0.1, spawnX: 2, spawnY: 3 }

describe('buildCar', () => {
  it('creates one body per active node, one member per Delaunay edge, one body per active wheel', () => {
    const g = randomGenome(mulberry32(7))
    const world = createWorld(-10)
    buildTerrainBody(world, TERRAIN)
    const car = buildCar(world, g, { x: 2, y: 3 })

    const activeNodes = g.nodes.filter(n => n.present).length
    const activeWheels = g.wheels.filter(w => w.present).length
    const localPts = g.nodes.filter(n => n.present).map(n => ({ x: n.x, y: n.y }))

    expect(car.nodes).toHaveLength(activeNodes)
    expect(car.members).toHaveLength(triangulateEdges(localPts).length)
    expect(car.wheels).toHaveLength(activeWheels)
    destroyWorld(world)
  })
})

describe('carCentroid', () => {
  it('returns the mean of the node positions', () => {
    const g = randomGenome(mulberry32(3))
    const world = createWorld(-10)
    buildTerrainBody(world, TERRAIN)
    const car = buildCar(world, g, { x: 2, y: 3 })
    const c = carCentroid(car)
    expect(Number.isFinite(c.x)).toBe(true)
    expect(Number.isFinite(c.y)).toBe(true)
    destroyWorld(world)
  })
})

describe('wheel attachment', () => {
  it('wheels stay attached to the truss after a long run (no fling-off)', () => {
    // Regression: an unbounded wheel-joint axis let wheels slide off their
    // free-spinning node anchors and shoot away. Suspension travel is now a per-
    // wheel gene capped at suspTravelMax (0.09 m), with stiffness/damping floors
    // that keep the soft extreme from overshooting the joint limit — so each wheel
    // must stay within ~0.12 m (max travel + solver slack) of its mount node.
    for (const seed of [1, 7, 13, 21]) {
      const g = randomGenome(mulberry32(seed))
      const world = createWorld(-10)
      buildTerrainBody(world, TERRAIN)
      const car = buildCar(world, g, { x: 2, y: 3 })
      for (let i = 0; i < 800; i++) stepWorld(world, 1)
      for (const w of car.wheels) {
        const wp = getBodyPosition(w.body)
        let nearest = Infinity
        for (const nd of car.nodes) {
          const np = getBodyPosition(nd.body)
          nearest = Math.min(nearest, Math.hypot(wp.x - np.x, wp.y - np.y))
        }
        expect(nearest).toBeLessThan(0.12) // ≤ WHEEL_TRAVEL (0.06) + slack
      }
      destroyWorld(world)
    }
  })
})

describe('simulateCar', () => {
  it('same genome + terrain → identical fitness (determinism keystone)', () => {
    const g = randomGenome(mulberry32(7))
    expect(simulateCar(g, TERRAIN, CFG).fitness).toBe(simulateCar(g, TERRAIN, CFG).fitness)
  })
  it('returns a finite, non-negative distance', () => {
    const g = randomGenome(mulberry32(8))
    const f = simulateCar(g, TERRAIN, CFG).fitness
    expect(Number.isFinite(f)).toBe(true)
    expect(f).toBeGreaterThanOrEqual(0)
  })
})
