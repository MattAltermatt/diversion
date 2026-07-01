import { describe, it, expect } from 'vitest'
import { particleLifeGpuSchema } from './schema'
import { encodeConfig, freshLoadKeys } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('particle-life-gpu schema', () => {
  it('defaults resolve with the GPU-scale particle count', () => {
    const c = particleLifeGpuSchema.parse({})
    expect(c.count).toBe(8000)
    expect(c.colors).toBe(6)
    expect(c.palette).toBe('Mariners')
    expect(c.seed).toBe(1337)
  })

  it('enforces the particle-count ceiling (all-pairs 60fps headroom)', () => {
    expect(() => particleLifeGpuSchema.parse({ count: 25000 })).not.toThrow()
    expect(() => particleLifeGpuSchema.parse({ count: 25001 })).toThrow()
    expect(() => particleLifeGpuSchema.parse({ count: 499 })).toThrow()
  })

  // Exemplifies the seed keystone (the contract #193 found missing across 16/19
  // diversions): the seed is randomizeOnFreshLoad, so a shared link is seedless
  // (new world every visit) and only an explicit ?seed / the 📌 pinned link carries it.
  it('flags seed randomizeOnFreshLoad and keeps it out of a plain share link', () => {
    const seedMeta = readMeta(particleLifeGpuSchema.shape.seed)
    expect(seedMeta?.randomizeOnFreshLoad).toBe(true)

    expect(freshLoadKeys(particleLifeGpuSchema).has('seed')).toBe(true)

    const cfg = particleLifeGpuSchema.parse({})
    const plain = encodeConfig(particleLifeGpuSchema, cfg)
    expect(plain.has('seed')).toBe(false) // seedless by default

    const pinned = encodeConfig(particleLifeGpuSchema, cfg, { includePinned: true })
    expect(pinned.get('seed')).toBe('1337') // pinned link carries it
  })
})
