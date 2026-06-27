import { describe, it, expect } from 'vitest'
import { gravityWellsSchema } from './schema'

describe('gravityWellsSchema', () => {
  it('parses to the curated defaults', () => {
    const c = gravityWellsSchema.parse({})
    expect(c.maxWells).toBe(5)
    expect(c.wellLifespan).toBe(18)
    expect(c.forceMin).toBe(-0.4)
    expect(c.forceMax).toBe(1.5)
    expect(c.gravityInfluence).toBe(1)
    expect(c.speed).toBe(1)
    expect(c.color.mode).toBe('gradient')
    expect(c.color.source).toBe('flow-angle')
    expect(c.blend).toBe('lighten')
  })
  it('offers flow-angle and field gradient sources (flow field, not a physics sim)', () => {
    expect(gravityWellsSchema.parse({ color: { mode: 'gradient', source: 'field',
      colors: ['#ffffffff'], stops: ['#000000ff', '#ffffffff'] } }).color.source).toBe('field')
    expect(() => gravityWellsSchema.parse({ color: { mode: 'gradient', source: 'speed',
      colors: ['#ffffffff'], stops: ['#000000ff', '#ffffffff'] } })).toThrow()
  })
  it('enforces the unattended-death guard: maxWells >= 1', () => {
    expect(() => gravityWellsSchema.parse({ maxWells: 0 })).toThrow()
  })
})
