import { describe, it, expect } from 'vitest'
import { platonicFoldingSchema } from './schema'
import {
  PLATONIC_SOLIDS, buildSolid, buildFoldMesh, computeWorldTransforms, applyAffine,
  pickCycleStart, deriveTreeSeed, sub, dot, length, centroid, easeInOutCubic,
  lerpAngleShortest, type PlatonicSolid,
} from './geometry'

const EXPECTED: Record<PlatonicSolid, { verts: number; faces: number }> = {
  tetrahedron: { verts: 4, faces: 4 },
  cube: { verts: 8, faces: 6 },
  octahedron: { verts: 6, faces: 8 },
  dodecahedron: { verts: 20, faces: 12 },
  icosahedron: { verts: 12, faces: 20 },
}

describe('platonic-folding schema', () => {
  it('parses with valid, in-bounds defaults; every field carries meta', () => {
    const cfg = platonicFoldingSchema.parse({})
    expect(cfg.solid).toBe('cycle')
    expect(cfg.renderMode).toBe('filled')
    expect(cfg.palette.length).toBeGreaterThan(0)
    const shape = platonicFoldingSchema.shape
    for (const key of Object.keys(shape)) {
      expect((shape as Record<string, { meta(): unknown }>)[key].meta()).toBeTruthy()
    }
  })

  it('sliders all declare min+max+step (UX invariant #4)', () => {
    const shape = platonicFoldingSchema.shape as Record<string, { meta(): Record<string, unknown> }>
    for (const key of Object.keys(shape)) {
      const m = shape[key].meta()
      if (m.ui === 'slider') {
        expect(typeof m.min).toBe('number')
        expect(typeof m.max).toBe('number')
        expect(typeof m.step).toBe('number')
      }
    }
  })

  it('the seed is pin-only (randomizeOnFreshLoad)', () => {
    const shape = platonicFoldingSchema.shape as Record<string, { meta(): Record<string, unknown> }>
    expect(shape.seed.meta().randomizeOnFreshLoad).toBe(true)
  })
})

// ─── HEADLINE PROBE: solid topology ────────────────────────────────────────────────
describe('platonic solid topology', () => {
  it.each(PLATONIC_SOLIDS)('%s has the correct vertex/face counts', (kind) => {
    const mesh = buildSolid(kind)
    expect(mesh.verts).toHaveLength(EXPECTED[kind].verts)
    expect(mesh.faces).toHaveLength(EXPECTED[kind].faces)
    expect(mesh.faceNormals).toHaveLength(EXPECTED[kind].faces)
  })

  it.each(PLATONIC_SOLIDS)('%s: every vertex sits on the unit circumsphere', (kind) => {
    const mesh = buildSolid(kind)
    for (const v of mesh.verts) expect(length(v)).toBeCloseTo(1, 6)
  })

  it.each(PLATONIC_SOLIDS)('%s: every face normal points outward (away from center)', (kind) => {
    const mesh = buildSolid(kind)
    mesh.faces.forEach((loop, fi) => {
      const c = centroid(loop.map((i) => mesh.verts[i]))
      expect(dot(mesh.faceNormals[fi], c)).toBeGreaterThan(0)
    })
  })

  it('dodecahedron (icosahedron dual): 12 pentagonal faces, 20 vertices', () => {
    const mesh = buildSolid('dodecahedron')
    expect(mesh.faces.every((f) => f.length === 5)).toBe(true)
    // Every vertex is used by exactly 3 faces (dodecahedron is 3-regular).
    const usage = new Array(mesh.verts.length).fill(0)
    for (const f of mesh.faces) for (const vi of f) usage[vi]++
    expect(usage.every((n) => n === 3)).toBe(true)
  })
})

