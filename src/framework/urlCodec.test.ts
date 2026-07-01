import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { encodeConfig, decodeConfig, nonScalarArrayLeaves, leafNameCollisions, applyFreshLoadRandomization, hasFreshLoadRandomization } from './urlCodec'

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

describe('#123 — codec hardening guards', () => {
  it('empty-string scalar param reverts to default (not 0 / false / "")', () => {
    // ?speed= must NOT silently become 0; ?fadeTrails= must NOT become false.
    const out = decodeConfig(schema, new URLSearchParams('speed=&fadeTrails=&blend='))
    expect(out.speed).toBe(defaults.speed)
    expect(out.fadeTrails).toBe(defaults.fadeTrails)
    expect(out.blend).toBe(defaults.blend)
  })

  it('empty array element reverts the whole array field to default (not [1,0,3])', () => {
    const arrSchema = z.object({ weights: z.array(z.number()).default([1, 2, 3]) })
    const out = decodeConfig(arrSchema, new URLSearchParams('weights=1,,3'))
    expect(out.weights).toEqual([1, 2, 3]) // NaN element rejected → default, not [1,0,3]
  })

  it('still accepts a genuinely empty array param (full-snapshot round-trip)', () => {
    const arrSchema = z.object({ tags: z.array(z.string()).default([]) })
    const out = decodeConfig(arrSchema, new URLSearchParams('tags='))
    expect(out.tags).toEqual([])
  })

  it('decodes booleans case-insensitively (true/True/1)', () => {
    expect(decodeConfig(schema, new URLSearchParams('fadeTrails=True')).fadeTrails).toBe(true)
    expect(decodeConfig(schema, new URLSearchParams('fadeTrails=1')).fadeTrails).toBe(true)
    expect(decodeConfig(schema, new URLSearchParams('fadeTrails=TRUE')).fadeTrails).toBe(true)
    expect(decodeConfig(schema, new URLSearchParams('fadeTrails=false')).fadeTrails).toBe(false)
    expect(decodeConfig(schema, new URLSearchParams('fadeTrails=0')).fadeTrails).toBe(false)
  })

  it('rejects prototype-pollution keys in dotted paths (no global pollution)', () => {
    const params = new URLSearchParams()
    params.set('__proto__.polluted', 'true')
    params.set('constructor.prototype.polluted', 'true')
    decodeConfig(schema, params)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('per-field degradation survives a failing cross-field refine (no whole-config wipe)', () => {
    // min must be <= max; the URL violates it. The bad pair should NOT nuke `speed`.
    const refined = z
      .object({
        speed: z.number().default(2),
        min: z.number().default(0),
        max: z.number().default(10),
      })
      .refine((c) => c.min <= c.max, { message: 'min must be <= max' })
    const out = decodeConfig(refined, new URLSearchParams('speed=4&min=9&max=1'))
    expect(out.speed).toBe(4) // unrelated field preserved despite refine failure
    expect(out.min).toBe(9) // each field individually valid → kept
    expect(out.max).toBe(1)
  })

  it('throws at encode time on an array-of-objects leaf (loud, not silent)', () => {
    const badSchema = z.object({
      stops: z.array(z.object({ at: z.number(), color: z.string() })).default([]),
    })
    expect(() => encodeConfig(badSchema, badSchema.parse({}))).toThrow(/non-scalar elements/)
    expect(() => decodeConfig(badSchema, new URLSearchParams('stops=x'))).toThrow(
      /non-scalar elements/,
    )
  })

  it('throws on a nested-array leaf too', () => {
    const badSchema = z.object({ grid: z.array(z.array(z.number())).default([]) })
    expect(() => encodeConfig(badSchema, badSchema.parse({}))).toThrow(/non-scalar elements/)
  })

  it('nonScalarArrayLeaves: clean for scalar arrays, flags object arrays', () => {
    const ok = z.object({ ramp: z.array(z.string()).default([]) })
    const bad = z.object({ stops: z.array(z.object({ at: z.number() })).default([]) })
    expect(nonScalarArrayLeaves(ok)).toEqual([])
    expect(nonScalarArrayLeaves(bad)).toHaveLength(1)
    expect(nonScalarArrayLeaves(bad)[0]).toMatch(/non-scalar elements/)
  })
})

describe('#127 — codec regression battery (non-finite, collisions, array garbage)', () => {
  it('non-finite number strings (Infinity / 1e999 / NaN) revert to default', () => {
    // An UNBOUNDED number, so this locks the Zod-4 non-finite reject itself —
    // not a min/max bound incidentally catching Infinity.
    const nSchema = z.object({ n: z.number().default(7) })
    expect(decodeConfig(nSchema, new URLSearchParams('n=Infinity')).n).toBe(7)
    expect(decodeConfig(nSchema, new URLSearchParams('n=-Infinity')).n).toBe(7)
    expect(decodeConfig(nSchema, new URLSearchParams('n=1e999')).n).toBe(7) // overflows → Infinity
    expect(decodeConfig(nSchema, new URLSearchParams('n=NaN')).n).toBe(7)
  })

  it('a non-numeric array element (weights=abc,2) reverts the WHOLE array to default', () => {
    const arrSchema = z.object({ weights: z.array(z.number()).default([1, 2, 3]) })
    const out = decodeConfig(arrSchema, new URLSearchParams('weights=abc,2'))
    expect(out.weights).toEqual([1, 2, 3]) // 'abc' → NaN → array safeParse fails → default
  })

  describe('leaf-name collision → dotted-key fallback (buildUrlKeyMap else branch)', () => {
    // Two distinct object leaves both named `value` collide on the flat leaf name,
    // so the codec must fall back to the full dotted path for BOTH — exercising
    // the branch the unique-name schemas never reach.
    const collide = z.object({
      a: z.object({ value: z.number().default(1) }).default({ value: 1 }),
      b: z.object({ value: z.number().default(2) }).default({ value: 2 }),
    })
    const collideDefaults = collide.parse({})

    it('leafNameCollisions flags the shared leaf name', () => {
      expect(leafNameCollisions(collide)).toEqual(['value'])
    })

    it('encodes both collided leaves under dotted keys (not the bare name)', () => {
      const sp = encodeConfig(collide, collideDefaults)
      expect(sp.get('a.value')).toBe('1')
      expect(sp.get('b.value')).toBe('2')
      expect(sp.has('value')).toBe(false) // never the ambiguous flat name
    })

    it('round-trips a custom value through the dotted-key fallback', () => {
      const cfg = { a: { value: 11 }, b: { value: 22 } }
      expect(decodeConfig(collide, encodeConfig(collide, cfg))).toEqual(cfg)
    })

    it('decodes the dotted keys back to the right leaves', () => {
      const out = decodeConfig(collide, new URLSearchParams('a.value=5&b.value=9'))
      expect(out.a.value).toBe(5)
      expect(out.b.value).toBe(9)
    })
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

describe('applyFreshLoadRandomization', () => {
  const freshSchema = z.object({
    seed: z.number().int().default(42).meta({ ui: 'number', label: 'Seed', randomizeOnFreshLoad: true }),
    count: z.number().int().default(7).meta({ ui: 'number', label: 'Count' }),
  })

  it('rolls flagged fields to a random integer, leaves unflagged ones', () => {
    const base = freshSchema.parse({})
    const rolled = applyFreshLoadRandomization(freshSchema, base, () => 0.5)
    expect(rolled.seed).toBe(Math.floor(0.5 * 1e9)) // flagged → rolled from rand
    expect(rolled.count).toBe(base.count) // unflagged → untouched
    // a different rand stream yields a different seed (so refresh → new run)
    expect(applyFreshLoadRandomization(freshSchema, base, () => 0.9).seed).not.toBe(rolled.seed)
  })

  it('hasFreshLoadRandomization detects the opt-in', () => {
    expect(hasFreshLoadRandomization(freshSchema)).toBe(true)
    const plain = z.object({ a: z.number().default(1).meta({ ui: 'number', label: 'A' }) })
    expect(hasFreshLoadRandomization(plain)).toBe(false)
  })
})
