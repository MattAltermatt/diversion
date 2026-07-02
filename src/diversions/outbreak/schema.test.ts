import { describe, it, expect } from 'vitest'
import { outbreakSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('outbreak schema', () => {
  it('parses to defaults', () => {
    const cfg = outbreakSchema.parse({})
    expect(cfg.civilianCount).toBe(500)
    expect(cfg.fighterCount).toBe(30)
    expect(cfg.zombieCount).toBe(40)
    expect(cfg.speed).toBe(1)
    expect(cfg.seed).toBe(1337)
  })

  it('every slider field declares min and max (UX invariant 4)', () => {
    for (const [key, field] of Object.entries(outbreakSchema.shape)) {
      const m = readMeta(field as any)
      if (m?.ui === 'slider') {
        expect(m.min, `${key} min`).toBeTypeOf('number')
        expect(m.max, `${key} max`).toBeTypeOf('number')
      }
    }
  })

  it('seed is a pin-only randomizeOnFreshLoad field', () => {
    const m = readMeta(outbreakSchema.shape.seed as any)
    expect(m?.randomizeOnFreshLoad).toBe(true)
  })

  it('round-trips through the URL codec (seed is pin-only, not encoded)', () => {
    const cfg = outbreakSchema.parse({ seed: 999, civilianCount: 300 })
    const decoded = decodeConfig(outbreakSchema, encodeConfig(outbreakSchema, cfg))
    expect(decoded).toEqual({ ...cfg, seed: outbreakSchema.parse({}).seed })
  })
})
