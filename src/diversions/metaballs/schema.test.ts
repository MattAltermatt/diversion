import { describe, it, expect } from 'vitest'
import { metaballsSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('metaballs schema', () => {
  it('parses to documented defaults', () => {
    const d = metaballsSchema.parse({})
    expect(d).toEqual({
      blobCount: 8,
      radiusMin: 0.06,
      radiusMax: 0.16,
      threshold: 1.0,
      edgeSoftness: 0.06,
      buoyancy: 0.4,
      viscosity: 0.6,
      glow: 0.3,
      speed: 0.6,
      seed: 1742,
      colorA: '#ff2e63',
      colorB: '#ffd56b',
      background: '#05060a',
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(metaballsSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec (full snapshot)', () => {
    const cfg = { ...metaballsSchema.parse({}), blobCount: 12, colorB: '#00ffcc' }
    const sp = encodeConfig(metaballsSchema, cfg)
    expect(sp.get('blobCount')).toBe('12')
    expect(sp.has('speed')).toBe(true) // full snapshot — every field emitted
    expect(decodeConfig(metaballsSchema, sp)).toEqual(cfg)
  })
})
