import { describe, it, expect } from 'vitest'
import { causticsSchema, FLOOR_INDEX } from './schema'
import { readMeta } from '../../framework/fieldMeta'

describe('caustics schema', () => {
  it('parses empty to the owner-set calm defaults', () => {
    const c = causticsSchema.parse({})
    expect(c.tempo).toBe(0.001)
    expect(c.ripple).toBe(0.0035)
    expect(c.gust).toBe(0.22)
    expect(c.slosh).toBe(0.7)
    expect(c.depth).toBe(1)
    expect(c.scale).toBe(9.6)
    expect(c.tilt).toBe(1.78)
    expect(c.spread).toBe(0.28)
    expect(c.floor).toBe('Tile')
    expect(c.tileSize).toBe(0.3)
    expect(c.background).toBe('#2f626b')
    expect(c.light).toBe('#fffef6')
    // Pinned, not "randomised": the FIELD randomises on a fresh load, but
    // `parse({})` is what every threshold in spectrum.test.ts is quoted against,
    // and an unwritten default makes those numbers unreproducible.
    expect(c.seed).toBe(1)
  })

  it('puts the seed in Advanced, collapsed and fresh-load randomized', () => {
    const m = readMeta(causticsSchema.shape.seed)!
    expect(m.section).toBe('Advanced')
    expect(m.collapsed).toBe(true)
    expect(m.randomizeOnFreshLoad).toBe(true)
    expect(m.label).toBe('Seed')
    expect(m.ui).toBe('number')
  })

  // Canon makes persistent help a MUST (UX invariant #3) and NOTHING in the
  // framework sweeps enforces it -- diversionMeta.test.ts contains zero `help`
  // assertions -- so the omission would be silent. `tilt` is the sharpest case:
  // it is labelled "Swell", a label that does not explain itself.
  it('every field carries persistent help', () => {
    for (const [key, field] of Object.entries(causticsSchema.shape)) {
      const m = readMeta(field)!
      expect(m.help, `${key} has no help`).toBeTruthy()
      expect(m.help!.length, `${key}'s help is a stub`).toBeGreaterThan(40)
    }
  })

  it('every slider declares the bounds its control needs', () => {
    for (const [key, field] of Object.entries(causticsSchema.shape)) {
      const m = readMeta(field)!
      if (m.ui !== 'slider') continue
      expect(typeof m.min, `${key} min`).toBe('number')
      expect(typeof m.max, `${key} max`).toBe('number')
      expect(m.max!, key).toBeGreaterThan(m.min!)
    }
  })

  it('gates tileSize on the Tile floor', () => {
    const m = readMeta(causticsSchema.shape.tileSize)!
    expect(m.showWhen).toEqual({ field: 'floor', equals: 'Tile' })
  })

  // The enum's member ORDER is the uFloor uniform's value. A reorder renders the
  // wrong floor and nothing else in the suite inspects a uniform.
  it('pins the floor enum order to the shader branches', () => {
    expect(FLOOR_INDEX).toEqual(['Tile', 'Plain', 'Sand'])
    expect(readMeta(causticsSchema.shape.floor)!.options).toEqual([...FLOOR_INDEX])
    expect(causticsSchema.parse({ floor: 'Sand' }).floor).toBe('Sand')
    expect(() => causticsSchema.parse({ floor: 'sand' })).toThrow()
  })

  it('tempo is capped where the owner capped it', () => {
    expect(readMeta(causticsSchema.shape.tempo)!.max).toBe(0.006)
    expect(() => causticsSchema.parse({ tempo: 0.02 })).toThrow()
  })
})
