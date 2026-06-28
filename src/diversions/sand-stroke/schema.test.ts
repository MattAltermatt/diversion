import { describe, it, expect } from 'vitest'
import { sandStrokeSchema } from './schema'

describe('sandStrokeSchema', () => {
  it('parses with all defaults', () => {
    const cfg = sandStrokeSchema.parse({})
    expect(cfg.strokes).toBe(4)
    expect(cfg.speed).toBeCloseTo(0.2)
    expect(cfg.bandHeight).toBeCloseTo(0.17)
    expect(cfg.waviness).toBeCloseTo(0.02)
    expect(cfg.density).toBe(200)
    expect(cfg.opacity).toBeCloseTo(0.1)
    expect(cfg.background).toBe('#f4efe4')
    expect(cfg.color.mode).toBe('palette')
    expect(cfg.color.colors.length).toBeGreaterThanOrEqual(1)
    expect(cfg.colorDrift).toBe(21)
    expect(cfg.seed).toBe(4823)
  })

  it('enforces ranges', () => {
    expect(() => sandStrokeSchema.parse({ strokes: 0 })).toThrow()
    expect(() => sandStrokeSchema.parse({ strokes: 200 })).toThrow()
    expect(() => sandStrokeSchema.parse({ opacity: 1 })).toThrow()
    expect(() => sandStrokeSchema.parse({ background: 'white' })).toThrow()
  })

  it('puts seed last so Advanced renders last', () => {
    const keys = Object.keys(sandStrokeSchema.shape)
    expect(keys[keys.length - 1]).toBe('seed')
  })

  it('colors and stops are #rrggbbaa', () => {
    const cfg = sandStrokeSchema.parse({})
    for (const c of cfg.color.colors) expect(c).toMatch(/^#[0-9a-fA-F]{8}$/)
    for (const s of cfg.color.stops) expect(s).toMatch(/^#[0-9a-fA-F]{8}$/)
  })
})
