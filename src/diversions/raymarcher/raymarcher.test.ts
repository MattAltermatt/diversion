import { describe, it, expect } from 'vitest'
import { raymarcherSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import {
  derivePrimitives, lightColorFromHue, orbitCamera, buildPalette, buildSky,
  FRAG_SRC, MAX_PRIMS, MAX_STOPS,
} from './raymarcher'
import { formPresets, palettePresets } from './presets'

describe('raymarcher schema + codec', () => {
  it('parses to valid defaults', () => {
    const cfg = raymarcherSchema.parse({})
    expect(cfg.primitives).toBeGreaterThanOrEqual(2)
    expect(cfg.palette.length).toBeGreaterThanOrEqual(2)
    expect(cfg.seed).toBe(1)
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(raymarcherSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips config through the URL codec, seed omitted (pin-only)', () => {
    const cfg = raymarcherSchema.parse({})
    const sp = encodeConfig(raymarcherSchema, cfg)
    expect(sp.has('seed')).toBe(false) // randomizeOnFreshLoad — never emitted
    const back = decodeConfig(raymarcherSchema, sp)
    expect(back).toEqual(cfg) // seed absent → decodes back to its default (== cfg.seed)
  })

  it('round-trips non-default values including the palette array', () => {
    const cfg = raymarcherSchema.parse({
      primitives: 5, blend: 1.1, morphSpeed: 0.6, cameraSpeed: 0.5, lightHue: 210,
      skyHorizon: '#010204', skyZenith: '#04102a',
      palette: ['#010203', '#0a0b0c', '#fdfeff'],
    })
    const back = decodeConfig(raymarcherSchema, encodeConfig(raymarcherSchema, cfg))
    expect(back).toEqual(cfg)
  })

  it('honors an explicit seed present in the URL', () => {
    const sp = encodeConfig(raymarcherSchema, raymarcherSchema.parse({}))
    sp.set('seed', '424242')
    expect(decodeConfig(raymarcherSchema, sp).seed).toBe(424242)
  })
})

describe('derivePrimitives determinism', () => {
  it('is identical for the same seed', () => {
    const a = derivePrimitives(7)
    const b = derivePrimitives(7)
    expect(Array.from(a.orbitR)).toEqual(Array.from(b.orbitR))
    expect(Array.from(a.phase)).toEqual(Array.from(b.phase))
    expect(Array.from(a.speedMul)).toEqual(Array.from(b.speedMul))
    expect(Array.from(a.tiltX)).toEqual(Array.from(b.tiltX))
    expect(Array.from(a.tiltZ)).toEqual(Array.from(b.tiltZ))
    expect(Array.from(a.size)).toEqual(Array.from(b.size))
    expect(Array.from(a.type)).toEqual(Array.from(b.type))
  })

  it('differs across seeds', () => {
    const a = derivePrimitives(1)
    const b = derivePrimitives(2)
    expect(Array.from(a.orbitR)).not.toEqual(Array.from(b.orbitR))
  })

  it('always derives MAX_PRIMS entries, independent of any configured primitive count', () => {
    const p = derivePrimitives(42)
    for (const arr of [p.orbitR, p.phase, p.speedMul, p.tiltX, p.tiltZ, p.size, p.type]) {
      expect(arr.length).toBe(MAX_PRIMS)
    }
  })

  it('produces finite, in-range values and a valid primitive type index', () => {
    const p = derivePrimitives(999)
    for (let i = 0; i < MAX_PRIMS; i++) {
      expect(Number.isFinite(p.orbitR[i])).toBe(true)
      expect(Number.isFinite(p.phase[i])).toBe(true)
      expect(Number.isFinite(p.speedMul[i])).toBe(true)
      expect(p.size[i]).toBeGreaterThan(0)
      expect([0, 1, 2]).toContain(p.type[i])
    }
  })
})

describe('lightColorFromHue', () => {
  it('is identical for the same hue', () => {
    expect(lightColorFromHue(200)).toEqual(lightColorFromHue(200))
  })

  it('differs across hues', () => {
    expect(lightColorFromHue(0)).not.toEqual(lightColorFromHue(200))
  })

  it('returns three 0..1 floats', () => {
    for (const hue of [0, 90, 180, 270, 359]) {
      const [r, g, b] = lightColorFromHue(hue)
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('orbitCamera', () => {
  it('is a pure function of phase — identical output for the same phase', () => {
    expect(orbitCamera(3.14)).toEqual(orbitCamera(3.14))
  })

  it('moves as phase advances', () => {
    expect(orbitCamera(0)).not.toEqual(orbitCamera(1))
  })

  it('returns finite position and target vectors', () => {
    const cam = orbitCamera(12.5)
    for (const v of [...cam.pos, ...cam.target]) expect(Number.isFinite(v)).toBe(true)
  })
})

describe('buildPalette', () => {
  it('maps hex stops to 0..1 floats and reports the active count', () => {
    const p = buildPalette(raymarcherSchema.parse({ palette: ['#000000', '#ffffff'] }))
    expect(p.count).toBe(2)
    expect(p.stops[0]).toBe(0)
    expect(p.stops[3]).toBe(1)
    expect(p.stops.length).toBe(MAX_STOPS * 3)
  })

  it('caps the active count at MAX_STOPS', () => {
    const many = Array.from({ length: MAX_STOPS }, () => '#123456')
    const p = buildPalette(raymarcherSchema.parse({ palette: many }))
    expect(p.count).toBe(MAX_STOPS)
  })
})

describe('buildSky', () => {
  it('maps sky hex fields to 0..1 float triples', () => {
    const sky = buildSky(raymarcherSchema.parse({ skyHorizon: '#000000', skyZenith: '#ffffff' }))
    expect(sky.horizon).toEqual([0, 0, 0])
    expect(sky.zenith).toEqual([1, 1, 1])
  })
})

describe('presets', () => {
  it('every form option patches the same key-set', () => {
    const keySets = formPresets.map((o) => Object.keys(o.patch).sort().join(','))
    for (const ks of keySets) expect(ks).toBe(keySets[0])
  })

  it('every palette option patches the same key-set', () => {
    const keySets = palettePresets.map((o) => Object.keys(o.patch).sort().join(','))
    for (const ks of keySets) expect(ks).toBe(keySets[0])
  })

  it('every preset patch parses cleanly when merged over defaults', () => {
    const defaults = raymarcherSchema.parse({})
    for (const opt of [...formPresets, ...palettePresets]) {
      expect(() => raymarcherSchema.parse({ ...defaults, ...opt.patch })).not.toThrow()
    }
  })
})

describe('FRAG_SRC shader-source sanity', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of [
      'u_res', 'u_time', 'u_camPos', 'u_camTarget', 'u_blend', 'u_primCount',
      'u_primOrbitR', 'u_primPhase', 'u_primSpeed', 'u_primTiltX', 'u_primTiltZ',
      'u_primSize', 'u_primType', 'u_lightColor', 'u_stops', 'u_stopCount',
      'u_skyHorizon', 'u_skyZenith',
    ]) {
      expect(FRAG_SRC).toContain(u)
    }
  })

  it('implements the SDF scene and the raymarch loop', () => {
    expect(FRAG_SRC).toContain('float map(vec3 p)')
    expect(FRAG_SRC).toContain('float raymarch(vec3 ro, vec3 rd, out float steps)')
    expect(FRAG_SRC).toContain('float smin(')
    expect(FRAG_SRC).toContain('sdSphere')
    expect(FRAG_SRC).toContain('sdRoundBox')
    expect(FRAG_SRC).toContain('sdTorus')
    expect(FRAG_SRC).toContain('vec3 calcNormal(')
  })

  it('bounds step count and far plane', () => {
    expect(FRAG_SRC).toMatch(/#define STEPS \d+/)
    expect(FRAG_SRC).toMatch(/#define MAX_DIST [\d.]+/)
  })
})
