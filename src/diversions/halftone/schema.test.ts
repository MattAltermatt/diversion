import { describe, it, expect } from 'vitest'
import { halftoneSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('halftone schema', () => {
  it('parses to documented defaults', () => {
    const d = halftoneSchema.parse({})
    expect(d).toEqual({
      massCount: 5,
      massStrength: 0.22,
      spread: 0.22,
      speed: 0.5,
      gridDensity: 40,
      maxDotSize: 1.05,
      colorMode: 'ink',
      inkColor: '#14171c',
      tintLow: '#1b2a6b',
      tintHigh: '#ff3b6b',
      background: '#f4f1ea',
      seed: 7,
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(halftoneSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec (full snapshot, seed omitted)', () => {
    const cfg = { ...halftoneSchema.parse({}), gridDensity: 64, colorMode: 'tinted' as const, tintHigh: '#00ffcc' }
    const sp = encodeConfig(halftoneSchema, cfg)
    expect(sp.get('gridDensity')).toBe('64')
    expect(sp.get('colorMode')).toBe('tinted')
    expect(sp.has('spread')).toBe(true) // full snapshot — every field emitted…
    expect(sp.has('seed')).toBe(false) // …except the pin-only randomize-on-fresh-load seed
    // decode fills seed from the config default (URL omits it), rest round-trips
    expect(decodeConfig(halftoneSchema, sp)).toEqual(cfg)
  })
})