// ─── HEADLINE PROBE: fold tree — determinism + geometry ────────────────────────────
describe('fold tree', () => {
  it('same seed → identical root, BFS order, and hinge angles', () => {
    const a = buildFoldMesh('icosahedron', 42)
    const b = buildFoldMesh('icosahedron', 42)
    expect(a.root).toBe(b.root)
    expect(a.order).toEqual(b.order)
    expect(a.hingeOf.map((h) => (h ? h.angle : null))).toEqual(b.hingeOf.map((h) => (h ? h.angle : null)))
  })

  it('pickCycleStart and deriveTreeSeed are deterministic pure functions', () => {
    expect(pickCycleStart(7)).toBe(pickCycleStart(7))
    expect(deriveTreeSeed(7, 3)).toBe(deriveTreeSeed(7, 3))
    expect(deriveTreeSeed(7, 3)).not.toBe(deriveTreeSeed(7, 4))
  })

  it('every non-root face has exactly one hinge; the tree spans every face', () => {
    for (const kind of PLATONIC_SOLIDS) {
      const tree = buildFoldMesh(kind, 99)
      expect(tree.order).toHaveLength(tree.mesh.faces.length)
      expect(new Set(tree.order).size).toBe(tree.mesh.faces.length)
      let hinges = 0
      tree.hingeOf.forEach((h, fi) => { if (fi === tree.root) expect(h).toBeNull(); else { expect(h).not.toBeNull(); hinges++ } })
      expect(hinges).toBe(tree.mesh.faces.length - 1)
    }
  })

  it('fold=0 (flat net) is exactly coplanar, for every solid', () => {
    for (const kind of PLATONIC_SOLIDS) {
      const tree = buildFoldMesh(kind, 123)
      const transforms = computeWorldTransforms(tree, 0)
      const rootPts = tree.mesh.faces[tree.root].map((i) => tree.mesh.verts[i])
      const rootCentroid = centroid(rootPts)
      const n = tree.mesh.faceNormals[tree.root]
      for (let fi = 0; fi < tree.mesh.faces.length; fi++) {
        for (const vi of tree.mesh.faces[fi]) {
          const p = applyAffine(transforms[fi], tree.mesh.verts[vi])
          expect(Math.abs(dot(sub(p, rootCentroid), n))).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('cube net folds shut (t=1): 6 faces, every reassembled vertex on the unit sphere', () => {
    const tree = buildFoldMesh('cube', 7)
    expect(tree.mesh.faces).toHaveLength(6)
    expect(tree.mesh.verts).toHaveLength(8)
    const transforms = computeWorldTransforms(tree, 1)
    for (let fi = 0; fi < tree.mesh.faces.length; fi++) {
      for (const vi of tree.mesh.faces[fi]) {
        const p = applyAffine(transforms[fi], tree.mesh.verts[vi])
        expect(length(p)).toBeCloseTo(1, 6)
      }
    }
    // At t=1 every hinge angle is fully "closed" (identity), so a face's assembled
    // position must equal its own TRUE vertex position exactly.
    for (let fi = 0; fi < tree.mesh.faces.length; fi++) {
      for (const vi of tree.mesh.faces[fi]) {
        const p = applyAffine(transforms[fi], tree.mesh.verts[vi])
        const truth = tree.mesh.verts[vi]
        expect(length(sub(p, truth))).toBeLessThan(1e-9)
      }
    }
  })

  it('t interpolates smoothly between the flat net and the assembled solid', () => {
    const tree = buildFoldMesh('tetrahedron', 5)
    const t0 = computeWorldTransforms(tree, 0)
    const tHalf = computeWorldTransforms(tree, 0.5)
    const t1 = computeWorldTransforms(tree, 1)
    // A non-root face's CENTROID at t=0.5 differs from both extremes (an individual
    // vertex could sit exactly on the hinge axis and stay fixed all the way through).
    const child = tree.order[1]
    const verts = tree.mesh.faces[child]
    const centroidAt = (transforms: typeof t0) =>
      centroid(verts.map((vi) => applyAffine(transforms[child], tree.mesh.verts[vi])))
    const p0 = centroidAt(t0)
    const pHalf = centroidAt(tHalf)
    const p1 = centroidAt(t1)
    expect(length(sub(pHalf, p0))).toBeGreaterThan(1e-3)
    expect(length(sub(pHalf, p1))).toBeGreaterThan(1e-3)
  })
})

describe('animation helpers', () => {
  it('easeInOutCubic maps 0→0 and 1→1, monotonically', () => {
    expect(easeInOutCubic(0)).toBeCloseTo(0, 9)
    expect(easeInOutCubic(1)).toBeCloseTo(1, 9)
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.75))
  })

  it('lerpAngleShortest takes the short way around, even after many full turns', () => {
    const from = 40 * Math.PI // wound up after a long spin
    const to = 0.6
    const result = lerpAngleShortest(from, to, 1)
    // Should land exactly on `to` mod 2π.
    const wrapped = ((result - to) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    expect(Math.min(wrapped, Math.PI * 2 - wrapped)).toBeLessThan(1e-9)
  })
})
