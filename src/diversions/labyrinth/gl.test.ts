import { describe, it, expect } from 'vitest'
import { trailDims, hexToVec3 } from './gl'
import { mazeGridFor } from './maze'

describe('trailDims', () => {
  it('leaves common displays uncapped', () => {
    expect(trailDims(1920, 1080)).toEqual({ tw: 1920, th: 1080 })
    expect(trailDims(2560, 1440)).toEqual({ tw: 2560, th: 1440 })
  })
  it('caps the long edge on oversized canvases', () => {
    const big = trailDims(6000, 3000)
    expect(Math.max(big.tw, big.th)).toBeLessThanOrEqual(2560)
  })
})

describe('mazeGridFor', () => {
  it('keeps cells at least 8 texels even at max maze size', () => {
    const g = mazeGridFor(40, 1000, 800)
    expect(g.cellPx).toBeGreaterThanOrEqual(8)
  })
})

describe('hexToVec3', () => {
  it('converts #rrggbb to 0..1 components', () => {
    expect(hexToVec3('#000000')).toEqual([0, 0, 0])
    expect(hexToVec3('#ffffff')).toEqual([1, 1, 1])
    const [r, g, b] = hexToVec3('#ff8000')
    expect(r).toBe(1); expect(g).toBeCloseTo(128 / 255); expect(b).toBe(0)
  })
})
