import { describe, it, expect } from 'vitest'
import { sphFluidSchema } from './schema'

describe('sph-fluid schema', () => {
  it('parses with all defaults', () => {
    const cfg = sphFluidSchema.parse({})
    expect(cfg.particleCount).toBeGreaterThanOrEqual(400)
    expect(cfg.renderMode).toBe('liquid')
    expect(cfg.fluidColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.surfaceColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every field carries a default (codec derives defaults from the schema)', () => {
    const cfg = sphFluidSchema.parse({})
    for (const key of Object.keys(sphFluidSchema.shape)) {
      expect(cfg[key as keyof typeof cfg]).toBeDefined()
    }
  })

  it('sliders declare bounds; the seed is pin-only (randomizeOnFreshLoad)', () => {
    const shape = sphFluidSchema.shape
    for (const [name, field] of Object.entries(shape)) {
      const meta = (field as { meta: () => Record<string, unknown> }).meta() ?? {}
      if (meta.ui === 'slider') {
        expect(meta.min, `${name} slider needs min`).toBeTypeOf('number')
        expect(meta.max, `${name} slider needs max`).toBeTypeOf('number')
      }
    }
    expect((shape.seed.meta() as Record<string, unknown>).randomizeOnFreshLoad).toBe(true)
  })
})
