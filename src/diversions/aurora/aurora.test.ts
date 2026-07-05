import { describe, it, expect } from 'vitest'
import { auroraSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { buildPalette, seedOffset, FRAG_SRC, MAX_STOPS } from './gl'
import { activityPresets, palettePresets } from './presets'

describe('aurora schema + codec', () => {
  it('parses to valid defaults', () => {
    const cfg = auroraSchema.parse({})
    expect(cfg.brightness).toBeGreaterThan(0)
    expect(cfg.paletteStops.length).toBeGreaterThanOrEqual(2)
    expect(cfg.seed).toBe(1)
  })

  it('round-trips config through the URL codec, seed omitted (pin-only)', () => {
    const cfg = auroraSchema.parse({})
    const sp = encodeConfig(auroraSchema, cfg)
    expect(sp.has('seed')).toBe(false) // randomizeOnFreshLoad — never emitted
    const back = decodeConfig(auroraSchema, sp)
    expect(back).toEqual(cfg) // seed absent → decodes back to its default (== cfg.seed)
  })

  it('round-trips non-default values including the palette array', () => {
    const cfg = auroraSchema.parse({
      brightness: 2.1, speed: 0.9, curtainScale: 4.5, raySharpness: 0.85,
      starDensity: 0.8, skyZenith: '#010204', skyHorizon: '#04102a',
      paletteStops: ['#010203', '#0a0b0c', '#fdfeff'],
    })
    const back = decodeConfig(auroraSchema, encodeConfig(auroraSchema, cfg))
    expect(back).toEqual(cfg)
  })

  it('honors an explicit seed present in the URL', () => {
    const sp = encodeConfig(auroraSchema, auroraSchema.parse({}))
    sp.set('seed', '424242')
    expect(decodeConfig(auroraSchema, sp).seed).toBe(424242)
  })
})

describe('seedOffset determinism', () => {
  it('is identical for the same seed', () => {
    expect(seedOffset(7)).toEqual(seedOffset(7))
  })

  it('differs across seeds', () => {
    expect(seedOffset(1)).not.toEqual(seedOffset(2))
  })

  it('returns two finite, in-range offsets', () => {
    const [a, b] = seedOffset(12345)
    for (const v of [a, b]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1000)
    }
  })
})

describe('buildPalette', () => {
  it('maps hex stops to 0..1 floats and reports the active count', () => {
    const p = buildPalette(auroraSchema.parse({ paletteStops: ['#000000', '#ffffff'] }))
    expect(p.count).toBe(2)
    expect(p.stops[0]).toBe(0)
    expect(p.stops[3]).toBe(1)
    expect(p.stops.length).toBe(MAX_STOPS * 3)
  })

  it('caps the active count at MAX_STOPS', () => {
    const many = Array.from({ length: MAX_STOPS }, () => '#123456')
    const p = buildPalette(auroraSchema.parse({ paletteStops: many }))
    expect(p.count).toBe(MAX_STOPS)
  })
})

describe('presets', () => {
  it('every activity option patches the same key-set', () => {
    const keySets = activityPresets.map((o) => Object.keys(o.patch).sort().join(','))
    for (const ks of keySets) expect(ks).toBe(keySets[0])
  })

  it('every palette option patches the same key-set', () => {
    const keySets = palettePresets.map((o) => Object.keys(o.patch).sort().join(','))
    for (const ks of keySets) expect(ks).toBe(keySets[0])
  })

  it('every preset patch parses cleanly when merged over defaults', () => {
    const defaults = auroraSchema.parse({})
    for (const opt of [...activityPresets, ...palettePresets]) {
      expect(() => auroraSchema.parse({ ...defaults, ...opt.patch })).not.toThrow()
    }
  })
})

describe('FRAG_SRC', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of ['u_res', 'u_time', 'u_seed', 'u_brightness', 'u_curtainScale',
      'u_raySharpness', 'u_starDensity', 'u_skyZenith', 'u_skyHorizon', 'u_stops', 'u_stopCount']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
})
