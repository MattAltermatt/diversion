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

describe('encodeConfig (full snapshot, flat keys)', () => {
  it('emits every field (full snapshot, not just changes)', () => {
    const sp = encodeConfig(schema, defaults)
    expect(sp.get('particles')).toBe('4000')
    expect(sp.get('speed')).toBe('1.2')
    expect(sp.get('blend')).toBe('lighter')
    expect(sp.get('fadeTrails')).toBe('true')
    // nested group leaves flatten to their unique leaf name
    expect(sp.get('background')).toBe('#0a0a12')
    expect(sp.get('hueStart')).toBe('200')
    expect(sp.has('palette.hueStart')).toBe(false) // dotted form not used when leaf is unique
  })

  it('reflects changed values under flat keys', () => {
    const cfg = { ...defaults, particles: 8000, palette: { background: '#0a0a12', hueStart: 300 } }
    const sp = encodeConfig(schema, cfg)
    expect(sp.get('particles')).toBe('8000')
    expect(sp.get('hueStart')).toBe('300')
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

  it('still decodes legacy dotted-key URLs', () => {
    const out = decodeConfig(schema, new URLSearchParams('particles=5000&palette.hueStart=120'))
    expect(out.particles).toBe(5000)
    expect(out.palette.hueStart).toBe(120)
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

  it('defaults an out-of-range field (rest already default → equals defaults)', () => {
    expect(decodeConfig(schema, new URLSearchParams('particles=999999'))).toEqual(defaults)
  })

  it('defaults garbage fields individually (rest already default → equals defaults)', () => {
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

  it('emits arrays even at their default (full snapshot)', () => {
    const sp = encodeConfig(arrSchema, { ...arrDefaults, label: 'ember' })
    expect(sp.has('ramp')).toBe(true)
    expect(sp.has('weights')).toBe(true)
    expect(sp.get('label')).toBe('ember')
  })
})

describe('urlCodec — palette colors (8-digit hex array)', () => {
  const schema = z.object({
    palette: z.object({
      colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(8)
        .default(['#1e63ff1f', '#16d6ff1a']),
    }).default({ colors: ['#1e63ff1f', '#16d6ff1a'] }),
  })

  it('round-trips a custom color set unchanged', () => {
    const cfg = schema.parse({ palette: { colors: ['#ff000080', '#00ff00ff', '#0000ff10'] } })
    const decoded = decodeConfig(schema, encodeConfig(schema, cfg))
    expect(decoded.palette.colors).toEqual(['#ff000080', '#00ff00ff', '#0000ff10'])
  })

  it('falls back to defaults when an element is malformed (safeParse, never throws)', () => {
    const params = new URLSearchParams()
    params.set('palette.colors', 'not-a-hex,#00ff00ff')
    const decoded = decodeConfig(schema, params)
    expect(decoded.palette.colors).toEqual(['#1e63ff1f', '#16d6ff1a']) // back to defaults
  })
})

describe('decodeConfig — per-field graceful degradation', () => {
  it('keeps valid fields when another field is invalid', () => {
    // particles is out of range (max 20000); speed is valid
    const out = decodeConfig(schema, new URLSearchParams('speed=3.5&particles=999999'))
    expect(out.speed).toBe(3.5) // valid field survives
    expect(out.particles).toBe(defaults.particles) // bad field → its own default
  })

  it('defaults only the bad array field, keeping siblings', () => {
    const pSchema = z.object({
      label: z.string().default('x'),
      palette: z
        .object({
          colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).default(['#11223344']),
        })
        .default({ colors: ['#11223344'] }),
    })
    const out = decodeConfig(pSchema, new URLSearchParams('label=ember&colors=bad,#00ff00ff'))
    expect(out.label).toBe('ember') // good field kept
    expect(out.palette.colors).toEqual(['#11223344']) // bad array → default
  })
})
