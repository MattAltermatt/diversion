import { describe, it, expect } from 'vitest'
import { harmonographSchema } from './schema'
import {
  buildFigure, penPosition, envelope, makeRng, SETTLE_ENVELOPE,
} from './harmonograph'

const defaults = harmonographSchema.parse({})

// Sample the first N pen positions along an advancing t, mirroring the frame loop.
function samplePath(seed: number, cfg = defaults, n = 200): { x: number; y: number }[] {
  const rng = makeRng(seed)
  rng() // baseHue draw (matches setup ordering)
  const fig = buildFigure(rng, cfg)
  const pts: { x: number; y: number }[] = []
  let t = 0
  for (let i = 0; i < n; i++) {
    t += 0.05
    pts.push(penPosition(fig, t))
  }
  return pts
}

describe('harmonograph schema', () => {
  it('parses with all defaults and they are valid', () => {
    const cfg = harmonographSchema.parse({})
    expect(cfg.pendulums).toBe(2)
    expect(cfg.pendulums).toBeGreaterThanOrEqual(2)
    expect(cfg.pendulums).toBeLessThanOrEqual(4)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.colors.length).toBeGreaterThanOrEqual(2)
    expect(cfg.damping).toBeGreaterThan(0)
    // seed is randomizeOnFreshLoad (pin-only in the codec)
    expect(harmonographSchema.shape.seed.meta()?.randomizeOnFreshLoad).toBe(true)
  })

  it('rejects an out-of-range pendulum count', () => {
    expect(() => harmonographSchema.parse({ pendulums: 9 })).toThrow()
  })
})

describe('harmonograph determinism', () => {
  it('same seed → identical first-N sampled points', () => {
    const a = samplePath(1234)
    const b = samplePath(1234)
    expect(b).toEqual(a)
  })

  it('different seed → a different figure', () => {
    const a = samplePath(1234)
    const b = samplePath(5678)
    // Not every point need differ, but the paths as a whole must.
    expect(b).not.toEqual(a)
  })

  it('figure params are reproducible for a given seed', () => {
    const f1 = buildFigure(makeRng(42), defaults)
    const f2 = buildFigure(makeRng(42), defaults)
    expect(f2).toEqual(f1)
    // pendulums=2 → 2 terms per axis
    expect(f1.xs).toHaveLength(2)
    expect(f1.ys).toHaveLength(2)
  })
})

describe('harmonograph headline visual', () => {
  it('the sampled path spans a meaningful, finite bounding box', () => {
    const pts = samplePath(1234)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }
    const spanX = maxX - minX
    const spanY = maxY - minY
    // A real 2D figure — not a point, not a degenerate line on either axis.
    // Amplitudes sum to 1, so a healthy figure spans a large fraction of −1..1.
    expect(spanX).toBeGreaterThan(0.3)
    expect(spanY).toBeGreaterThan(0.3)
  })

  it('holds structure across seeds (no degenerate figures)', () => {
    for (const seed of [1, 2, 3, 7, 99, 4207, 100000]) {
      const pts = samplePath(seed, defaults, 300)
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
      expect(maxX - minX).toBeGreaterThan(0.2)
      expect(maxY - minY).toBeGreaterThan(0.2)
    }
  })
})

describe('harmonograph envelope / settle loop', () => {
  it('envelope starts near 1 and decays toward 0', () => {
    const fig = buildFigure(makeRng(3), defaults)
    expect(envelope(fig, 0)).toBeCloseTo(1, 5)
    const early = envelope(fig, 10)
    const late = envelope(fig, 400)
    expect(late).toBeLessThan(early)
    expect(late).toBeLessThan(SETTLE_ENVELOPE)
  })

  it('a settle threshold is eventually crossed for any seed', () => {
    for (const seed of [1, 50, 4207]) {
      const fig = buildFigure(makeRng(seed), defaults)
      // slowest term damps at >= 0.6 * damping; ensure it crosses within a bound.
      let t = 0
      let crossed = false
      while (t < 5000) {
        if (envelope(fig, t) <= SETTLE_ENVELOPE) { crossed = true; break }
        t += 5
      }
      expect(crossed).toBe(true)
    }
  })
})
