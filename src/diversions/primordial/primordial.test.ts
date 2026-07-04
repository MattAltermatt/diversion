import { describe, it, expect } from 'vitest'
import { primordialSchema, toPPSConfig } from './schema'
import { createSystem, stepSystem, meanNeighbors, WORLD, type PPSystem } from './pps'

const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// (a) schema parses + valid defaults
// ---------------------------------------------------------------------------
describe('schema', () => {
  it('parses with defaults and every field carries a default', () => {
    const cfg = primordialSchema.parse({})
    expect(cfg.particleCount).toBe(1600)
    expect(cfg.radius).toBe(3)
    expect(cfg.alpha).toBe(180)
    expect(cfg.beta).toBe(17)
    expect(cfg.stepSize).toBeCloseTo(0.13)
    expect(cfg.colors.length).toBeGreaterThanOrEqual(2)
    expect(cfg.seed).toBe(1337)
  })

  it('resolves the classic constants into sim-space', () => {
    const p = toPPSConfig(primordialSchema.parse({}))
    expect(p.radius).toBeCloseTo(0.03 * WORLD) // 3% of the world
    expect(p.alpha).toBeCloseTo(Math.PI) // 180°
    expect(p.beta).toBeCloseTo(17 * DEG)
    expect(p.velocity).toBeCloseTo(0.13 * 0.03 * WORLD) // stepSize · radius
  })

  it('every field has ui + label meta', () => {
    for (const [name, field] of Object.entries(primordialSchema.shape)) {
      const meta = (field as { meta: () => Record<string, unknown> }).meta()
      expect(meta, name).toBeDefined()
      expect(meta.ui, name).toBeDefined()
      expect(meta.label, name).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// (b) determinism — same seed → identical trajectory; different seed → diverges
// ---------------------------------------------------------------------------
describe('determinism', () => {
  const mk = (seed: number) =>
    createSystem({ particleCount: 300, radius: 30, alpha: Math.PI, beta: 17 * DEG, velocity: 3.9, seed })

  it('same seed reproduces identical positions after N steps', () => {
    const a = mk(42), b = mk(42)
    for (let k = 0; k < 120; k++) { stepSystem(a); stepSystem(b) }
    for (let i = 0; i < a.n; i++) {
      expect(a.x[i]).toBe(b.x[i])
      expect(a.y[i]).toBe(b.y[i])
      expect(a.heading[i]).toBe(b.heading[i])
    }
  })

  it('different seed diverges', () => {
    const a = mk(1), b = mk(2)
    for (let k = 0; k < 120; k++) { stepSystem(a); stepSystem(b) }
    let differ = 0
    for (let i = 0; i < a.n; i++) if (a.x[i] !== b.x[i]) differ++
    expect(differ).toBeGreaterThan(a.n / 2)
  })
})

// ---------------------------------------------------------------------------
// (c) HEADLINE probe — the motion law, the toroidal L/R split, and emergence
// ---------------------------------------------------------------------------

/** Build a system with hand-placed particles (bypassing the seeded init). */
function handSystem(
  xs: number[], ys: number[], headings: number[], radius: number,
  alpha: number, beta: number,
): PPSystem {
  const s = createSystem({ particleCount: xs.length, radius, alpha, beta, velocity: 0, seed: 1 })
  for (let i = 0; i < xs.length; i++) { s.x[i] = xs[i]; s.y[i] = ys[i]; s.heading[i] = headings[i] }
  return s
}

describe('headline: the one motion law', () => {
  it('Δφ = α + β·N·sign(R − L) — turn magnitude & direction are exact', () => {
    // Particle 0 heads +x (heading 0). Two neighbours placed BELOW it (dy > 0).
    // With heading (1,0): cross = hx·dy − hy·dx = dy > 0 → both count as LEFT.
    // So L = 2, R = 0, N = 2, sign(R − L) = −1.
    const alpha = Math.PI, beta = 17 * DEG
    const s = handSystem(
      [500, 490, 510], // x
      [500, 540, 545], // y  (neighbours are below → left of a +x heading)
      [0, 0, 0],
      60, alpha, beta,
    )
    stepSystem(s)
    expect(s.neighbors[0]).toBe(2) // both neighbours sensed
    const expectedDphi = alpha + beta * 2 * -1
    // heading was 0; after one step heading[0] === 0 + expectedDphi
    expect(s.heading[0]).toBeCloseTo(expectedDphi, 6)
  })

  it('mirror config flips the sign (neighbours on the right → sign(R − L) = +1)', () => {
    const alpha = Math.PI, beta = 17 * DEG
    const s = handSystem(
      [500, 490, 510],
      [500, 460, 455], // neighbours ABOVE → right of a +x heading (dy < 0)
      [0, 0, 0],
      60, alpha, beta,
    )
    stepSystem(s)
    expect(s.neighbors[0]).toBe(2)
    expect(s.heading[0]).toBeCloseTo(alpha + beta * 2 * 1, 6)
  })

  it('toroidal min-image: a neighbour across the seam is still counted', () => {
    // Particle 0 near the right edge, neighbour near the left edge. Straight-line
    // distance is ~990 (out of range) but the wrapped distance is ~10 (in range).
    const s = handSystem(
      [995, 5],
      [500, 500],
      [0, 0],
      60, Math.PI, 17 * DEG,
    )
    stepSystem(s)
    expect(s.neighbors[0]).toBe(1) // seam-wrapped neighbour sensed
  })

  it('clustering EMERGES: mean neighbour count rises well above the uniform baseline', () => {
    const radius = 0.03 * WORLD
    const s = createSystem({
      particleCount: 1600, radius, alpha: Math.PI, beta: 17 * DEG, velocity: 0.13 * radius, seed: 1337,
    })
    stepSystem(s)
    const baseline = meanNeighbors(s) // ~uniform-random state
    for (let k = 0; k < 300; k++) stepSystem(s)
    const settled = meanNeighbors(s)
    // condensation into cells raises the mean pairwise neighbour count
    expect(settled).toBeGreaterThan(baseline * 1.3)
  })

  it('stays finite and in-bounds (toroidal wrap) over a long run', () => {
    const radius = 0.03 * WORLD
    const s = createSystem({
      particleCount: 800, radius, alpha: Math.PI, beta: 17 * DEG, velocity: 0.13 * radius, seed: 7,
    })
    for (let k = 0; k < 400; k++) stepSystem(s)
    for (let i = 0; i < s.n; i++) {
      expect(Number.isFinite(s.x[i])).toBe(true)
      expect(Number.isFinite(s.y[i])).toBe(true)
      expect(s.x[i]).toBeGreaterThanOrEqual(0)
      expect(s.x[i]).toBeLessThan(WORLD)
      expect(s.y[i]).toBeGreaterThanOrEqual(0)
      expect(s.y[i]).toBeLessThan(WORLD)
    }
  })
})
