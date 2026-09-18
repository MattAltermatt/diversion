import { describe, it, expect } from 'vitest'
import { leaf, drop, wavyRing, hatchTri } from './motifs'

const radii = (p: { x: number; y: number }[]) => p.map((q) => Math.hypot(q.x, q.y))

describe('motifs', () => {
  it('wavyRing ACTUALLY has lobes: radius swings 2*R*amp and repeats every 2pi/lobes', () => {
    const r = radii(wavyRing(0, 0, 300, 4, 0.09, 400))
    expect(Math.max(...r) - Math.min(...r)).toBeCloseTo(54, 0)   // 2*300*0.09
    for (let i = 0; i < 300; i++) expect(r[i]).toBeCloseTo(r[i + 100], 6)  // 400/4
  })

  it('drop is NOT mirror-symmetric along its axis; leaf is', () => {
    const asym = (p: ReturnType<typeof drop>) => {
      const n = p.length / 2
      let worst = 0
      for (let i = 0; i < n; i++) {
        worst = Math.max(worst, Math.abs(Math.abs(p[i].y) - Math.abs(p[n - 1 - i].y)))
      }
      return worst
    }
    expect(asym(drop(0, 0, 0, 40, 9))).toBeGreaterThan(1)
    expect(asym(leaf(0, 0, 0, 40, 9))).toBeLessThan(1e-9)
  })

  it('hatchTri returns hatching SEPARATELY — hatching a bundle is a solid block', () => {
    const t = hatchTri(0, 0, 0, 40, 12, 3)
    expect(t.hatch).toHaveLength(3)
    expect(t.outline.length).toBeGreaterThanOrEqual(4)
  })
})
