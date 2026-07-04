import { describe, it, expect } from 'vitest'
import { epicycleSchema } from './schema'
import { makeRng, buildArms, sampleCurve, penAt, type Arm } from './epicycle'

const defaults = () => epicycleSchema.parse({})

describe('epicycle schema', () => {
  it('parses with valid, in-bounds defaults', () => {
    const cfg = defaults()
    expect(cfg.armCount).toBe(4)
    expect(cfg.armCount).toBeGreaterThanOrEqual(2)
    expect(cfg.armCount).toBeLessThanOrEqual(6)
    expect(cfg.colorMode).toBe('spectrum')
    expect(cfg.colors.length).toBeGreaterThanOrEqual(2)
    // Every field must carry a default (the codec omits defaults from share URLs).
    const shape = epicycleSchema.shape
    for (const key of Object.keys(shape)) {
      expect((shape as Record<string, { meta(): unknown }>)[key].meta()).toBeTruthy()
    }
  })

  it('rejects out-of-range values but keeps other fields on parse of a full object', () => {
    const cfg = epicycleSchema.parse({ ...defaults() })
    expect(cfg.radiusDecay).toBeGreaterThanOrEqual(0.3)
    expect(cfg.radiusDecay).toBeLessThanOrEqual(0.92)
  })
})

describe('epicycle determinism', () => {
  it('same seed → identical arm set', () => {
    const cfg = defaults()
    const a = buildArms(makeRng(cfg.seed), cfg)
    const b = buildArms(makeRng(cfg.seed), cfg)
    expect(a).toEqual(b)
  })

  it('same seed → identical first-N pen points', () => {
    const cfg = defaults()
    const armsA = buildArms(makeRng(cfg.seed), cfg)
    const armsB = buildArms(makeRng(cfg.seed), cfg)
    for (let i = 0; i < 32; i++) {
      const theta = (i / 32) * Math.PI * 2
      expect(penAt(armsA, theta)).toEqual(penAt(armsB, theta))
    }
  })

  it('different seed → different arm set', () => {
    const cfg = defaults()
    const a = buildArms(makeRng(cfg.seed), cfg)
    const b = buildArms(makeRng(cfg.seed + 1), cfg)
    expect(a).not.toEqual(b)
  })

  it('arms have distinct nonzero integer frequencies', () => {
    const cfg = { ...defaults(), armCount: 6, freqSpread: 4 }
    const arms = buildArms(makeRng(cfg.seed), cfg)
    expect(arms).toHaveLength(6)
    const freqs = arms.map((a) => a.freq)
    for (const f of freqs) {
      expect(f).not.toBe(0)
      expect(Number.isInteger(f)).toBe(true)
    }
    expect(new Set(freqs).size).toBe(freqs.length) // all distinct
  })

  it('widens the frequency pool so armCount always fits (no repeats even at spread=1)', () => {
    const cfg = { ...defaults(), armCount: 6, freqSpread: 1 }
    const arms = buildArms(makeRng(cfg.seed), cfg)
    expect(arms).toHaveLength(6)
    expect(new Set(arms.map((a) => a.freq)).size).toBe(6)
  })
})

// HEADLINE PROBE: the arm chain must trace a real, non-degenerate CLOSED roulette —
// finite, with genuine 2D extent, and measurably NOT a plain circle.
describe('epicycle headline: non-degenerate closed roulette', () => {
  const bbox = (c: { xs: Float64Array; ys: Float64Array; count: number }) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < c.count; i++) {
      minX = Math.min(minX, c.xs[i]); maxX = Math.max(maxX, c.xs[i])
      minY = Math.min(minY, c.ys[i]); maxY = Math.max(maxY, c.ys[i])
    }
    return { w: maxX - minX, h: maxY - minY }
  }

  it('has finite samples with real 2D extent (no NaN, not a point/line)', () => {
    const cfg = defaults()
    const curve = sampleCurve(buildArms(makeRng(cfg.seed), cfg), 1200)
    for (let i = 0; i < curve.count; i++) {
      expect(Number.isFinite(curve.xs[i])).toBe(true)
      expect(Number.isFinite(curve.ys[i])).toBe(true)
    }
    const { w, h } = bbox(curve)
    expect(w).toBeGreaterThan(0.1)
    expect(h).toBeGreaterThan(0.1)
    expect(curve.maxR).toBeGreaterThan(0)
  })

  it('closes: last sample coincides with the first', () => {
    const cfg = defaults()
    const curve = sampleCurve(buildArms(makeRng(cfg.seed), cfg), 1000)
    const last = curve.count - 1
    expect(curve.xs[last]).toBeCloseTo(curve.xs[0], 6)
    expect(curve.ys[last]).toBeCloseTo(curve.ys[0], 6)
  })

  it('is distinct from a plain circle (radius from centre genuinely varies)', () => {
    const cfg = defaults()
    const curve = sampleCurve(buildArms(makeRng(cfg.seed), cfg), 2000)
    // Curve is centred at the origin (every frequency is nonzero → zero mean), so the
    // distance from origin is its radius. A plain circle → constant radius (std ≈ 0).
    const rs: number[] = []
    for (let i = 0; i < curve.count; i++) rs.push(Math.hypot(curve.xs[i], curve.ys[i]))
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length
    const variance = rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length
    const std = Math.sqrt(variance)
    expect(mean).toBeGreaterThan(0)
    expect(std / mean).toBeGreaterThan(0.05) // clearly not a constant-radius circle
  })

  it('a single-frequency chain IS a circle (guards the probe above is meaningful)', () => {
    // Sanity: one dominant arm → near-constant radius, low variation.
    const arms: Arm[] = [{ radius: 1, freq: 1, phase: 0 }]
    const curve = sampleCurve(arms, 1000)
    const rs: number[] = []
    for (let i = 0; i < curve.count; i++) rs.push(Math.hypot(curve.xs[i], curve.ys[i]))
    const mean = rs.reduce((s, v) => s + v, 0) / rs.length
    const std = Math.sqrt(rs.reduce((s, v) => s + (v - mean) ** 2, 0) / rs.length)
    expect(std / mean).toBeLessThan(0.01)
  })
})
