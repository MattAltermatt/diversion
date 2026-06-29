import { describe, it, expect } from 'vitest'
import { trailDims } from './gl'

describe('trailDims', () => {
  it('passes common displays through uncapped (full detail)', () => {
    expect(trailDims(1920, 1080)).toEqual({ tw: 1920, th: 1080 })
    expect(trailDims(2560, 1600)).toEqual({ tw: 2560, th: 1600 })
  })
  it('caps the longest side to 2560, preserving aspect', () => {
    const { tw, th } = trailDims(3840, 2160) // 4K
    expect(Math.max(tw, th)).toBe(2560)
    expect(tw / th).toBeCloseTo(3840 / 2160, 2)
  })
  it('caps a tall field by its height', () => {
    const { tw, th } = trailDims(1000, 2880)
    expect(th).toBe(2560)
    expect(tw).toBe(889)
  })
})
