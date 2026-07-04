import { describe, it, expect } from 'vitest'
import { hypercubeSchema } from './schema'
import {
  buildPolytope, rotate, project, buildSeedState, type PlaneRotation,
} from './geometry'

const defaults = () => hypercubeSchema.parse({})

// 4-D norm of a vector.
const norm = (v: number[]) => Math.hypot(...v)

describe('hypercube schema', () => {
  it('parses with valid, in-bounds defaults', () => {
    const cfg = defaults()
    expect(cfg.polytope).toBe('tesseract')
    expect(cfg.proj4Distance).toBeGreaterThan(cfg.proj4Distance - 1) // finite
    expect(cfg.speedXW).toBeGreaterThanOrEqual(0)
    expect(cfg.colorMode).toBe('depth')
    // Every field must carry a default+meta (the codec omits defaults from share URLs).
    const shape = hypercubeSchema.shape
    for (const key of Object.keys(shape)) {
      expect((shape as Record<string, { meta(): unknown }>)[key].meta()).toBeTruthy()
    }
  })

  it('sliders all declare min+max+step (UX invariant #4)', () => {
    const shape = hypercubeSchema.shape as Record<string, { meta(): Record<string, unknown> }>
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
    const shape = hypercubeSchema.shape as Record<string, { meta(): Record<string, unknown> }>
    expect(shape.seed.meta().randomizeOnFreshLoad).toBe(true)
  })
})

// ─── HEADLINE PROBE: the polytope topology must be exactly right ─────────────────────
describe('hypercube topology', () => {
  it('tesseract: 16 vertices, 32 edges, each edge differs in exactly ONE coordinate', () => {
    const { verts, edges, dim } = buildPolytope('tesseract')
    expect(dim).toBe(4)
    expect(verts).toHaveLength(16)
    expect(edges).toHaveLength(32)
    // Every vertex is a (±1)^4 corner, all distinct.
    for (const v of verts) {
      expect(v).toHaveLength(4)
      for (const c of v) expect(Math.abs(c)).toBe(1)
    }
    expect(new Set(verts.map((v) => v.join(','))).size).toBe(16)
    // Every edge connects two corners differing in exactly one coordinate.
    for (const [a, b] of edges) {
      let diffs = 0
      for (let c = 0; c < 4; c++) if (verts[a][c] !== verts[b][c]) diffs++
      expect(diffs).toBe(1)
    }
    // Each of the 16 corners has degree 4 (32 edges × 2 / 16).
    const deg = new Array(16).fill(0)
    for (const [a, b] of edges) { deg[a]++; deg[b]++ }
    expect(deg.every((d) => d === 4)).toBe(true)
  })

  it('16-cell: 8 vertices, 24 edges, every pair joined except antipodes', () => {
    const { verts, edges, dim } = buildPolytope('sixteen-cell')
    expect(dim).toBe(4)
    expect(verts).toHaveLength(8)
    expect(edges).toHaveLength(24)
    // Each vertex is a ±unit axis vector (one nonzero coord of magnitude 1).
    for (const v of verts) {
      expect(v.filter((c) => c !== 0)).toHaveLength(1)
      expect(norm(v)).toBeCloseTo(1, 12)
    }
    // No edge joins a vertex to its own antipode.
    for (const [a, b] of edges) {
      const anti = verts[a].every((c, i) => c === -verts[b][i])
      expect(anti).toBe(false)
    }
  })

  it('penteract: 32 vertices, 80 edges, each edge differs in exactly one coordinate', () => {
    const { verts, edges, dim } = buildPolytope('penteract')
    expect(dim).toBe(5)
    expect(verts).toHaveLength(32)
    expect(edges).toHaveLength(80) // 5 · 2^4
    for (const [a, b] of edges) {
      let diffs = 0
      for (let c = 0; c < 5; c++) if (verts[a][c] !== verts[b][c]) diffs++
      expect(diffs).toBe(1)
    }
  })
})

