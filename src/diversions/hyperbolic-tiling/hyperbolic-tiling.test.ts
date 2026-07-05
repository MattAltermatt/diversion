import { describe, it, expect } from 'vitest'
import {
  isValidPQ, resolvePQ, centerRadius, centralPolygon,
  geodesicCircle, invert, reflectLine, reflectAcrossGeodesic, arcSpan,
  generateTiling, moebiusOffset, applyMoebius,
  type Pt,
} from './tiling'

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('isValidPQ / resolvePQ', () => {
  it('accepts classic hyperbolic pairs', () => {
    for (const [p, q] of [[7, 3], [5, 4], [4, 5], [6, 4], [8, 3], [3, 7]] as const) {
      expect(isValidPQ(p, q)).toBe(true)
    }
  })
  it('rejects flat/spherical pairs ((p-2)(q-2) <= 4)', () => {
    for (const [p, q] of [[3, 3], [4, 4], [3, 6], [6, 3], [3, 4], [4, 3]] as const) {
      expect(isValidPQ(p, q)).toBe(false)
    }
  })
  it('resolvePQ leaves an already-valid pair untouched', () => {
    expect(resolvePQ(7, 3)).toEqual([7, 3])
    expect(resolvePQ(5, 4)).toEqual([5, 4])
  })
  it('resolvePQ degrades an invalid pair to a nearby valid one, never crashing', () => {
    for (const [p, q] of [[3, 3], [4, 4], [3, 4], [4, 3], [3, 6], [0, 0], [-2, 100]] as const) {
      const [rp, rq] = resolvePQ(p, q)
      expect(isValidPQ(rp, rq)).toBe(true)
    }
  })
  it('resolvePQ is idempotent on its own output', () => {
    const [p, q] = resolvePQ(4, 4)
    expect(resolvePQ(p, q)).toEqual([p, q])
  })
})

describe('centerRadius / centralPolygon', () => {
  it('returns a radius strictly inside the unit disk for valid pairs', () => {
    for (const [p, q] of [[7, 3], [5, 4], [4, 5], [6, 4], [8, 3], [3, 7], [12, 12]] as const) {
      const r = centerRadius(p, q)
      expect(r).toBeGreaterThan(0)
      expect(r).toBeLessThan(1)
    }
  })
  it('yields exactly p vertices, all at the same radius from the origin', () => {
    const verts = centralPolygon(7, 3)
    expect(verts.length).toBe(7)
    const r0 = Math.hypot(verts[0][0], verts[0][1])
    for (const v of verts) expect(Math.hypot(v[0], v[1])).toBeCloseTo(r0, 9)
  })
  it('is deterministic', () => {
    expect(centralPolygon(5, 4)).toEqual(centralPolygon(5, 4))
  })
})

describe('circle inversion is an involution', () => {
  it('inverting twice returns the original point', () => {
    const c: Pt = [1.6, -0.3]
    const r = 1.1
    for (const p of [[0.1, 0.2], [-0.4, 0.05], [0.3, -0.35]] as Pt[]) {
      const once = invert(p, c, r)
      const twice = invert(once, c, r)
      expect(twice[0]).toBeCloseTo(p[0], 9)
      expect(twice[1]).toBeCloseTo(p[1], 9)
    }
  })
})

describe('reflectLine is an involution', () => {
  it('reflecting twice returns the original point', () => {
    const theta = 0.7
    const p: Pt = [0.3, -0.2]
    const once = reflectLine(p, theta)
    const twice = reflectLine(once, theta)
    expect(twice[0]).toBeCloseTo(p[0], 9)
    expect(twice[1]).toBeCloseTo(p[1], 9)
  })
})

describe('reflectAcrossGeodesic is an involution (through a polygon edge)', () => {
  it('reflecting a vertex across its own edge twice returns it', () => {
    const verts = centralPolygon(7, 3)
    const [a, b] = verts
    for (const v of verts) {
      const once = reflectAcrossGeodesic(v, a, b)
      const twice = reflectAcrossGeodesic(once, a, b)
      expect(twice[0]).toBeCloseTo(v[0], 8)
      expect(twice[1]).toBeCloseTo(v[1], 8)
    }
  })
})

describe('geodesicCircle', () => {
  it('is orthogonal to the unit circle: |c|^2 - r^2 = 1', () => {
    const cases: [Pt, Pt][] = [
      [[0.3, 0.1], [0.1, -0.35]],
      [[0.5, 0.2], [-0.2, 0.4]],
      [[0.05, 0.6], [0.3, -0.1]],
    ]
    for (const [a, b] of cases) {
      const g = geodesicCircle(a, b)
      expect(g).not.toBeNull()
      if (!g) continue
      const lhs = g.c[0] * g.c[0] + g.c[1] * g.c[1] - g.r * g.r
      expect(lhs).toBeCloseTo(1, 6)
    }
  })
  it('passes through both endpoints', () => {
    const a: Pt = [0.4, 0.1]
    const b: Pt = [-0.1, 0.35]
    const g = geodesicCircle(a, b)
    expect(g).not.toBeNull()
    if (!g) return
    expect(dist(a, g.c)).toBeCloseTo(g.r, 6)
    expect(dist(b, g.c)).toBeCloseTo(g.r, 6)
  })
  it('degenerates to null (a diameter) when a, b and the origin are collinear', () => {
    const a: Pt = [0.5, 0.0]
    const b: Pt = [-0.3, 0.0]
    expect(geodesicCircle(a, b)).toBeNull()
  })
})

