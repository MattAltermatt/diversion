import { describe, it, expect } from 'vitest'
import { lyapunovSchema, SEQUENCES } from './schema'
import { palettePresets } from './presets'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('lyapunovSchema', () => {
  it('parses to documented defaults', () => {
    const d = lyapunovSchema.parse({})
    expect(d).toEqual({
      sequence: 'BBBBBBAAAAAA',
      speed: 0.15,
      zoom: 0.55,
      iterations: 220,
      depth: 0.8,
      seed: 1,
      colorCycle: 0.2,
      chaosColor: '#060312',
      cityEdge: '#ffd27a',
      cityDeep: '#5a120a',
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(lyapunovSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('every slider field carries min/max meta', () => {
    for (const key of ['speed', 'zoom', 'iterations', 'depth', 'colorCycle'] as const) {
      const m = (lyapunovSchema.shape[key] as { meta(): { ui?: string; min?: number; max?: number } }).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('sequence enum options mirror SEQUENCES', () => {
    const m = (lyapunovSchema.shape.sequence as { meta(): { ui?: string; options?: string[] } }).meta()
    expect(m.ui).toBe('segmented')
    expect(m.options).toEqual([...SEQUENCES])
  })

  it('iterations is an integer within its band', () => {
    expect(() => lyapunovSchema.parse({ iterations: 220.5 })).toThrow()
    expect(lyapunovSchema.parse({ iterations: 400 }).iterations).toBe(400)
  })

  it('seed is randomized on fresh load (seedless share links)', () => {
    expect((lyapunovSchema.shape.seed as { meta(): { randomizeOnFreshLoad?: boolean } }).meta().randomizeOnFreshLoad).toBe(true)
  })

  it('round-trips a tweaked config through the URL codec (full snapshot, seed pinned-out)', () => {
    const cfg = { ...lyapunovSchema.parse({}), zoom: 0.4, sequence: 'AABAB' as const, cityEdge: '#00ffcc' }
    const sp = encodeConfig(lyapunovSchema, cfg)
    expect(sp.get('zoom')).toBe('0.4')
    expect(sp.get('sequence')).toBe('AABAB')
    expect(sp.has('iterations')).toBe(true) // full snapshot — every non-pinned field emitted
    expect(sp.has('seed')).toBe(false) // randomizeOnFreshLoad → pin-only, never emitted
    // seed is not encoded, so it decodes back to its schema default (1) here.
    expect(decodeConfig(lyapunovSchema, sp)).toEqual(cfg)
  })
})

describe('lyapunov presets', () => {
  it('every palette preset patch parses against the schema', () => {
    for (const p of palettePresets) expect(() => lyapunovSchema.parse(p.patch)).not.toThrow()
  })
  it('every palette preset supplies three valid hex colors', () => {
    for (const p of palettePresets) {
      for (const key of ['chaosColor', 'cityEdge', 'cityDeep'] as const) {
        expect(p.patch[key]).toMatch(/^#[0-9a-fA-F]{6}$/)
      }
    }
  })
})
