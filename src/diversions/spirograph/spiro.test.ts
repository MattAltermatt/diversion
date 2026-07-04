import { describe, it, expect } from 'vitest'
import { spirographSchema } from './schema'
import {
  gcd, petalCount, revolutions, thetaMax, penAt, maxRadius,
  sampleCurve, pickRosette, mulberry32, type Rosette,
} from './spiro'

describe('spirograph schema', () => {
  it('parses with valid defaults', () => {
    const cfg = spirographSchema.parse({})
    expect(cfg.R).toBe(7)
    expect(cfg.r).toBe(3)
    expect(cfg.mode).toBe('inside')
    expect(cfg.colorMode).toBe('spectrum')
    expect(cfg.palette.length).toBeGreaterThanOrEqual(1)
  })

  it('rejects out-of-range gears and bad hex colors', () => {
    expect(spirographSchema.safeParse({ R: 99 }).success).toBe(false)
    expect(spirographSchema.safeParse({ background: 'nope' }).success).toBe(false)
  })

  it('flags the seed field randomizeOnFreshLoad (pin-only in codec)', () => {
    const meta = (spirographSchema.shape.seed as { meta: () => any }).meta()
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })
})

describe('spiro math', () => {
  it('gcd / petal / revolution counts are correct', () => {
    expect(gcd(12, 8)).toBe(4)
    expect(petalCount(7, 3)).toBe(7) // coprime → R petals
    expect(petalCount(8, 4)).toBe(2) // gcd 4 → 2 petals
    expect(revolutions(7, 3)).toBe(3) // r/gcd
    expect(thetaMax(7, 3)).toBeCloseTo(2 * Math.PI * 3, 10)
  })

  it('penAt returns finite coords bounded by maxRadius', () => {
    const ros: Rosette = { R: 7, r: 3, d: 0.75, mode: 'inside' }
    const mr = maxRadius(ros)
    for (let t = 0; t < 20; t++) {
      const p = penAt(ros, t)
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(mr + 1e-9)
    }
  })
})

describe('determinism (same seed → same blooms)', () => {
  it('pickRosette replays an identical sequence for the same seed', () => {
    const seqA = Array.from({ length: 6 }, (_, __) => 0)
    const rngA = mulberry32(42)
    const a = seqA.map(() => pickRosette(rngA))
    const rngB = mulberry32(42)
    const b = seqA.map(() => pickRosette(rngB))
    expect(a).toEqual(b)
    // A different seed diverges.
    const rngC = mulberry32(43)
    const c = seqA.map(() => pickRosette(rngC))
    expect(c).not.toEqual(a)
  })

  it('sampleCurve is deterministic for a fixed rosette', () => {
    const ros: Rosette = { R: 9, r: 4, d: 0.8, mode: 'outside' }
    const c1 = sampleCurve(ros, 120)
    const c2 = sampleCurve(ros, 120)
    expect(Array.from(c1.xs)).toEqual(Array.from(c2.xs))
    expect(Array.from(c1.ys)).toEqual(Array.from(c2.ys))
  })
})

describe('headline: a non-degenerate closed rosette', () => {
  it('spans a real 2D bbox with no NaN and closes back near its start', () => {
    const ros: Rosette = { R: 7, r: 3, d: 0.75, mode: 'inside' }
    const c = sampleCurve(ros, 360)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < c.count; i++) {
      const x = c.xs[i], y = c.ys[i]
      expect(Number.isNaN(x)).toBe(false)
      expect(Number.isNaN(y)).toBe(false)
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    // Real extent in BOTH axes — not a line or a point.
    expect(maxX - minX).toBeGreaterThan(1)
    expect(maxY - minY).toBeGreaterThan(1)
    // The traced curve closes: last sample lands back near the first.
    const dx = c.xs[c.count - 1] - c.xs[0]
    const dy = c.ys[c.count - 1] - c.ys[0]
    expect(Math.hypot(dx, dy)).toBeLessThan(0.5)
  })

  it('every rolled rosette resolves into a sensible petal count (3..13)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 200; i++) {
      const ros = pickRosette(rng)
      const p = petalCount(ros.R, ros.r)
      expect(p).toBeGreaterThanOrEqual(3)
      expect(p).toBeLessThanOrEqual(13)
      expect(revolutions(ros.R, ros.r)).toBeLessThanOrEqual(8)
    }
  })
})
