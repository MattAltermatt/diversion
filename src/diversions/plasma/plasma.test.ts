import { describe, it, expect } from 'vitest'
import { hexToRgb } from './plasma'

describe('hexToRgb', () => {
  it('converts #rrggbb to 0..1 floats', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    const [r, g, b] = hexToRgb('#8040c0')
    expect(r).toBeCloseTo(0.502, 2)
    expect(g).toBeCloseTo(0.251, 2)
    expect(b).toBeCloseTo(0.753, 2)
  })
})
