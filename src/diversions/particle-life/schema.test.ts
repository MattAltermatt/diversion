import { describe, it, expect } from 'vitest'
import { particleLifeSchema } from './schema'

describe('particleLifeSchema', () => {
  it('parses to sensible defaults', () => {
    const c = particleLifeSchema.parse({})
    expect(c.count).toBe(1500)
    expect(c.colors).toBe(6)
    expect(c.symmetry).toBe('Asymmetric')
    expect(c.glow).toBe(true)
  })

  it('every slider field carries min/max meta (UX invariant #4)', () => {
    const shape = particleLifeSchema.shape as Record<string, { meta?: () => any }>
    for (const [name, field] of Object.entries(shape)) {
      const meta = field.meta?.()
      if (meta?.ui === 'slider') {
        expect(meta.min, `${name} min`).toBeTypeOf('number')
        expect(meta.max, `${name} max`).toBeTypeOf('number')
      }
    }
  })

  it('accepts an in-range config (codec-level revert is covered by urlCodec sweep)', () => {
    expect(() => particleLifeSchema.parse({ colors: 6 })).not.toThrow()
  })
})
