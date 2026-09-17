import { describe, expect, it } from 'vitest'
import { fbm2, makeNoise2D, makeRng } from './noise'

describe('makeRng', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    const a = makeRng(7), b = makeRng(7), c = makeRng(8)
    const seqA = Array.from({ length: 200 }, () => a())
    const seqB = Array.from({ length: 200 }, () => b())
    expect(seqA).toEqual(seqB)
    const seqC = Array.from({ length: 10 }, () => c())
    expect(seqC).not.toEqual(seqA.slice(0, 10))
  })

  it('stays in [0, 1)', () => {
    const r = makeRng(3)
    for (let i = 0; i < 20_000; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('fbm2', () => {
  // The probe hand-rolled a hash whose arithmetic right-shift cleared the top bit, so it
  // returned [0, 0.5) and every field built on it was half-scale. A test asserting only
  // "stays in [0,1]" passes for `() => 0.25` and would not have caught it. These assert
  // the range is actually SPANNED and centred, which is what a mutant cannot fake.
  const n = makeNoise2D(11)
  const sample = (count: number, octaves: number) => {
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      out.push(fbm2(n, (i % 1000) * 0.37, Math.floor(i / 1000) * 0.61, octaves))
    }
    return out
  }

  // Bounds below are MEASURED off this implementation, not authored, and each is chosen
  // because a named mutant fails it. Measured at 200k samples:
  //   correct, 1 octave : min 0.013  max 0.993  mean 0.4981  sd 0.151
  //   correct, 4 octaves: min 0.121  max 0.859  mean 0.4986  sd 0.093
  //   half-range hash   : min 0.060  max 0.430  mean 0.2493
  // Note a 4-octave fbm never approaches 0 or 1 — it is an average, so it concentrates.
  // Asserting `min < 0.05` at 4 octaves would fail the CORRECT implementation, which is
  // why the span check is made at one octave, where the underlying field is exposed.
  it('spans [0, 1] at one octave, where the raw field shows through', () => {
    const vs = sample(200_000, 1)
    let min = Infinity, max = -Infinity
    for (const v of vs) { if (v < min) min = v; if (v > max) max = v }
    expect(min).toBeGreaterThanOrEqual(0)
    expect(max).toBeLessThanOrEqual(1)
    expect(min).toBeLessThan(0.05)    // half-range mutant cannot reach here
    expect(max).toBeGreaterThan(0.95) // half-range mutant tops out ~0.43
  })

  it('is centred and dispersed — kills both a half-range hash and a constant', () => {
    const vs = sample(200_000, 4)
    let sum = 0, sq = 0
    for (const v of vs) { sum += v; sq += v * v }
    const mean = sum / vs.length
    const sd = Math.sqrt(sq / vs.length - mean * mean)
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.02) // half-range sits at 0.249
    expect(sd).toBeGreaterThan(0.05)                // a constant has sd 0
  })

  it('is continuous — a small step makes a small change', () => {
    for (let i = 0; i < 500; i++) {
      const x = i * 0.13, y = i * 0.29
      expect(Math.abs(fbm2(n, x, y, 4) - fbm2(n, x + 0.01, y, 4))).toBeLessThan(0.05)
    }
  })

  it('is deterministic per seed and differs across seeds', () => {
    const a = makeNoise2D(5), b = makeNoise2D(5), c = makeNoise2D(6)
    expect(fbm2(a, 3.3, 4.4, 3)).toBe(fbm2(b, 3.3, 4.4, 3))
    expect(fbm2(a, 3.3, 4.4, 3)).not.toBe(fbm2(c, 3.3, 4.4, 3))
  })
})
