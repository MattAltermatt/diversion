import { describe, it, expect } from 'vitest'
import { logCirclesSchema } from './schema'

describe('logCirclesSchema defaults', () => {
  it('parses to the faithful calm defaults', () => {
    const cfg = logCirclesSchema.parse({})
    expect(cfg.ringGrowth).toBeCloseTo(4.1)
    expect(cfg.circlesPerRing).toBe(8)
    expect(cfg.circleSize).toBeCloseTo(0.32)
    expect(cfg.layers).toBe(2)
    expect(cfg.zoomSpeed).toBeCloseTo(0.35)
    expect(cfg.direction).toBe('out')
    expect(cfg.rotateSpeed).toBeCloseTo(0.15)
    expect(cfg.color.mode).toBe('mono')
    expect(cfg.color.background).toBe('#000000')
    expect(cfg.color.fg).toBe('#ffffff')
    expect(cfg.color.scanlines).toBeCloseTo(0.1)
    expect(cfg.color.centerDots).toBe(true)
    expect(cfg.color.tints.length).toBeGreaterThan(0)
  })
})
