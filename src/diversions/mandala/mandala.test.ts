import { describe, it, expect } from 'vitest'
import { mandalaSchema } from './schema'
import { buildMandala, buildLut, ringReveal, REVEAL_SPAN } from './mandala'
import mandala from './index'

const cfg = (over: Partial<ReturnType<typeof mandalaSchema.parse>> = {}) =>
  ({ ...mandalaSchema.parse({}), ...over })

const TWO_PI = Math.PI * 2

// All the placement angles of a ring, wrapped into [0, 2π).
function ringAngles(angle0: number, count: number): number[] {
  const step = TWO_PI / count
  const out: number[] = []
  for (let j = 0; j < count; j++) out.push(((angle0 + j * step) % TWO_PI + TWO_PI) % TWO_PI)
  return out.sort((a, b) => a - b)
}

// Smallest angular gap between two wrapped angles (handles the 0 ↔ 2π seam).
function circDist(a: number, b: number): number {
  const d = Math.abs(a - b) % TWO_PI
  return Math.min(d, TWO_PI - d)
}

// True if every element of `b` has a circular partner in `a` (order- and wrap-free).
function sameAngleSet(a: number[], b: number[], eps = 1e-9): boolean {
  if (a.length !== b.length) return false
  return b.every((v) => a.some((w) => circDist(v, w) < eps))
}

describe('mandala schema', () => {
  it('parses with valid defaults', () => {
    const c = mandalaSchema.parse({})
    expect(c.symmetry).toBe(12)
    expect(c.ringCount).toBeGreaterThanOrEqual(4)
    expect(c.palette.length).toBeGreaterThanOrEqual(3)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    // seed is randomizeOnFreshLoad (pin-only)
    expect(mandalaSchema.shape.seed.meta()?.randomizeOnFreshLoad).toBe(true)
  })

  it('rejects out-of-range symmetry', () => {
    expect(mandalaSchema.safeParse({ symmetry: 3 }).success).toBe(false)
    expect(mandalaSchema.safeParse({ symmetry: 40 }).success).toBe(false)
  })
})

describe('determinism', () => {
  it('same seed → identical geometry', () => {
    const a = buildMandala(cfg({ seed: 42 }))
    const b = buildMandala(cfg({ seed: 42 }))
    expect(JSON.stringify(a.rings)).toBe(JSON.stringify(b.rings))
  })

  it('different seed → different geometry', () => {
    const a = buildMandala(cfg({ seed: 1 }))
    const b = buildMandala(cfg({ seed: 2 }))
    expect(JSON.stringify(a.rings)).not.toBe(JSON.stringify(b.rings))
  })
})

describe('HEADLINE — exact N-fold rotational symmetry', () => {
  // Sweep a range of symmetries; every ring's motif set must map onto itself under
  // rotation by 2π/N (that is what makes the composition N-fold symmetric).
  for (const N of [6, 7, 12, 13, 18, 24]) {
    it(`N=${N}: every ring is invariant under rotation by 2π/${N}`, () => {
      const m = buildMandala(cfg({ symmetry: N, ringCount: 16, seed: N * 7 + 1 }))
      expect(m.symmetry).toBe(N)
      for (const ring of m.rings) {
        // Motif count is a multiple of the fold symmetry.
        expect(ring.count % N).toBe(0)
        const base = ringAngles(ring.angle0, ring.count)
        const rotated = base.map((a) => (a + TWO_PI / N) % TWO_PI)
        expect(sameAngleSet(base, rotated)).toBe(true)
      }
    })
  }

  it('motif angles are evenly spaced', () => {
    const m = buildMandala(cfg({ symmetry: 12, ringCount: 8 }))
    for (const ring of m.rings) {
      const angs = ringAngles(ring.angle0, ring.count)
      const step = TWO_PI / ring.count
      for (let i = 1; i < angs.length; i++) {
        expect(Math.abs((angs[i] - angs[i - 1]) - step)).toBeLessThan(1e-6)
      }
    }
  })
})

describe('well-formed geometry', () => {
  it('rings sit within the unit radius and carry finite, positive size', () => {
    const m = buildMandala(cfg({ ringCount: 16, symmetry: 20 }))
    expect(m.rings.length).toBe(16)
    for (const ring of m.rings) {
      expect(Number.isFinite(ring.radius)).toBe(true)
      expect(ring.radius).toBeGreaterThan(0)
      expect(ring.radius).toBeLessThanOrEqual(1)
      expect(ring.size).toBeGreaterThan(0)
      expect(Number.isFinite(ring.angle0)).toBe(true)
      expect(ring.colorIdx).toBeGreaterThanOrEqual(0)
    }
    expect(Number.isFinite(m.doneTime)).toBe(true)
  })

  it('reveal fraction ramps 0 → 1 and clamps', () => {
    expect(ringReveal(2, 0)).toBe(0)          // ring 2 not started at g=0
    expect(ringReveal(0, -1)).toBe(0)         // clamps below 0
    expect(ringReveal(0, REVEAL_SPAN)).toBe(1) // fully revealed after its span
    expect(ringReveal(0, 100)).toBe(1)        // clamps above 1
    const mid = ringReveal(0, REVEAL_SPAN / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('palette LUT parses hex to rgb', () => {
    const lut = buildLut(['#ff8800', '#0a0812'])
    expect(lut[0]).toEqual({ r: 255, g: 136, b: 0 })
    expect(lut[1]).toEqual({ r: 10, g: 8, b: 18 })
  })
})

describe('live update re-bakes the accumulation buffer (#270)', () => {
  // The baked buffer holds already-drawn rings using cfg.mirror / cfg.lineWidth (only
  // consumed at bake time via drawRing). A live edit to either must reset the buffer
  // (bakedCount → 0) so the whole mandala re-bakes with the new value — otherwise the
  // change is silently ignored until a structural rebuild.
  const fakeCtx = { canvas: { width: 800 } } as unknown as CanvasRenderingContext2D
  const mkState = () => {
    const s = mandala.setup(fakeCtx, cfg(), { width: 800, height: 600 })
    s.bakedCount = 5 // pretend some rings are already baked in
    return s
  }

  it('changing mirror re-bakes (bakedCount reset to 0, update returns true)', () => {
    const s = mkState()
    const applied = mandala.update!(s, cfg({ mirror: false }), { width: 800, height: 600 })
    expect(applied).toBe(true)
    expect(s.bakedCount).toBe(0)
  })

  it('changing lineWidth re-bakes (bakedCount reset to 0)', () => {
    const s = mkState()
    mandala.update!(s, cfg({ lineWidth: 5 }), { width: 800, height: 600 })
    expect(s.bakedCount).toBe(0)
  })

  it('an unrelated no-op edit does NOT reset the buffer', () => {
    const s = mkState()
    mandala.update!(s, cfg(), { width: 800, height: 600 })
    expect(s.bakedCount).toBe(5) // holdSeconds/mirror/lineWidth unchanged → no re-bake
  })
})
