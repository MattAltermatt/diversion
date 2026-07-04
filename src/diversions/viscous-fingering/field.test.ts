import { describe, it, expect } from 'vitest'
import { simDims, seedField, buildLUT, killFor, dvFor } from './field'

describe('simDims', () => {
  it('caps the longest side to 640, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBe(640)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 2)
  })
  it('passes a small field through uncapped', () => {
    expect(simDims(500, 300)).toEqual({ sw: 500, sh: 300 })
  })
})

describe('seedField', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect(seedField(1, 64, 64)).toEqual(seedField(1, 64, 64))
    expect(seedField(1, 64, 64)).not.toEqual(seedField(2, 64, 64))
  })
  it('concentrates the invading fluid at the CENTRE (a source), not the corners', () => {
    const w = 80, h = 80
    const f = seedField(7, w, h)
    const V = (x: number, y: number) => f[(y * w + x) * 4 + 1]
    // centre disc is invaded (V > 0)…
    expect(V(w / 2, h / 2)).toBeGreaterThan(0)
    // …but the corners and edges are empty resident fluid (V == 0, U == 1).
    expect(V(0, 0)).toBe(0)
    expect(V(w - 1, h - 1)).toBe(0)
    expect(f[0]).toBe(1) // U at corner
    // only a small minority of cells are seeded (a central disc, not scattered).
    let vPos = 0
    for (let i = 0; i < w * h; i++) if (f[i * 4 + 1] > 0) vPos++
    expect(vPos).toBeGreaterThan(0)
    expect(vPos).toBeLessThan(w * h * 0.05)
  })
  it('keeps all channels in [0,1]', () => {
    const f = seedField(3, 48, 48)
    for (let i = 0; i < 48 * 48; i++) {
      expect(f[i * 4]).toBeGreaterThanOrEqual(0); expect(f[i * 4]).toBeLessThanOrEqual(1)
      expect(f[i * 4 + 1]).toBeGreaterThanOrEqual(0); expect(f[i * 4 + 1]).toBeLessThanOrEqual(1)
    }
  })
})

describe('knob → coefficient mappings', () => {
  it('killFor climbs with viscosity ratio, staying in the viable coral band', () => {
    expect(killFor(0)).toBeCloseTo(0.059)
    expect(killFor(1)).toBeCloseTo(0.063)
    expect(killFor(0.7)).toBeGreaterThan(killFor(0.3)) // thinner fingers ⇐ higher ratio
    // clamps out-of-range input into the band
    expect(killFor(-1)).toBeCloseTo(0.059)
    expect(killFor(2)).toBeCloseTo(0.063)
  })
  it('dvFor climbs with surface tension (wider fingers)', () => {
    expect(dvFor(0)).toBeCloseTo(0.35)
    expect(dvFor(1)).toBeCloseTo(0.6)
    expect(dvFor(0.8)).toBeGreaterThan(dvFor(0.2))
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA byte ramp, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)                  // alpha opaque
    expect(lut[0]).toBeLessThan(lut[255 * 4]) // R climbs dark→bright
  })
})