describe('arcSpan', () => {
  it('picks a sweep whose midpoint sample lies inside the unit disk', () => {
    const a: Pt = [0.4, 0.1]
    const b: Pt = [-0.1, 0.35]
    const g = geodesicCircle(a, b)
    expect(g).not.toBeNull()
    if (!g) return
    const { start, end, ccw } = arcSpan(a, b, g.c, g.r)
    // Sample halfway along the *chosen* sweep direction and confirm it lands inside the disk.
    const sweep = ccw ? -1 : 1
    let d = end - start
    // normalize into the chosen rotational direction
    if (sweep > 0 && d < 0) d += Math.PI * 2
    if (sweep < 0 && d > 0) d -= Math.PI * 2
    const sampleAngle = start + d / 2
    const sx = g.c[0] + g.r * Math.cos(sampleAngle)
    const sy = g.c[1] + g.r * Math.sin(sampleAngle)
    expect(sx * sx + sy * sy).toBeLessThanOrEqual(1 + 1e-6)
  })
})

describe('generateTiling', () => {
  it('the central polygon (ring 0) has exactly p vertices', () => {
    const tiles = generateTiling(7, 3, 1)
    expect(tiles.length).toBe(1)
    expect(tiles[0].depth).toBe(0)
    expect(tiles[0].vertices.length).toBe(7)
  })
  it('grows ring by ring and stays deduplicated', () => {
    const t1 = generateTiling(7, 3, 1)
    const t2 = generateTiling(7, 3, 2)
    const t3 = generateTiling(7, 3, 3)
    expect(t2.length).toBeGreaterThan(t1.length)
    expect(t3.length).toBeGreaterThan(t2.length)
    for (const tiles of [t1, t2, t3]) {
      const keys = new Set(tiles.map((t) => {
        let sx = 0, sy = 0
        for (const [x, y] of t.vertices) { sx += x; sy += y }
        return `${(sx / t.vertices.length).toFixed(6)},${(sy / t.vertices.length).toFixed(6)}`
      }))
      expect(keys.size).toBe(tiles.length) // no duplicates
    }
  })
  it('is bounded even for a fast-branching {p,q} at high depth', () => {
    const tiles = generateTiling(3, 7, 7)
    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.length).toBeLessThanOrEqual(2000)
  })
  it('every vertex stays finite and inside the unit disk', () => {
    const tiles = generateTiling(6, 4, 4)
    for (const tile of tiles) {
      for (const [x, y] of tile.vertices) {
        expect(Number.isFinite(x)).toBe(true)
        expect(Number.isFinite(y)).toBe(true)
        expect(x * x + y * y).toBeLessThan(1 + 1e-6)
      }
    }
  })
  it('degrades gracefully for an invalid {p,q} instead of throwing or returning nothing', () => {
    expect(() => generateTiling(4, 4, 3)).not.toThrow()
    const tiles = generateTiling(4, 4, 3)
    expect(tiles.length).toBeGreaterThan(0)
  })
  it('is deterministic', () => {
    const a = generateTiling(5, 4, 3)
    const b = generateTiling(5, 4, 3)
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].vertices).toEqual(b[i].vertices)
      expect(a[i].depth).toBe(b[i].depth)
    }
  })
})

describe('moebiusOffset / applyMoebius', () => {
  it('offset is the identity (0,0) at t=0 or driftSpeed=0', () => {
    expect(moebiusOffset(0, 1)).toEqual([0, 0])
    expect(moebiusOffset(5, 0)).toEqual([0, 0])
  })
  it('applying the identity offset leaves a point unchanged', () => {
    const p: Pt = [0.2, -0.4]
    const out = applyMoebius(p, [0, 0])
    expect(out[0]).toBeCloseTo(p[0], 9)
    expect(out[1]).toBeCloseTo(p[1], 9)
  })
  it('never pushes a disk point outside the unit disk (it is a disk automorphism)', () => {
    const p: Pt = [0.3, 0.2]
    for (const t of [1, 5, 20, 100]) {
      const a = moebiusOffset(t, 1)
      expect(a[0] * a[0] + a[1] * a[1]).toBeLessThan(1) // the offset itself stays inside
      const out = applyMoebius(p, a)
      expect(out[0] * out[0] + out[1] * out[1]).toBeLessThan(1 + 1e-9)
    }
  })
  it('is deterministic in time', () => {
    expect(moebiusOffset(12.3, 0.5)).toEqual(moebiusOffset(12.3, 0.5))
  })
})
