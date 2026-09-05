import { describe, it, expect } from 'vitest'
import { substrateSchema } from './schema'

describe('substrateSchema', () => {
  it('parses with all defaults', () => {
    const cfg = substrateSchema.parse({})
    expect(cfg.initialCracks).toBe(3)
    expect(cfg.maxCracks).toBe(11)
    expect(cfg.speed).toBe(13)
    expect(cfg.branchJitter).toBeCloseTo(2)
    expect(cfg.straightPct).toBe(80)
    expect(cfg.minRadius).toBe(25)
    expect(cfg.maxRadius).toBe(400)
    expect(cfg.drawTime).toBe(5)
    expect(cfg.fadeTime).toBeCloseTo(3)
    expect(cfg.grainDensity).toBe(84)
    expect(cfg.grainOpacity).toBeCloseTo(0.135)
    expect(cfg.crackColor).toBe('#2a2a2a')
    expect(cfg.background).toBe('#f4efe4')
    expect(cfg.color.mode).toBe('palette')
    expect(cfg.color.colors.length).toBeGreaterThanOrEqual(1)
    expect(cfg.seed).toBe(2917)
    expect(cfg.orientation).toBe('free')
    expect(cfg.origin).toBe('scatter')
    expect(cfg.startDelay).toBe(0)
  })

  it('enforces ranges', () => {
    expect(() => substrateSchema.parse({ initialCracks: 0 })).toThrow()
    expect(() => substrateSchema.parse({ maxCracks: 0 })).toThrow()
    expect(() => substrateSchema.parse({ maxCracks: 600 })).toThrow()
    expect(() => substrateSchema.parse({ straightPct: 101 })).toThrow()
    expect(() => substrateSchema.parse({ minRadius: 5 })).toThrow()
    expect(() => substrateSchema.parse({ startDelay: 11 })).toThrow()
    expect(() => substrateSchema.parse({ origin: 'edge' })).toThrow()
    expect(() => substrateSchema.parse({ grainOpacity: 1 })).toThrow()
    expect(() => substrateSchema.parse({ background: 'white' })).toThrow()
    expect(() => substrateSchema.parse({ crackColor: '#fff' })).toThrow()
  })

  it('puts seed last so Advanced renders last', () => {
    const keys = Object.keys(substrateSchema.shape)
    expect(keys[keys.length - 1]).toBe('seed')
  })

  it('colors and stops are #rrggbbaa', () => {
    const cfg = substrateSchema.parse({})
    for (const c of cfg.color.colors) expect(c).toMatch(/^#[0-9a-fA-F]{8}$/)
    for (const s of cfg.color.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })

  it('every slider declares min/max/step; seed is a number input (UX invariant 4)', () => {
    for (const [k, field] of Object.entries(substrateSchema.shape)) {
      const m = (field as { meta(): Record<string, unknown> | undefined }).meta() ?? {}
      if (m.ui === 'slider') {
        expect(typeof m.min, k).toBe('number')
        expect(typeof m.max, k).toBe('number')
        expect(typeof m.step, k).toBe('number')
      }
    }
    expect(substrateSchema.shape.seed.meta()?.ui).toBe('number')
  })
})
