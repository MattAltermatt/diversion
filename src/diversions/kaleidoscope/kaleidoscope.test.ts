import { describe, it, expect } from 'vitest'
import { kaleidoscopeSchema } from './schema'
import { buildShapes, shapePose, sectorMatrix, foldPoint, PALETTES } from './kaleidoscope'

const base = kaleidoscopeSchema.parse({})

describe('schema', () => {
  it('parses with valid defaults', () => {
    expect(base.symmetry).toBe(6)
    expect(base.sourceShapes).toBe(10)
    expect(base.shapeStyle).toBe('mixed')
    expect(base.palette).toBe('jewel')
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(base.outline).toBe(true)
  })

  it('every palette name resolves to a non-empty colour list', () => {
    for (const p of ['jewel', 'sunset', 'ocean', 'forest', 'candy', 'fire'] as const) {
      expect(PALETTES[p].length).toBeGreaterThan(0)
      for (const c of PALETTES[p]) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

describe('buildShapes determinism', () => {
  it('same seed → identical initial source layout', () => {
    const a = buildShapes({ ...base, seed: 1234 })
    const b = buildShapes({ ...base, seed: 1234 })
    expect(a).toEqual(b)
  })

  it('different seed → different layout', () => {
    const a = buildShapes({ ...base, seed: 1 })
    const b = buildShapes({ ...base, seed: 2 })
    expect(a).not.toEqual(b)
  })

  it('honours sourceShapes count and keeps colour indices in palette range', () => {
    const cfg = { ...base, sourceShapes: 15 }
    const shapes = buildShapes(cfg)
    expect(shapes).toHaveLength(15)
    const n = PALETTES[cfg.palette].length
    for (const s of shapes) {
      expect(s.ci).toBeGreaterThanOrEqual(0)
      expect(s.ci).toBeLessThan(n)
    }
  })

  it('a forced style resolves every shape to one primitive; mixed spreads them', () => {
    const shards = buildShapes({ ...base, shapeStyle: 'shards', sourceShapes: 12 })
    expect(shards.every((s) => s.type === 'shard')).toBe(true)
    const mixed = buildShapes({ ...base, shapeStyle: 'mixed', sourceShapes: 20, seed: 99 })
    expect(new Set(mixed.map((s) => s.type)).size).toBeGreaterThan(1)
  })
})

describe('shapePose', () => {
  it('freezes the source when driftSpeed = 0 (static kaleidoscope)', () => {
    const s = buildShapes({ ...base, seed: 5 })[0]
    const a = shapePose(s, 0, 0, 0, 500, 0.05)
    const b = shapePose(s, 100, 0, 0, 500, 0.05)
    expect(b.x).toBeCloseTo(a.x, 10)
    expect(b.y).toBeCloseTo(a.y, 10)
    expect(b.rot).toBeCloseTo(a.rot, 10) // tumbleSpeed 0 too → no self-spin
  })

  it('produces finite coordinates that move under drift', () => {
    const s = buildShapes({ ...base, seed: 5 })[0]
    const a = shapePose(s, 0, 0.5, 0.5, 500, 0.05)
    const b = shapePose(s, 20, 0.5, 0.5, 500, 0.05)
    for (const v of [a.x, a.y, a.rot, b.x, b.y, b.rot]) expect(Number.isFinite(v)).toBe(true)
    expect(a.x !== b.x || a.y !== b.y).toBe(true)
  })
})

describe('sectorMatrix', () => {
  it('sector 0 is the identity (the master wedge itself)', () => {
    const [a, b, c, d] = sectorMatrix(0, 6)
    expect(a).toBeCloseTo(1, 12)
    expect(b).toBeCloseTo(0, 12)
    expect(c).toBeCloseTo(0, 12)
    expect(d).toBeCloseTo(1, 12)
  })

  it('even sectors are rotations (det = +1), odd sectors are mirrors (det = -1)', () => {
    const N = 6
    for (let i = 0; i < 2 * N; i++) {
      const [a, b, c, d] = sectorMatrix(i, N)
      const det = a * d - b * c
      expect(det).toBeCloseTo(i % 2 === 0 ? 1 : -1, 10)
      // orthonormal columns (length-preserving) → no scale distortion
      expect(a * a + b * b).toBeCloseTo(1, 10)
      expect(c * c + d * d).toBeCloseTo(1, 10)
    }
  })
})

// ── HEADLINE PROBE: the fold gives perfect N-fold dihedral symmetry ─────────
describe('foldPoint (kaleidoscope symmetry)', () => {
  const px = 130, py = 37

  for (const N of [3, 6, 12]) {
    it(`maps a source point to exactly 2N=${2 * N} mirrored images with no NaN`, () => {
      const imgs = foldPoint(px, py, N)
      expect(imgs).toHaveLength(2 * N)
      for (const p of imgs) {
        expect(Number.isNaN(p.x)).toBe(false)
        expect(Number.isNaN(p.y)).toBe(false)
      }
    })

    it(`every image sits on one circle (rotational symmetry), N=${N}`, () => {
      const r0 = Math.hypot(px, py)
      for (const p of foldPoint(px, py, N)) {
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(r0, 8)
      }
    })

    it(`the image set is mirror-invariant across the x-axis, N=${N}`, () => {
      const imgs = foldPoint(px, py, N)
      // The angle-0 wedge edge is a mirror line, so reflecting the whole set
      // (y → -y) must reproduce the same set → true dihedral symmetry.
      const has = (tx: number, ty: number) =>
        imgs.some((q) => Math.hypot(q.x - tx, q.y - ty) < 1e-6)
      for (const p of imgs) expect(has(p.x, -p.y)).toBe(true)
    })

    it(`the image set is closed under rotation by 2θ (N-fold rotational order), N=${N}`, () => {
      const theta = Math.PI / N, cos = Math.cos(2 * theta), sin = Math.sin(2 * theta)
      const imgs = foldPoint(px, py, N)
      const has = (tx: number, ty: number) =>
        imgs.some((q) => Math.hypot(q.x - tx, q.y - ty) < 1e-6)
      // rotating every image by one full wedge-pair returns the same set
      for (const p of imgs) expect(has(p.x * cos - p.y * sin, p.x * sin + p.y * cos)).toBe(true)
    })
  }
})
