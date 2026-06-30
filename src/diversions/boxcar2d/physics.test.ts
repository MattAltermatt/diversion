import { describe, it, expect } from 'vitest'
import {
  createWorld,
  createCircleBody,
  createPolygonBody,
  buildTerrainBody,
  stepWorld,
  getBodyPosition,
  getBodyLinearVelocityX,
  destroyWorld,
} from './physics'

describe('physics seam', () => {
  it('a dynamic body falls under gravity (meters, Y-up)', () => {
    const world = createWorld(-10)
    const ball = createCircleBody(world, {
      position: { x: 0, y: 0 },
      radius: 0.5,
      density: 1,
      friction: 0.5,
      groupIndex: 0,
    })
    const y0 = getBodyPosition(ball).y
    stepWorld(world, 60) // 1 simulated second
    const y1 = getBodyPosition(ball).y
    expect(y1).toBeLessThan(y0) // gravity is -Y → world-y decreases
    destroyWorld(world)
  })

  it('same inputs → identical fall (determinism)', () => {
    const run = () => {
      const w = createWorld(-10)
      const b = createCircleBody(w, {
        position: { x: 0, y: 0 },
        radius: 0.5,
        density: 1,
        friction: 0.5,
        groupIndex: 0,
      })
      stepWorld(w, 120)
      const y = getBodyPosition(b).y
      destroyWorld(w)
      return y
    }
    expect(run()).toBe(run())
  })

  it('a polygon rests on terrain instead of falling forever', () => {
    const world = createWorld(-10)
    // flat ground at y = 0 spanning x ∈ [-5, 5]
    buildTerrainBody(world, [
      { x: -5, y: 0 },
      { x: 5, y: 0 },
    ])
    const box = createPolygonBody(world, {
      position: { x: 0, y: 3 },
      vertices: [
        { x: -0.5, y: -0.5 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ],
      density: 1,
      friction: 0.5,
      groupIndex: 0,
    })
    stepWorld(world, 240) // 4 s — long enough to settle
    const y = getBodyPosition(box).y
    const vx = getBodyLinearVelocityX(box)
    expect(y).toBeGreaterThan(-0.5) // didn't fall through the ground
    expect(y).toBeLessThan(3) // did fall from its spawn
    expect(Number.isFinite(vx)).toBe(true)
    destroyWorld(world)
  })
})
