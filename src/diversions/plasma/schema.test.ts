import { describe, it, expect } from 'vitest'
import { plasmaSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('plasma schema', () => {
  it('parses to documented defaults', () => {
    const d = plasmaSchema.parse({})
    expect(d).toEqual({
      speed: 1,
      scale: 3,
      warp: 0.6,
      octaves: 3,
      contrast: 1,
      colorA: '#10063a',
      colorB: '#ff5d8f',
    })
  })

  it('every field carries a ui meta', () => {
    for (const [, field] of Object.entries(plasmaSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec (full snapshot)', () => {
    const cfg = { ...plasmaSchema.parse({}), scale: 5.5, colorB: '#00ffcc' }
    const sp = encodeConfig(plasmaSchema, cfg)
    expect(sp.get('scale')).toBe('5.5')
    expect(sp.has('speed')).toBe(true) // full snapshot — every field emitted
    expect(decodeConfig(plasmaSchema, sp)).toEqual(cfg)
  })
})
