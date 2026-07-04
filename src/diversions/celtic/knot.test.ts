import { describe, it, expect } from 'vitest'
import { celticSchema } from './schema'
import { buildKnot } from './knot'

const cfg = (over: Partial<Record<string, unknown>> = {}) =>
  celticSchema.parse({ ...over })

const W = 800
const H = 600

describe('celtic schema', () => {
  it('parses with valid defaults', () => {
    const c = celticSchema.parse({})
    expect(c.gridSize).toBeGreaterThanOrEqual(6)
    expect(c.wallDensity).toBeGreaterThanOrEqual(0)
    expect(c.band).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(['single', 'rainbow']).toContain(c.colorMode)
  })
})

describe('celtic determinism', () => {
  it('same seed → identical knot', () => {
    const a = buildKnot(cfg({ seed: 7 }), W, H)
    const b = buildKnot(cfg({ seed: 7 }), W, H)
    expect(JSON.stringify(a.bands)).toBe(JSON.stringify(b.bands))
    expect(JSON.stringify(a.xings)).toBe(JSON.stringify(b.xings))
  })

  it('different seed → different knot', () => {
    const a = buildKnot(cfg({ seed: 1, wallDensity: 0.2 }), W, H)
    const b = buildKnot(cfg({ seed: 2, wallDensity: 0.2 }), W, H)
    // Break placement differs → the band decomposition differs.
    expect(JSON.stringify(a.bands)).not.toBe(JSON.stringify(b.bands))
  })
})

describe('celtic geometry validity', () => {
  it('produces no NaN coordinates', () => {
    const g = buildKnot(cfg({ seed: 3, wallDensity: 0.15 }), W, H)
    for (const band of g.bands) {
      for (const p of band.pts) {
        expect(Number.isFinite(p.x)).toBe(true)
        expect(Number.isFinite(p.y)).toBe(true)
      }
    }
    for (const x of g.xings) {
      expect(Number.isFinite(x.x)).toBe(true)
      expect(Number.isFinite(x.y)).toBe(true)
      expect(Number.isFinite(x.ux)).toBe(true)
      expect(Number.isFinite(x.uy)).toBe(true)
    }
  })

  it('bands are closed loops of length ≥ 3', () => {
    const g = buildKnot(cfg({ seed: 5, wallDensity: 0.1 }), W, H)
    expect(g.bands.length).toBeGreaterThan(0)
    for (const band of g.bands) {
      expect(band.pts.length).toBeGreaterThanOrEqual(3)
      expect(band.pts.length).toBe(band.over.length)
      expect(band.pts.length).toBe(band.turn.length)
    }
  })

  it('every crossing is visited by exactly two band-strands (a real X)', () => {
    const g = buildKnot(cfg({ seed: 9, wallDensity: 0.12 }), W, H)
    // Count, per crossing pixel, how many band vertices are flagged as a real X.
    const hits = new Map<string, number>()
    for (const band of g.bands) {
      band.pts.forEach((p, k) => {
        if (band.over[k] !== null) {
          const key = `${Math.round(p.x)},${Math.round(p.y)}`
          hits.set(key, (hits.get(key) ?? 0) + 1)
        }
      })
    }
    // Each real crossing must be a true X: exactly two strands cross there.
    for (const x of g.xings) {
      const key = `${Math.round(x.x)},${Math.round(x.y)}`
      expect(hits.get(key)).toBe(2)
    }
  })
})

describe('celtic interlace parity (HEADLINE)', () => {
  it('over/under alternates along every band and is a consistent checkerboard', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = buildKnot(cfg({ seed, wallDensity: 0.14 }), W, H)

      // (1) Along each band, consecutive real crossings must ALTERNATE over/under
      //     — the essence of a woven interlace (never over,over or under,under).
      for (const band of g.bands) {
        const n = band.over.length
        // Walk the closed loop; compare each real-X vertex to the previous real-X.
        let prev: boolean | null = null
        // Start from a turn (or index 0) so we compare within straight runs; but
        // since turns carry `null`, adjacent non-null entries are always within a
        // straight run and must differ.
        for (let k = 0; k < n; k++) {
          const cur = band.over[k]
          if (cur === null) {
            prev = null
            continue
          }
          if (prev !== null) {
            expect(cur).not.toBe(prev) // no two adjacent crossings both over/under
          }
          prev = cur
        }
      }

      // (2) At each crossing the two strands are complementary: exactly one over,
      //     one under — the global checkerboard is self-consistent.
      const perCrossing = new Map<string, boolean[]>()
      for (const band of g.bands) {
        band.pts.forEach((p, k) => {
          if (band.over[k] !== null) {
            const key = `${Math.round(p.x)},${Math.round(p.y)}`
            const arr = perCrossing.get(key) ?? []
            arr.push(band.over[k] as boolean)
            perCrossing.set(key, arr)
          }
        })
      }
      for (const [, arr] of perCrossing) {
        expect(arr.length).toBe(2)
        expect(arr[0]).not.toBe(arr[1]) // one over, one under
      }

      // (3) The over-strand at every crossing follows i-parity (the checkerboard
      //     rule the geometry claims), and diagonal neighbours differ.
      for (const x of g.xings) {
        expect(x.overFwd).toBe((x.i & 1) === 0)
      }
    }
  })
})
