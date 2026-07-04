import { describe, it, expect } from 'vitest'
import { pedalRoseSchema } from './schema'
import {
  mulberry32, pickCurve, sampleCurve, penAt, petalCount, petalPeriod, reduce,
  type RoseCurve,
} from './pedal'

// Count local maxima of the radial distance from the origin over one fundamental
// period, treating the sampled loop as circular. Each rose petal tip is one such
// maximum, so this equals the petal count.
function countRadialMaxima(curve: RoseCurve, samples = 3600): number {
  const period = petalPeriod(curve.n, curve.d)
  const r = new Float64Array(samples)
  for (let i = 0; i < samples; i++) {
    const p = penAt(curve, (i / samples) * period) // exclusive endpoint → clean loop
    r[i] = Math.hypot(p.x, p.y)
  }
  let maxima = 0
  for (let i = 0; i < samples; i++) {
    const prev = r[(i - 1 + samples) % samples]
    const next = r[(i + 1) % samples]
    if (r[i] > prev && r[i] > next) maxima++
  }
  return maxima
}

describe('pedal-rose schema', () => {
  it('parses with valid, complete defaults', () => {
    const cfg = pedalRoseSchema.parse({})
    expect(cfg.curveType).toBe('rose')
    expect(cfg.n).toBe(5)
    expect(cfg.d).toBe(1)
    expect(cfg.copies).toBeGreaterThanOrEqual(1)
    expect(cfg.palette.length).toBeGreaterThan(0)
    // Every slider default sits within its declared bounds.
    expect(cfg.traceSpeed).toBeGreaterThanOrEqual(0.5)
    expect(cfg.traceSpeed).toBeLessThanOrEqual(8)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('rejects an out-of-range petal count', () => {
    expect(() => pedalRoseSchema.parse({ n: 99 })).toThrow()
  })
})

describe('pedal-rose determinism', () => {
  it('same seed → identical curve params and sampled points', () => {
    const a = pickCurve(mulberry32(42))
    const b = pickCurve(mulberry32(42))
    expect(a).toEqual(b)

    const sa = sampleCurve(a)
    const sb = sampleCurve(b)
    expect(sa.count).toBe(sb.count)
    expect(Array.from(sa.xs)).toEqual(Array.from(sb.xs))
    expect(Array.from(sa.ys)).toEqual(Array.from(sb.ys))
  })

  it('different seeds → a different bloom sequence', () => {
    const seqOf = (seed: number) => {
      const rng = mulberry32(seed)
      return Array.from({ length: 6 }, () => pickCurve(rng))
    }
    expect(seqOf(1)).not.toEqual(seqOf(2))
  })

  it('reduce puts k = n/d in lowest terms', () => {
    expect(reduce(6, 4)).toEqual([3, 2])
    expect(reduce(5, 1)).toEqual([5, 1])
    expect(reduce(8, 2)).toEqual([4, 1])
  })
})

describe('pedal-rose headline: a rose blooms exactly the right petals', () => {
  it('odd integer k has exactly k petals (radial maxima)', () => {
    for (const k of [3, 5, 7, 9]) {
      const curve: RoseCurve = { type: 'rose', n: k, d: 1 }
      expect(petalCount(k, 1)).toBe(k)
      expect(countRadialMaxima(curve)).toBe(k)
    }
  })

  it('even integer k has exactly 2k petals (radial maxima)', () => {
    for (const k of [2, 4, 6]) {
      const curve: RoseCurve = { type: 'rose', n: k, d: 1 }
      expect(petalCount(k, 1)).toBe(2 * k)
      expect(countRadialMaxima(curve)).toBe(2 * k)
    }
  })

  it('rose and pedal curves are finite and span a non-degenerate bbox', () => {
    const curves: RoseCurve[] = [
      { type: 'rose', n: 5, d: 1 },
      { type: 'rose', n: 7, d: 3 },
      { type: 'pedal', n: 5, d: 1 },
      { type: 'pedal', n: 4, d: 1 },
      { type: 'pedal', n: 7, d: 2 },
    ]
    for (const curve of curves) {
      const sc = sampleCurve(curve)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (let i = 0; i < sc.count; i++) {
        const x = sc.xs[i], y = sc.ys[i]
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
      expect(maxX - minX).toBeGreaterThan(0.1)
      expect(maxY - minY).toBeGreaterThan(0.1)
      expect(sc.maxR).toBeGreaterThan(0.1)
    }
  })
})
