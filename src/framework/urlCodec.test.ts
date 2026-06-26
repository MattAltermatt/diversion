import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { encodeConfig, decodeConfig } from './urlCodec'

const schema = z.object({
  particles: z.number().int().min(100).max(20000).default(4000),
  speed: z.number().min(0).max(5).default(1.2),
  blend: z.enum(['lighter', 'screen', 'normal']).default('lighter'),
  fadeTrails: z.boolean().default(true),
  palette: z
    .object({
      background: z.string().default('#0a0a12'),
      hueStart: z.number().min(0).max(360).default(200),
    })
    .default({ background: '#0a0a12', hueStart: 200 }),
})

const defaults = schema.parse({})

describe('encodeConfig', () => {
  it('omits values equal to defaults (empty for all-default config)', () => {
    expect(encodeConfig(schema, defaults).toString()).toBe('')
  })

  it('emits only changed values, flattening nested keys', () => {
    const cfg = { ...defaults, particles: 8000, palette: { background: '#0a0a12', hueStart: 300 } }
    const sp = encodeConfig(schema, cfg)
    expect(sp.get('particles')).toBe('8000')
    expect(sp.get('palette.hueStart')).toBe('300')
    expect(sp.has('speed')).toBe(false) // unchanged → omitted
    expect(sp.has('palette.background')).toBe(false)
  })
})

describe('decodeConfig', () => {
  it('round-trips: decode(encode(cfg)) === cfg', () => {
    const cfg = {
      ...defaults,
      particles: 8000,
      speed: 3.5,
      blend: 'screen' as const,
      fadeTrails: false,
      palette: { background: '#112233', hueStart: 90 },
    }
    expect(decodeConfig(schema, encodeConfig(schema, cfg))).toEqual(cfg)
  })

  it('fills omitted params from defaults', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=5000'))).toEqual({
      ...defaults,
      particles: 5000,
    })
  })

  it('coerces numbers and booleans from strings', () => {
    const out = decodeConfig(schema, new URLSearchParams('particles=5000&fadeTrails=false'))
    expect(out.particles).toBe(5000)
    expect(out.fadeTrails).toBe(false)
  })

  it('falls back to full defaults on out-of-range values (never throws)', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=999999'))).toEqual(defaults)
  })

  it('falls back to full defaults on garbage', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=abc&blend=purple'))).toEqual(
      defaults,
    )
  })
})

describe('non-numeric arrays, vectors, and strings (#3)', () => {
  const arrSchema = z.object({
    ramp: z.array(z.string()).default(['#0a0a12', '#ffffff']), // color ramp (strings)
    weights: z.array(z.number()).default([1, 2, 3]), // numeric vector
    label: z.string().default('aurora'),
  })
  const arrDefaults = arrSchema.parse({})

  it('round-trips an array of strings (color ramp)', () => {
    const cfg = { ...arrDefaults, ramp: ['#ff0000', '#00ff00', '#0000ff'] }
    expect(decodeConfig(arrSchema, encodeConfig(arrSchema, cfg))).toEqual(cfg)
  })

  it('keeps string-array elements as strings (not coerced to NaN)', () => {
    const cfg = { ...arrDefaults, ramp: ['#abcdef', '#123456'] }
    const out = decodeConfig(arrSchema, encodeConfig(arrSchema, cfg))
    expect(out.ramp).toEqual(['#abcdef', '#123456'])
  })

  it('round-trips a numeric vector', () => {
    const cfg = { ...arrDefaults, weights: [0.25, -3, 42] }
    expect(decodeConfig(arrSchema, encodeConfig(arrSchema, cfg))).toEqual(cfg)
  })

  it('is collision-safe for elements containing separators (_ , %)', () => {
    const cfg = { ...arrDefaults, ramp: ['a_b', 'c,d', 'e%f'] }
    expect(decodeConfig(arrSchema, encodeConfig(arrSchema, cfg))).toEqual(cfg)
  })

  it('omits arrays still at their default', () => {
    const sp = encodeConfig(arrSchema, { ...arrDefaults, label: 'ember' })
    expect(sp.has('ramp')).toBe(false)
    expect(sp.has('weights')).toBe(false)
    expect(sp.get('label')).toBe('ember')
  })
})
