import { describe, it, expect } from 'vitest'
import { chladniSchema } from './schema'
import {
  chladniField, chladniGrad, buildModeOrder,
  createChladniState, stepGrains, updateChladniState, meanAmplitude,
} from './chladni'

const base = chladniSchema.parse({})

describe('schema', () => {
  it('parses with no input and yields valid defaults', () => {
    expect(base.grainCount).toBe(11000)
    expect(base.autoCycle).toBe('cycle')
    expect(base.superposition).toBe('+')
    expect(base.grainColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('rejects an out-of-range mode and a bad color', () => {
    expect(() => chladniSchema.parse({ modeN: 0 })).toThrow()
    expect(() => chladniSchema.parse({ modeN: 99 })).toThrow()
    expect(() => chladniSchema.parse({ grainColor: 'red' })).toThrow()
  })
  it('marks seed as randomizeOnFreshLoad (pin-only)', () => {
    const meta = chladniSchema.shape.seed.meta() as { randomizeOnFreshLoad?: boolean }
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })
})

describe('chladniField', () => {
  it('is zero on the four plate edges for any mode', () => {
    for (const [n, m] of [[2, 3], [3, 5], [4, 7]] as const) {
      for (const s of [1, -1]) {
        for (const t of [0, 0.17, 0.5, 0.83, 1]) {
          expect(chladniField(0, t, n, m, s)).toBeCloseTo(0, 12)
          expect(chladniField(1, t, n, m, s)).toBeCloseTo(0, 12)
          expect(chladniField(t, 0, n, m, s)).toBeCloseTo(0, 12)
          expect(chladniField(t, 1, n, m, s)).toBeCloseTo(0, 12)
        }
      }
    }
  })
  it('is zero on the diagonal x=y for the "−" superposition (a known nodal line)', () => {
    for (const t of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(chladniField(t, t, 3, 5, -1)).toBeCloseTo(0, 12)
      expect(chladniField(t, t, 2, 7, -1)).toBeCloseTo(0, 12)
    }
  })
  it('collapses to zero everywhere when n=m with "−" (degenerate mode)', () => {
    expect(chladniField(0.31, 0.62, 4, 4, -1)).toBeCloseTo(0, 12)
  })
  it('is non-zero at a generic antinode for the "+" superposition', () => {
    expect(Math.abs(chladniField(0.25, 0.25, 2, 3, 1))).toBeGreaterThan(0.5)
  })
})

describe('chladniGrad', () => {
  it('matches a central finite-difference of the field', () => {
    const eps = 1e-5
    for (const [n, m, s] of [[2, 3, 1], [3, 5, -1], [4, 7, 1]] as const) {
      for (const [x, y] of [[0.23, 0.61], [0.5, 0.5], [0.77, 0.12]] as const) {
        const [gx, gy] = chladniGrad(x, y, n, m, s)
        const nx = (chladniField(x + eps, y, n, m, s) - chladniField(x - eps, y, n, m, s)) / (2 * eps)
        const ny = (chladniField(x, y + eps, n, m, s) - chladniField(x, y - eps, n, m, s)) / (2 * eps)
        expect(gx).toBeCloseTo(nx, 4)
        expect(gy).toBeCloseTo(ny, 4)
      }
    }
  })
})

describe('buildModeOrder', () => {
  it('is a seeded permutation of all curated pairs (no n=m)', () => {
    const order = buildModeOrder(42)
    expect(order).toHaveLength(16)
    for (const [n, m] of order) expect(n).not.toBe(m)
    // deterministic per seed; different seeds generally differ
    expect(buildModeOrder(42)).toEqual(order)
    expect(buildModeOrder(43)).not.toEqual(order)
  })
})

describe('createChladniState / determinism', () => {
  it('scatters all grains inside the unit square', () => {
    const s = createChladniState({ ...base, grainCount: 500 }, 800, 600)
    for (let i = 0; i < s.xs.length; i++) {
      expect(s.xs[i]).toBeGreaterThanOrEqual(0)
      expect(s.xs[i]).toBeLessThanOrEqual(1)
      expect(s.ys[i]).toBeGreaterThanOrEqual(0)
      expect(s.ys[i]).toBeLessThanOrEqual(1)
    }
  })
  it('produces identical grain motion for the same seed over N steps', () => {
    const cfg = { ...base, grainCount: 300, autoCycle: 'fixed' as const, seed: 777 }
    const a = createChladniState(cfg, 800, 600)
    const b = createChladniState(cfg, 800, 600)
    for (let k = 0; k < 40; k++) { stepGrains(a, 16.67); stepGrains(b, 16.67) }
    expect(Array.from(a.xs)).toEqual(Array.from(b.xs))
    expect(Array.from(a.ys)).toEqual(Array.from(b.ys))
  })
  it('produces different motion for different seeds', () => {
    const mk = (seed: number) => {
      const s = createChladniState({ ...base, grainCount: 300, autoCycle: 'fixed' as const, seed }, 800, 600)
      for (let k = 0; k < 40; k++) stepGrains(s, 16.67)
      return Array.from(s.xs)
    }
    expect(mk(1)).not.toEqual(mk(2))
  })
})

describe('updateChladniState', () => {
  it('applies a visual change live, keeping the same grain arrays', () => {
    const s = createChladniState(base, 800, 600)
    const xref = s.xs
    const ok = updateChladniState(s, { ...base, migrationSpeed: 0.9 })
    expect(ok).toBe(true)
    expect(s.cfg.migrationSpeed).toBe(0.9)
    expect(s.xs).toBe(xref) // no realloc
  })
  it('requests a re-setup (false) when grain count or seed changes', () => {
    const s = createChladniState(base, 800, 600)
    expect(updateChladniState(s, { ...base, grainCount: base.grainCount + 500 })).toBe(false)
    expect(updateChladniState(s, { ...base, seed: base.seed + 1 })).toBe(false)
  })
})

describe('HEADLINE: grains migrate onto the nodal lines', () => {
  it('drives mean |w| down toward ~0 for a fixed mode', () => {
    const s = createChladniState(
      { ...base, grainCount: 1500, autoCycle: 'fixed' as const, modeN: 3, modeM: 4, superposition: '+' },
      900, 900,
    )
    const before = meanAmplitude(s)
    for (let k = 0; k < 900; k++) stepGrains(s, 16.67)
    const after = meanAmplitude(s)

    expect(before).toBeGreaterThan(0.2) // scattered grains start off-node
    expect(after).toBeLessThan(before * 0.4) // strong settling
    expect(after).toBeLessThan(0.15) // close to the nodal lines
  })

  it('never produces NaN and keeps every grain in-bounds while settling', () => {
    const s = createChladniState({ ...base, grainCount: 800, autoCycle: 'cycle' as const }, 700, 700)
    for (let k = 0; k < 600; k++) stepGrains(s, 16.67)
    for (let i = 0; i < s.xs.length; i++) {
      expect(Number.isFinite(s.xs[i])).toBe(true)
      expect(Number.isFinite(s.ys[i])).toBe(true)
      expect(s.xs[i]).toBeGreaterThanOrEqual(0)
      expect(s.xs[i]).toBeLessThanOrEqual(1)
      expect(s.ys[i]).toBeGreaterThanOrEqual(0)
      expect(s.ys[i]).toBeLessThanOrEqual(1)
    }
  })

  it('auto-cycle advances the mode after the dwell time elapses', () => {
    const s = createChladniState({ ...base, autoCycle: 'cycle' as const, dwell: 5, grainCount: 100 }, 600, 600)
    const first: [number, number] = [s.n, s.m]
    // step past the 5s dwell (5000ms / 16.67 ≈ 300 frames)
    for (let k = 0; k < 320; k++) stepGrains(s, 16.67)
    expect([s.n, s.m]).not.toEqual(first)
  })
})
