import { describe, it, expect } from 'vitest'
import { boxcar2dSchema } from './schema'
import { TERRAIN_TYPES } from './terrain'

describe('boxcar2dSchema', () => {
  it('parses its own defaults', () => {
    const cfg = boxcar2dSchema.parse({})
    expect(cfg.population).toBeGreaterThan(0)
    expect(cfg.color.sky).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(typeof cfg.seed).toBe('number')
  })
})

describe('boxcar2d schema additions', () => {
  const d = boxcar2dSchema.parse({})
  it('defaults: time mode, dunes terrain, light rubble, infinite track', () => {
    expect(d.mode).toBe('time')
    expect(d.terrainType).toBe('dunes')
    expect(d.rubbleDensity).toBe(1)
    expect(d.trackLifespan).toBe(51) // max == infinite sentinel
    expect(d.timeCap).toBe(180) // 3 min
  })
  it('terrainType enum mirrors TERRAIN_TYPES', () => {
    const meta = boxcar2dSchema.shape.terrainType.meta()
    expect(meta?.options).toEqual([...TERRAIN_TYPES])
  })
  it('time-only fields are gated behind mode==="time"', () => {
    expect(boxcar2dSchema.shape.goalDistance.meta()?.showWhen).toEqual({ field: 'mode', equals: 'time' })
    expect(boxcar2dSchema.shape.timeCap.meta()?.showWhen).toEqual({ field: 'mode', equals: 'time' })
  })
  it('trackLifespan carries the ∞ maxLabel', () => {
    expect(boxcar2dSchema.shape.trackLifespan.meta()?.maxLabel).toBe('∞')
  })
})
