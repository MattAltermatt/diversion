import { describe, it, expect } from 'vitest'
import { boxcar2dSchema } from './schema'

describe('boxcar2dSchema', () => {
  it('parses its own defaults', () => {
    const cfg = boxcar2dSchema.parse({})
    expect(cfg.population).toBeGreaterThan(0)
    expect(cfg.color.sky).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(typeof cfg.seed).toBe('number')
  })
})
