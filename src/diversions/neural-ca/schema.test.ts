import { describe, it, expect } from 'vitest'
import { neuralCaSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { MODEL_IDS } from './models'

describe('neural-ca schema', () => {
  it('parses to documented defaults (seed is rolled fresh each parse)', () => {
    const d = neuralCaSchema.parse({})
    expect(d.pattern).toBe('bubbly')
    expect(d.speed).toBe(1.5)
    expect(d.scale).toBe(1)
    expect(typeof d.seed).toBe('number')
  })

  it('pattern enum covers every curated model id', () => {
    for (const id of MODEL_IDS) {
      expect(neuralCaSchema.parse({ pattern: id }).pattern).toBe(id)
    }
  })

  it('rolls a different seed on separate parses', () => {
    // astronomically unlikely to collide; guards the genesis-variety default
    expect(neuralCaSchema.parse({}).seed).not.toBe(neuralCaSchema.parse({}).seed)
  })

  it('every visible field carries a ui meta', () => {
    for (const [, field] of Object.entries(neuralCaSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec (full snapshot)', () => {
    const cfg = { ...neuralCaSchema.parse({}), pattern: 'woven', speed: 2.5, scale: 1.5, seed: 42 }
    const sp = encodeConfig(neuralCaSchema, cfg)
    expect(sp.get('pattern')).toBe('woven')
    expect(sp.get('seed')).toBe('42')
    expect(decodeConfig(neuralCaSchema, sp)).toEqual(cfg)
  })
})
