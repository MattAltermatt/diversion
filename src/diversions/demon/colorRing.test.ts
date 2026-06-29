import { describe, it, expect } from 'vitest'
import { buildHueRing } from './colorRing'

describe('buildHueRing', () => {
  it('produces exactly n colors', () => {
    expect(buildHueRing(8, 0, 360, 70, 55)).toHaveLength(8)
    expect(buildHueRing(3, 0, 360, 70, 55)).toHaveLength(3)
  })
  it('returns CSS rgb() strings', () => {
    for (const c of buildHueRing(5, 0, 360, 70, 55)) {
      expect(c).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    }
  })
  it('spaces hues evenly across the span (first stop at hueStart)', () => {
    const ring = buildHueRing(4, 0, 360, 100, 50)
    expect(ring[0]).toBe('rgb(255,0,0)')   // hue 0
    expect(ring[2]).toBe('rgb(0,255,255)') // hue 180
  })
})
