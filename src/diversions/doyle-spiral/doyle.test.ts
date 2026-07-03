import { describe, it, expect } from 'vitest'
import { solveDoyle, buildLattice, type DoyleCircle } from './doyle'

// The correctness keystone: adjacent circles in a Doyle spiral must be TANGENT
// (kissing) — the visual signature. We verify the solved generators produce a
// lattice whose neighbours touch to floating-point tolerance.

const dist = (a: DoyleCircle, b: DoyleCircle) => Math.hypot(a.x - b.x, a.y - b.y)

/** Two circles are externally tangent when centre-distance ≈ r1 + r2. */
function tangency(a: DoyleCircle, b: DoyleCircle): number {
  return Math.abs(dist(a, b) - (a.rad + b.rad)) / (a.rad + b.rad)
}

describe('solveDoyle', () => {
  it('converges to a sane generator across the dense regime (q≥6, p<q)', () => {
    for (const [p, q] of [[8, 20], [12, 28], [5, 16], [16, 28], [6, 20], [1, 6], [20, 32]] as const) {
      const g = solveDoyle(p, q)
      expect(g, `(${p},${q})`).not.toBeNull()
      expect(g!.modA, `(${p},${q}) modA`).toBeGreaterThan(1) // outward-growing generator
      expect(g!.modA, `(${p},${q}) modA`).toBeLessThan(4) // dense, not blown-up
      expect(g!.r).toBeGreaterThan(0)
      expect(g!.r).toBeLessThan(1)
    }
  })

  it('converges for EVERY slider-reachable (p,q) — the (2,3) fallback never silently fires', () => {
    // Schema ranges: q ∈ [6,32], p ∈ [1,20]; reconcile clamps p ≤ q-1. Sweep the
    // whole reachable grid so a user dragging the sliders can never land on a
    // degenerate type that silently falls back to (2,3) while the form reads (p,q).
    for (let q = 6; q <= 32; q++) {
      for (let p = 1; p <= Math.min(20, q - 1); p++) {
        const g = solveDoyle(p, q)
        expect(g, `(${p},${q}) must converge`).not.toBeNull()
        expect(g!.modA, `(${p},${q}) modA>1`).toBeGreaterThan(1)
      }
    }
  })

  it('produces a lattice whose nearest neighbours are tangent (circles kiss)', () => {
    for (const [p, q] of [[8, 20], [12, 28], [4, 10]] as const) {
      const g = solveDoyle(p, q)!
      const circles = buildLattice(g, q, 0.02, 40, 6000)
      expect(circles.length, `(${p},${q}) count`).toBeGreaterThan(40)
      // Check circles in the interior of the band (neighbours exist on all sides),
      // and assert each one's single nearest neighbour is tangent.
      let checked = 0
      for (let i = 0; i < circles.length; i++) {
        const c = circles[i]
        const rho = Math.hypot(c.x, c.y)
        if (rho < 0.2 || rho > 12) continue // skip band edges — neighbours may be culled
        let best = Infinity
        let bestJ = -1
        for (let j = 0; j < circles.length; j++) {
          if (j === i) continue
          const d = dist(c, circles[j]) - circles[j].rad
          if (d < best) { best = d; bestJ = j }
        }
        expect(tangency(c, circles[bestJ]), `(${p},${q}) nearest tangency`).toBeLessThan(1e-3)
        checked++
      }
      expect(checked, `(${p},${q}) checked`).toBeGreaterThan(10)
    }
  })
})

describe('buildLattice', () => {
  it('respects the maxCircles budget for a tight spiral (p≈q)', () => {
    const g = solveDoyle(6, 7)! // p≈q packs many circles per turn
    const circles = buildLattice(g, 7, 1e-4, 40, 2000)
    // step cap is per-walk (in+out per arm), so the bound is maxCircles + slack
    expect(circles.length).toBeLessThanOrEqual(2000 + 7 * 2)
  })

  it('assigns every circle an arm in 0..q-1', () => {
    const g = solveDoyle(2, 5)!
    const circles = buildLattice(g, 5, 0.2, 8, 4000)
    expect(circles.length).toBeGreaterThan(0)
    for (const c of circles) {
      expect(c.arm).toBeGreaterThanOrEqual(0)
      expect(c.arm).toBeLessThan(5)
    }
  })
})
