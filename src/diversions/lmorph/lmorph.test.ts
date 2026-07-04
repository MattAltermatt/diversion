import { describe, it, expect } from 'vitest'
import { lmorphSchema } from './schema'
import {
  mulberry32, pickOrder, sampleShape, morphRadii, smoothstep, radiusAt,
  pointsFromRadii, SHAPE_TYPES, type Shape,
} from './lmorph'

describe('lmorph schema', () => {
  it('parses with valid, complete defaults', () => {
    const cfg = lmorphSchema.parse({})
    expect(cfg.shapes).toBe(6)
    expect(cfg.points).toBe(540)
    expect(cfg.palette.length).toBeGreaterThan(0)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    // Every slider default sits within its declared bounds.
    expect(cfg.morphSpeed).toBeGreaterThanOrEqual(0.1)
    expect(cfg.morphSpeed).toBeLessThanOrEqual(2)
    expect(cfg.ghostTrails).toBeGreaterThanOrEqual(0)
    expect(cfg.ghostTrails).toBeLessThanOrEqual(1)
    expect(cfg.colorMode).toBe('spectrum')
  })

  it('rejects out-of-range fields', () => {
    expect(() => lmorphSchema.parse({ shapes: 99 })).toThrow()
    expect(() => lmorphSchema.parse({ points: 10 })).toThrow()
  })
})

describe('lmorph determinism', () => {
  it('same seed → identical shape order + params + sampled radii', () => {
    const a = pickOrder(mulberry32(42), 6)
    const b = pickOrder(mulberry32(42), 6)
    expect(a).toEqual(b)

    const n = 360
    for (let i = 0; i < a.length; i++) {
      expect(Array.from(sampleShape(a[i], n))).toEqual(Array.from(sampleShape(b[i], n)))
    }
  })

  it('different seeds → a different shape cycle', () => {
    expect(pickOrder(mulberry32(1), 6)).not.toEqual(pickOrder(mulberry32(2), 6))
  })

  it('shape count is clamped to the available types and yields distinct types', () => {
    const order = pickOrder(mulberry32(9), 7)
    expect(order.length).toBe(Math.min(7, SHAPE_TYPES.length))
    const types = new Set(order.map((s) => s.type))
    expect(types.size).toBe(order.length) // all distinct
  })
})

describe('lmorph headline: continuous, non-degenerate morphs with no NaN', () => {
  const n = 480
  const shapes: Shape[] = [
    { type: 'circle', m: 0, param: 0 },
    { type: 'polygon', m: 5, param: 0 },
    { type: 'star', m: 6, param: 0.5 },
    { type: 'flower', m: 5, param: 0.35 },
    { type: 'superellipse', m: 0, param: 4 },
    { type: 'gear', m: 10, param: 0.2 },
    { type: 'heart', m: 0, param: 0 },
  ]

  it('every target shape is finite, normalized (max ≈ 1), and non-degenerate', () => {
    for (const shape of shapes) {
      const r = sampleShape(shape, n)
      let max = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      const { xs, ys } = pointsFromRadii(r)
      for (let i = 0; i < n; i++) {
        expect(Number.isFinite(r[i])).toBe(true)
        expect(r[i]).toBeGreaterThanOrEqual(0)
        if (r[i] > max) max = r[i]
        if (xs[i] < minX) minX = xs[i]
        if (xs[i] > maxX) maxX = xs[i]
        if (ys[i] < minY) minY = ys[i]
        if (ys[i] > maxY) maxY = ys[i]
      }
      expect(max).toBeCloseTo(1, 6) // normalized
      // Spans a real 2D outline (not a line / point).
      expect(maxX - minX).toBeGreaterThan(0.5)
      expect(maxY - minY).toBeGreaterThan(0.5)
    }
  })

  it('morph at t=0 is exactly shape A, at t=1 is exactly shape B', () => {
    const a = sampleShape(shapes[0], n) // circle
    const b = sampleShape(shapes[2], n) // star
    const out = new Float64Array(n)
    expect(Array.from(morphRadii(a, b, 0, out))).toEqual(Array.from(a))
    expect(Array.from(morphRadii(a, b, 1, out))).toEqual(Array.from(b))
  })

  it('intermediate morph radii lie between the two shapes at every angle — no jumps', () => {
    const a = sampleShape(shapes[2], n) // star
    const b = sampleShape(shapes[6], n) // heart
    const out = new Float64Array(n)
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const eased = smoothstep(t)
      morphRadii(a, b, eased, out)
      for (let i = 0; i < n; i++) {
        expect(Number.isFinite(out[i])).toBe(true)
        const lo = Math.min(a[i], b[i]) - 1e-9
        const hi = Math.max(a[i], b[i]) + 1e-9
        expect(out[i]).toBeGreaterThanOrEqual(lo)
        expect(out[i]).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('a full eased sweep advances monotonically with no radius discontinuity', () => {
    const a = sampleShape(shapes[1], n) // polygon
    const b = sampleShape(shapes[5], n) // gear
    const out = new Float64Array(n)
    let prev = new Float64Array(a)
    let maxStep = 0
    const STEPS = 60
    for (let k = 1; k <= STEPS; k++) {
      morphRadii(a, b, smoothstep(k / STEPS), out)
      for (let i = 0; i < n; i++) {
        maxStep = Math.max(maxStep, Math.abs(out[i] - prev[i]))
      }
      prev = new Float64Array(out)
    }
    // Per-frame radius change stays small → the outline never "jumps".
    expect(maxStep).toBeLessThan(0.2)
  })

  it('radiusAt is finite and non-negative across a fine angular sweep for all types', () => {
    for (const type of SHAPE_TYPES) {
      const shape: Shape = { type, m: 7, param: type === 'superellipse' ? 4 : 0.4 }
      for (let i = 0; i < 2000; i++) {
        const v = radiusAt(shape, (i / 2000) * Math.PI * 2)
        expect(Number.isFinite(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(0)
      }
    }
  })
})
