import { describe, it, expect } from 'vitest'
import { createBuffer, fillBuffer, rasterPolygon, computeError } from './raster'

describe('createBuffer / fillBuffer', () => {
  it('fills every pixel with the given RGB', () => {
    const buf = createBuffer(4, 3)
    fillBuffer(buf, 10, 20, 30)
    for (let i = 0; i < buf.data.length; i += 3) {
      expect(buf.data[i]).toBe(10)
      expect(buf.data[i + 1]).toBe(20)
      expect(buf.data[i + 2]).toBe(30)
    }
  })
})

describe('rasterPolygon', () => {
  it('paints an opaque square covering roughly the expected pixel area', () => {
    const buf = createBuffer(10, 10)
    fillBuffer(buf, 0, 0, 0)
    // A square spanning [0.2,0.8] x [0.2,0.8] of a 10x10 buffer covers ~6x6 px.
    rasterPolygon(buf, [0.2, 0.2, 0.8, 0.2, 0.8, 0.8, 0.2, 0.8], 255, 0, 0, 1)
    let painted = 0
    for (let i = 0; i < buf.data.length; i += 3) {
      if (buf.data[i] === 255) painted++
    }
    expect(painted).toBeGreaterThan(20)
    expect(painted).toBeLessThan(64)
  })

  it('leaves the buffer untouched for alpha <= 0', () => {
    const buf = createBuffer(4, 4)
    fillBuffer(buf, 1, 2, 3)
    rasterPolygon(buf, [0, 0, 1, 0, 1, 1, 0, 1], 255, 255, 255, 0)
    expect(Array.from(buf.data)).toEqual(Array.from(new Uint8ClampedArray(4 * 4 * 3).fill(0).map((_, i) => [1, 2, 3][i % 3])))
  })

  it('alpha-blends onto the existing pixel rather than replacing it', () => {
    const buf = createBuffer(2, 2)
    fillBuffer(buf, 0, 0, 0)
    rasterPolygon(buf, [0, 0, 2, 0, 2, 2, 0, 2], 200, 0, 0, 0.5)
    // 0 * 0.5 + 200 * 0.5 = 100
    expect(buf.data[0]).toBe(100)
  })
})

describe('computeError', () => {
  it('is zero for identical buffers', () => {
    const a = createBuffer(5, 5)
    fillBuffer(a, 50, 60, 70)
    const b = createBuffer(5, 5)
    fillBuffer(b, 50, 60, 70)
    expect(computeError(a, b)).toBe(0)
  })

  it('grows with the magnitude of the difference', () => {
    const target = createBuffer(3, 3)
    fillBuffer(target, 100, 100, 100)
    const near = createBuffer(3, 3)
    fillBuffer(near, 110, 100, 100)
    const far = createBuffer(3, 3)
    fillBuffer(far, 200, 100, 100)
    expect(computeError(near, target)).toBeGreaterThan(0)
    expect(computeError(far, target)).toBeGreaterThan(computeError(near, target))
  })
})
