import { describe, it, expect } from 'vitest'
import { gameOfLifeSchema, RULES } from './schema'
import { stylePresets, colorPresets } from './presets'

describe('gameOfLifeSchema', () => {
  it('parses to defaults (Conway Life, cell 5, ember palette)', () => {
    const c = gameOfLifeSchema.parse({})
    expect(c.rule).toBe('Life')
    expect(c.cellSize).toBe(5)
    expect(c.speed).toBe(11)
    expect(c.trail).toBe(10)
    expect(c.density).toBeCloseTo(0.32)
    expect(c.stops.length).toBeGreaterThanOrEqual(2)
  })
  it('every slider field carries min/max meta', () => {
    const shape = gameOfLifeSchema.shape
    for (const key of ['density', 'speed', 'cellSize', 'trail'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })
  it('rule is a segmented enum over the named rules', () => {
    const m = (gameOfLifeSchema.shape.rule as any).meta()
    expect(m.ui).toBe('segmented')
    expect(() => gameOfLifeSchema.parse({ rule: 'Life' })).not.toThrow()
    expect(() => gameOfLifeSchema.parse({ rule: 'Nonsense' })).toThrow()
    expect(RULES.length).toBeGreaterThan(1)
  })
  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((gameOfLifeSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })
})

describe('game-of-life presets', () => {
  it('every style preset patch parses against the schema', () => {
    for (const p of stylePresets) expect(() => gameOfLifeSchema.parse(p.patch)).not.toThrow()
  })
  it('every color preset supplies 2..6 valid hex stops', () => {
    for (const p of colorPresets) {
      expect(p.patch.stops.length).toBeGreaterThanOrEqual(2)
      expect(p.patch.stops.length).toBeLessThanOrEqual(6)
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})
