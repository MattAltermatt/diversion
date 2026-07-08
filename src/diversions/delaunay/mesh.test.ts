import { describe, it, expect } from 'vitest'
import { Delaunay } from 'd3-delaunay'
import { make2DContext } from '../../test-setup'
import { createMeshState, stepMesh, resizeMesh, buildLUT, inCircumcircle } from './mesh'
import type { DelaunayMeshConfig } from './schema'
import type { RenderContext } from '../../framework/types'
import { mulberry32 } from '../../framework/rng'

const cfg = (over: Partial<DelaunayMeshConfig> = {}): DelaunayMeshConfig => ({
  count: 40, driftSpeed: 0.4, mode: 'filled', edgeThickness: 1.2, showVertices: false, seed: 1,
  palette: ['#0b0f2e', '#1b3a7a', '#2e86ab', '#6fd6d0', '#c9a7eb'], background: '#04050c',
  ...over,
})

describe('inCircumcircle (empty-circumcircle correctness)', () => {
  it('finds the centre point of a square inside its diagonal-split triangle circumcircle', () => {
    // Triangle (0,0)-(10,0)-(10,10): circumcircle centre (5,5) r=5√2/... actually
    // the circle through these three right-angle-at-(10,0) points has the
    // hypotenuse (0,0)-(10,10) as diameter, centre (5,5), r=5√2.
    expect(inCircumcircle(5, 5, 0, 0, 10, 0, 10, 10)).toBe(true) // centre is well inside
    expect(inCircumcircle(100, 100, 0, 0, 10, 0, 10, 10)).toBe(false) // far outside
  })

  it('a point exactly on the circle is not strictly inside', () => {
    // Triangle inscribed in the unit circle at angles 0°, 120°, 240°; test the
    // 4th cardinal point on the same circle (90°) — on the boundary, not inside.
    const a: [number, number] = [1, 0]
    const b: [number, number] = [Math.cos((2 * Math.PI) / 3), Math.sin((2 * Math.PI) / 3)]
    const c: [number, number] = [Math.cos((4 * Math.PI) / 3), Math.sin((4 * Math.PI) / 3)]
    expect(inCircumcircle(0, 1, a[0], a[1], b[0], b[1], c[0], c[1])).toBe(false)
  })

  it('holds for every triangle of a real Delaunay triangulation (no point strictly inside any circumcircle)', () => {
    // An asymmetric point set (no accidental cocircularity) run through the
    // exact library used by the diversion — verifies both the property AND
    // that d3-delaunay's output actually satisfies it.
    const rng = mulberry32(7)
    const N = 24
    const pts = new Float64Array(N * 2)
    for (let i = 0; i < N; i++) { pts[i * 2] = rng() * 300; pts[i * 2 + 1] = rng() * 200 }
    const delaunay = new Delaunay(pts)
    const tris = delaunay.triangles

    for (let t = 0; t < tris.length; t += 3) {
      const ia = tris[t], ib = tris[t + 1], ic = tris[t + 2]
      const ax = pts[ia * 2], ay = pts[ia * 2 + 1]
      const bx = pts[ib * 2], by = pts[ib * 2 + 1]
      const cx = pts[ic * 2], cy = pts[ic * 2 + 1]
      for (let p = 0; p < N; p++) {
        if (p === ia || p === ib || p === ic) continue
        const inside = inCircumcircle(pts[p * 2], pts[p * 2 + 1], ax, ay, bx, by, cx, cy)
        expect(inside, `point ${p} lies inside triangle [${ia},${ib},${ic}]'s circumcircle`).toBe(false)
      }
    }
  })
})

describe('buildLUT', () => {
  it('bakes 256 fill + edge rgb() strings, edge darker than fill', () => {
    const { fill, edge } = buildLUT(['#ff0000', '#00ff00'])
    expect(fill.length).toBe(256)
    expect(edge.length).toBe(256)
    expect(fill[0]).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    expect(edge[0]).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })
})

describe('createMeshState', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect([...createMeshState(cfg(), 800, 600).points]).toEqual([...createMeshState(cfg(), 800, 600).points])
    expect([...createMeshState(cfg({ seed: 1 }), 800, 600).points])
      .not.toEqual([...createMeshState(cfg({ seed: 2 }), 800, 600).points])
  })

  it('every point starts within the canvas bounds', () => {
    const st = createMeshState(cfg({ count: 60 }), 400, 300)
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0); expect(st.points[i]).toBeLessThanOrEqual(400)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0); expect(st.points[i + 1]).toBeLessThanOrEqual(300)
    }
  })
})

describe('stepMesh', () => {
  it('advances motion by dt and keeps every point in-bounds over many frames', () => {
    const st = createMeshState(cfg({ count: 50 }), 400, 300)
    const ctx = make2DContext() as unknown as RenderContext & CanvasRenderingContext2D
    const before = [...st.points]
    for (let k = 0; k < 120; k++) stepMesh(st, ctx, 16)
    expect([...st.points]).not.toEqual(before) // it moved
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0); expect(st.points[i]).toBeLessThanOrEqual(400)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0); expect(st.points[i + 1]).toBeLessThanOrEqual(300)
    }
  })

  it('does not advance when dt is 0 (paused)', () => {
    const st = createMeshState(cfg(), 400, 300)
    const ctx = make2DContext() as unknown as RenderContext & CanvasRenderingContext2D
    const before = [...st.points]
    stepMesh(st, ctx, 0)
    expect([...st.points]).toEqual(before)
  })
})

describe('resizeMesh', () => {
  it('rescales points proportionally and keeps them in-bounds', () => {
    const st = createMeshState(cfg({ count: 30 }), 400, 300)
    resizeMesh(st, 800, 600)
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0); expect(st.points[i]).toBeLessThanOrEqual(800)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0); expect(st.points[i + 1]).toBeLessThanOrEqual(600)
    }
  })
})
