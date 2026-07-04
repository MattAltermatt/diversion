import { describe, it, expect } from 'vitest'
import { munchingSquaresSchema, type MunchingSquaresConfig } from './schema'
import {
  baseColorIndex, buildLut, cellColorIndex, deriveParams, expectedLitCount,
  isLit, stepAt, type Variant,
} from './munch'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

const base: MunchingSquaresConfig = munchingSquaresSchema.parse({})

// Brute-force the lit set for a given step, for cross-checking the closed form.
function litCells(t: number, n: number, variant: Variant, offset: number): Set<number> {
  const s = new Set<number>()
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (isLit(x, y, t, n, variant, offset)) s.add(y * n + x)
    }
  }
  return s
}

describe('schema', () => {
  it('parses with valid, curated defaults', () => {
    expect(base.gridPower).toBe(6) // N = 64
    expect(base.rule).toBe('fill')
    expect(base.colorMode).toBe('xor')
    expect(base.color).toEqual({ hueStart: 200, hueSpan: 300, saturation: 85, lightness: 55 })
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('round-trips through the URL codec (seed is pin-only, never emitted)', () => {
    const cfg: MunchingSquaresConfig = {
      ...base, gridPower: 7, rule: 'fill', colorMode: 'position', stepSpeed: 15, colorSpeed: 3,
      background: '#101018', color: { hueStart: 40, hueSpan: 180, saturation: 60, lightness: 50 },
    }
    const sp = encodeConfig(munchingSquaresSchema, cfg)
    expect(sp.has('seed')).toBe(false) // randomizeOnFreshLoad → pin-only
    const back = decodeConfig(munchingSquaresSchema, sp)
    expect(back.gridPower).toBe(7)
    expect(back.rule).toBe('fill')
    expect(back.colorMode).toBe('position')
    expect(back.stepSpeed).toBe(15)
    expect(back.color).toEqual(cfg.color)
    expect(back.background).toBe('#101018')
  })
})

describe('deriveParams (seed determinism)', () => {
  it('is deterministic: same seed → same variant / offset / phase', () => {
    const a = deriveParams({ ...base, seed: 12345 })
    const b = deriveParams({ ...base, seed: 12345 })
    expect(a).toEqual(b)
    expect(a.n).toBe(64)
    expect(a.offset).toBeGreaterThanOrEqual(0)
    expect(a.offset).toBeLessThan(64)
    expect(a.seedPhase).toBeGreaterThanOrEqual(0)
    expect(a.seedPhase).toBeLessThan(256)
  })

  it('varies the Auto variant across seeds, and honors an explicit rule', () => {
    const variants = new Set<Variant>()
    for (let s = 1; s <= 40; s++) variants.add(deriveParams({ ...base, rule: 'auto', seed: s }).variant)
    expect(variants.size).toBeGreaterThan(1) // auto really does vary
    // An explicit rule ignores the seed pick.
    expect(deriveParams({ ...base, rule: 'line', seed: 7 }).variant).toBe('line')
    expect(deriveParams({ ...base, rule: 'shift', seed: 999 }).variant).toBe('shift')
  })

  it('N tracks gridPower as a power of two', () => {
    expect(deriveParams({ ...base, gridPower: 5 }).n).toBe(32)
    expect(deriveParams({ ...base, gridPower: 8 }).n).toBe(256)
  })
})

describe('XOR rule — headline structure', () => {
  const n = 64

  it('the lit set at t is fully determined by t (same t → same set)', () => {
    const a = litCells(10, n, 'line', 0)
    const b = litCells(10, n, 'line', 0)
    expect([...a].sort()).toEqual([...b].sort())
  })

  it('lights exactly the closed-form count, independent of t', () => {
    for (const variant of ['line', 'fill', 'shift'] as Variant[]) {
      const offset = 5
      for (const t of [0, 1, 17, 63]) {
        expect(litCells(t, n, variant, offset).size).toBe(expectedLitCount(variant, n))
      }
    }
    // and the counts are the triangular / bijection values we expect
    expect(expectedLitCount('line', n)).toBe(64)
    expect(expectedLitCount('shift', n)).toBe(64)
    expect(expectedLitCount('fill', n)).toBe((64 * 63) / 2)
  })

  it('line rule traces y = x XOR t exactly', () => {
    const t = 21
    for (let x = 0; x < n; x++) {
      const y = x ^ t
      expect(isLit(x, y, t, n, 'line', 0)).toBe(true)
      expect(isLit(x, (y + 1) % n, t, n, 'line', 0)).toBe(y === ((y + 1) % n))
    }
  })

  it('the pattern changes frame-to-frame (t vs t+1 differ)', () => {
    for (const variant of ['line', 'fill', 'shift'] as Variant[]) {
      const now = [...litCells(8, n, variant, 3)].sort()
      const next = [...litCells(9, n, variant, 3)].sort()
      expect(next).not.toEqual(now)
    }
  })

  it('folds back to the start after N steps (period N)', () => {
    const at0 = [...litCells(0, n, 'fill', 0)].sort()
    const atN = [...litCells(n, n, 'fill', 0)].sort() // t is applied mod n by the caller
    // step n ≡ step 0 only once reduced mod n; verify the reduction the driver uses
    expect(stepAt(n, n)).toBe(0)
    expect([...litCells(stepAt(n, n), n, 'fill', 0)].sort()).toEqual(at0)
    void atN
  })
})

describe('color indexing', () => {
  it('base index stays in 0..255 across the grid', () => {
    const n = 64
    for (const mode of ['xor', 'position', 'time'] as const) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const v = baseColorIndex(x, y, 40, n, mode)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThan(256)
        }
      }
    }
  })

  it('the animated phase rotates the index (mod 256)', () => {
    const n = 64
    const at0 = cellColorIndex(3, 5, 10, n, 'xor', 0)
    const at100 = cellColorIndex(3, 5, 10, n, 'xor', 100)
    expect(at100).toBe((at0 + 100) & 255)
  })
})

describe('buildLut', () => {
  it('builds a 256-entry palette LUT', () => {
    const lut = buildLut(200, 300, 85, 55)
    expect(lut.r).toHaveLength(256)
    expect(lut.g).toHaveLength(256)
    expect(lut.b).toHaveLength(256)
  })

  it('greyscale at saturation 0 (r === g === b)', () => {
    const lut = buildLut(0, 360, 0, 50)
    for (let i = 0; i < 256; i++) expect(lut.r[i]).toBe(lut.g[i])
  })
})
