import { describe, it, expect } from 'vitest'
import { simulateCar, chassisVertices } from './car'
import { randomGenome, N_VERTICES } from './genome'
import { makeTerrain, terrainPoints } from './terrain'
import { mulberry32 } from '../../framework/rng'

const TERRAIN = terrainPoints(makeTerrain(1, 0.5), 0, 300, 1.5)
const CFG = { gravity: -10, maxSteps: 1200, stallSteps: 180, progressEps: 0.1,
              motorSpeed: 12, motorTorque: 40, spawnX: 2, spawnY: 3 }

describe('chassisVertices', () => {
  it('returns 8 vertices', () => {
    expect(chassisVertices(randomGenome(mulberry32(1)))).toHaveLength(N_VERTICES)
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
