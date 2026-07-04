import { describe, it, expect } from 'vitest'
import { forestFireSchema } from './schema'

describe('forestFireSchema', () => {
  it('parses with valid defaults', () => {
    const cfg = forestFireSchema.parse({})
    expect(cfg.cellSize).toBe(4)
    expect(cfg.speed).toBe(12)
    expect(cfg.growth).toBeGreaterThan(0)
    expect(cfg.lightning).toBeGreaterThanOrEqual(0)
    // the self-organizing regime needs growth ≫ lightning
    expect(cfg.growth).toBeGreaterThan(cfg.lightning * 100)
    expect(cfg.ground).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.tree).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.fire).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every slider field carries min/max/step bounds', () => {
    const shape = forestFireSchema.shape
    for (const key of Object.keys(shape)) {
      const meta = (shape as Record<string, { meta(): Record<string, unknown> | undefined }>)[key].meta()
      if (meta?.ui === 'slider') {
        expect(typeof meta.min, `${key}.min`).toBe('number')
        expect(typeof meta.max, `${key}.max`).toBe('number')
        expect(typeof meta.step, `${key}.step`).toBe('number')
      }
    }
  })

  it('marks the seed as randomize-on-fresh-load', () => {
    const meta = forestFireSchema.shape.seed.meta()
    expect(meta?.randomizeOnFreshLoad).toBe(true)
  })
})
