import { describe, it, expect } from 'vitest'
import { neuralCaSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { MODEL_IDS } from './models'

describe('neural-ca schema', () => {
  it('parses to documented defaults (seed is a stable constant; the route layer rolls it fresh)', () => {
    const d = neuralCaSchema.parse({})
    expect(d.pattern).toBe('bubbly')
    expect(d.speed).toBe(1.5)
    expect(d.scale).toBe(1)
    expect(d.seed).toBe(1337)
  })

  it('pattern enum covers every curated model id', () => {
    for (const id of MODEL_IDS) {
      expect(neuralCaSchema.parse({ pattern: id }).pattern).toBe(id)
    }
  })

  it('seed is a stable constant across parses (per-visit variety is the route layer\'s job, not the default)', () => {
    // The keystone contract: the seed default is a fixed constant so the codec
    // round-trip is deterministic; `randomizeOnFreshLoad` makes the route layer
    // roll a fresh one on a bare load. A random default would break the sweep.
    expect(neuralCaSchema.parse({}).seed).toBe(neuralCaSchema.parse({}).seed)
  })

  it('every visible field carries a ui meta', () => {
    for (const [, field] of Object.entries(neuralCaSchema.shape)) {
      const meta = (field as { meta(): { ui?: string } }).meta()
      expect(meta.ui).toBeTruthy()
    }
  })

  it('round-trips a tweaked config through the URL codec (seed is pin-only, not encoded)', () => {
    const cfg = { ...neuralCaSchema.parse({}), pattern: 'woven', speed: 2.5, scale: 1.5, seed: 42 }
    const sp = encodeConfig(neuralCaSchema, cfg)
    expect(sp.get('pattern')).toBe('woven')
    // seed is a randomizeOnFreshLoad field → encode never emits it, decode reverts to default.
    expect(sp.get('seed')).toBeNull()
    expect(decodeConfig(neuralCaSchema, sp)).toEqual({ ...cfg, seed: neuralCaSchema.parse({}).seed })
  })
})