// ─── HEADLINE PROBE: rotation preserves norm; projection is finite + non-degenerate ──
describe('hypercube rotation + projection', () => {
  const rots: PlaneRotation[] = [
    { i: 0, j: 3, angle: 0.7 }, // x–w
    { i: 1, j: 3, angle: 1.3 }, // y–w
    { i: 0, j: 2, angle: 0.4 }, // x–z
  ]

  it('4-D rotation preserves every vertex norm (distance-preserving)', () => {
    const { verts } = buildPolytope('tesseract')
    for (const v of verts) {
      const before = norm(v)
      const after = norm(rotate(v, rots))
      expect(after).toBeCloseTo(before, 12)
    }
  })

  it('rotation does not mutate the input vertex', () => {
    const v = [1, -1, 1, -1]
    const copy = v.slice()
    rotate(v, rots)
    expect(v).toEqual(copy)
  })

  it('projections are all finite and NOT degenerate (no NaN, real 2-D extent)', () => {
    const { verts } = buildPolytope('tesseract')
    const cfg = defaults()
    const pts = verts.map((v) => project(rotate(v, rots), cfg.proj4Distance, cfg.proj3Distance))
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
      expect(Number.isFinite(p.depth)).toBe(true)
    }
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    expect(w).toBeGreaterThan(0.05)
    expect(h).toBeGreaterThan(0.05)
    // Depth genuinely varies → the wireframe reads as 3-D/4-D, not flat.
    const ds = pts.map((p) => p.depth)
    expect(Math.max(...ds) - Math.min(...ds)).toBeGreaterThan(0)
  })

  it('nearer (larger depth) projects to a larger radius than farther, same vertex path', () => {
    // Rotate a single vertex through the x–w plane; at w=+ it should project bigger
    // (nearer) than at w=− — the inside-out swelling.
    const v = [1, 1, 1, 1]
    const cfg = defaults()
    const atPlus = project(rotate(v, [{ i: 0, j: 3, angle: 0 }]), cfg.proj4Distance, cfg.proj3Distance)
    // Rotate x–w by π so the w-heavy corner flips sign.
    const atMinus = project(rotate(v, [{ i: 0, j: 3, angle: Math.PI }]), cfg.proj4Distance, cfg.proj3Distance)
    expect(Math.hypot(atPlus.x, atPlus.y)).not.toBeCloseTo(Math.hypot(atMinus.x, atMinus.y), 3)
  })
})

// ─── Determinism: same seed → same orientation ──────────────────────────────────────
describe('hypercube determinism', () => {
  it('same seed → identical seed state', () => {
    const a = buildSeedState(4104, 4)
    const b = buildSeedState(4104, 4)
    expect(a).toEqual(b)
  })

  it('different seed → different seed state', () => {
    const a = buildSeedState(4104, 4)
    const b = buildSeedState(4105, 4)
    expect(a).not.toEqual(b)
  })

  it('same seed → identical projected vertices at a given time t', () => {
    const cfg = defaults()
    const mesh = buildPolytope(cfg.polytope)
    const t = 3.2 // seconds

    const projectAt = (seed: number) => {
      const ss = buildSeedState(seed, 4)
      const rots: PlaneRotation[] = [
        { i: 0, j: 3, angle: ss.angles[0] + cfg.speedXW * ss.mul[0] * t },
        { i: 1, j: 3, angle: ss.angles[1] + cfg.speedYW * ss.mul[1] * t },
        { i: 2, j: 3, angle: ss.angles[2] + cfg.speedZW * ss.mul[2] * t },
        { i: 0, j: 2, angle: ss.angles[3] + cfg.spin3D * ss.mul[3] * t },
      ]
      return mesh.verts.map((v) => project(rotate(v, rots), cfg.proj4Distance, cfg.proj3Distance))
    }

    expect(projectAt(cfg.seed)).toEqual(projectAt(cfg.seed))
    expect(projectAt(cfg.seed)).not.toEqual(projectAt(cfg.seed + 1))
  })
})
