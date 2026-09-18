import { describe, it, expect } from 'vitest'
import { offsetPath, bundle, type Pt } from './geometry'

const circle = (r: number, n = 240): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: r * Math.cos(t), y: r * Math.sin(t) }
  })

describe('offsetPath', () => {
  // The normal is {-dy, dx}, which for this path points INWARD. Two drafts of
  // the plan asserted 110 here while also requiring the inward convention two
  // tests down — the file could not be satisfied. Measured: 89.999.
  it('offsets this circle INWARD for positive d', () => {
    for (const p of offsetPath(circle(100), 10, true)) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(90, 0)
    }
  })

  // ⚠️ NON-VACUITY FIRST. Removing the floor makes the cull reject the whole
  // overshoot, offsetPath returns [], and Math.max(...[]) is -Infinity — which
  // passes `< 120` cheerfully. Without the length assertion this mutant SURVIVES;
  // it did, through two plan revisions.
  //
  // ⚠️ And the wedge must be SHARP. At the 15° wedge an earlier draft used, the
  // mitered corner reaches 76.5 px while a path ENDPOINT sits at 104.01, so no
  // ceiling can separate floored from unfloored. At 2°: floored 100.56.
  it('BOUNDS the miter at a 2-degree hairpin', () => {
    const hairpin: Pt[] = [{ x: -100, y: 0 }, { x: 0, y: 0 }, { x: -100, y: 3.5 }]
    const out = offsetPath(hairpin, 10, false)
    expect(out.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...out.map((p) => Math.hypot(p.x, p.y)))).toBeLessThan(120)
  })

  it('CULLS reversed segments where |d| exceeds the radius of curvature', () => {
    const lens: Pt[] = []
    for (let i = 0; i <= 40; i++) {
      const u = i / 40
      lens.push({ x: u * 40, y: Math.sin(u * Math.PI) * 9 })
    }
    for (let i = 39; i >= 1; i--) {
      const u = i / 40
      lens.push({ x: u * 40, y: -Math.sin(u * Math.PI) * 9 })
    }
    const out = offsetPath(lens, -12, true)
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(lens.length)
  })
})

describe('bundle', () => {
  it('returns {pts,closed} objects, count of them, spread (count-1)*spacing', () => {
    const b = bundle(circle(100), 6, 7, true)
    expect(b).toHaveLength(6)
    expect(b[0]).toHaveProperty('closed', true)
    const radii = b.map((x) => Math.hypot(x.pts[0].x, x.pts[0].y))
    expect(Math.max(...radii) - Math.min(...radii)).toBeCloseTo(35, 0)
  })

  // A bare line vanishes at EVERY count, odd or even — the d === 0 copy is
  // dropped by the same >= 3 filter. Callers needing a straight line bypass this.
  it('drops a 2-point line at every count', () => {
    const line2: Pt[] = [{ x: 0, y: 0 }, { x: 50, y: 0 }]
    expect(bundle(line2, 3, 3, false)).toHaveLength(0)
    expect(bundle(line2, 4, 3, false)).toHaveLength(0)
  })
})
