import { describe, it, expect } from 'vitest'
import { swarmalatorsSchema } from './schema'

describe('swarmalatorsSchema', () => {
  const shape = swarmalatorsSchema.shape
  it('every field carries a label and help', () => {
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as { meta?: () => Record<string, unknown> }).meta?.()
      expect(meta?.label, `${key} label`).toBeTruthy()
      expect(meta?.help, `${key} help`).toBeTruthy()
    }
  })
  it('slider fields define min/max/step', () => {
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as { meta?: () => Record<string, unknown> }).meta?.()
      if (meta?.ui === 'slider') {
        expect(typeof meta.min, `${key} min`).toBe('number')
        expect(typeof meta.max, `${key} max`).toBe('number')
        expect(typeof meta.step, `${key} step`).toBe('number')
      }
    }
  })
  it('seed is pin-only (randomizeOnFreshLoad)', () => {
    expect((shape.seed as { meta: () => Record<string, unknown> }).meta().randomizeOnFreshLoad).toBe(true)
  })
  it('defaults to the Active phase wave coupling', () => {
    const cfg = swarmalatorsSchema.parse({})
    expect(cfg.J).toBe(1)
    expect(cfg.K).toBe(-0.75)
    expect(cfg.omegaSpread).toBe(0)
    expect(cfg.colorMap).toBe('Spectrum')
  })
})
