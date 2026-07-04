import { describe, it, expect } from 'vitest'
import { viscousFingeringSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('viscousFingeringSchema', () => {
  it('parses to documented defaults', () => {
    const d = viscousFingeringSchema.parse({})
    expect(d).toEqual({
      viscosityRatio: 0.55,
      surfaceTension: 0.5,
      injectionRate: 0.85,
      noise: 0.25,
      simSpeed: 8,
      seed: 1,
      colorMode: 'concentration',
      palette: ['#050a14', '#0a4f7a', '#5fd0ff'],
      background: '#050a14',
    })
  })

  it('every field carries a ui meta; every slider carries min/max', () => {
    for (const [key, field] of Object.entries(viscousFingeringSchema.shape)) {
      const m = (field as { meta(): { ui?: string; min?: number; max?: number } }).meta()
      expect(m.ui, key).toBeTruthy()
      if (m.ui === 'slider') {
        expect(typeof m.min, key).toBe('number')
        expect(typeof m.max, key).toBe('number')
      }
    }
  })

  it('seed is flagged pin-only (randomizeOnFreshLoad)', () => {
    const m = (viscousFingeringSchema.shape.seed as { meta(): { randomizeOnFreshLoad?: boolean } }).meta()
    expect(m.randomizeOnFreshLoad).toBe(true)
  })

  it('rejects an out-of-range knob and a bad hex', () => {
    expect(() => viscousFingeringSchema.parse({ viscosityRatio: 2 })).toThrow()
    expect(() => viscousFingeringSchema.parse({ background: 'nope' })).toThrow()
  })

  it('round-trips a tweaked config through the URL codec (full snapshot, seed omitted)', () => {
    const cfg = { ...viscousFingeringSchema.parse({}), viscosityRatio: 0.8, colorMode: 'arrival' as const, background: '#111827' }
    const sp = encodeConfig(viscousFingeringSchema, cfg)
    expect(sp.get('viscosityRatio')).toBe('0.8')
    expect(sp.get('colorMode')).toBe('arrival')
    expect(sp.has('simSpeed')).toBe(true) // full snapshot — every non-pin field emitted
    expect(sp.has('seed')).toBe(false)    // pin-only field is NOT emitted (seedless links)
    // decode restores the seed to its default (codec never carried it), everything else round-trips.
    expect(decodeConfig(viscousFingeringSchema, sp)).toEqual(cfg)
  })
})
