import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import { createLloydState, stepLloyd, polyCentroid, buildLUT } from './lloyd'
import type { LloydRelaxationConfig } from './schema'
import type { RenderContext } from '../../framework/types'

const cfg = (over: Partial<LloydRelaxationConfig> = {}): LloydRelaxationConfig => ({
  count: 120, relaxRate: 0.1, jitter: 0.7, seed: 1, borderWidth: 1.5,
  palette: ['#0d2a4a', '#1a8fbf', '#6ee0d0', '#b0a0e8', '#e88ac0'], border: '#05070d',
  ...over,
})

describe('polyCentroid', () => {
  it('finds the centre of a square', () => {
    const c = polyCentroid([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])
    expect(c[0]).toBeCloseTo(5)
    expect(c[1]).toBeCloseTo(5)
  })
  it('falls back to a vertex for a degenerate sliver', () => {
    const c = polyCentroid([[3, 4], [3, 4], [3, 4]])
    expect(c).toEqual([3, 4])
  })
})

describe('buildLUT', () => {
  it('bakes 256 rgb() strings', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256)
    expect(lut[0]).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
  })
})

describe('createLloydState', () => {
  it('is deterministic per seed and differs across seeds', () => {
    expect([...createLloydState(cfg(), 800, 600).points]).toEqual([...createLloydState(cfg(), 800, 600).points])
    expect([...createLloydState(cfg({ seed: 1 }), 800, 600).points])
      .not.toEqual([...createLloydState(cfg({ seed: 2 }), 800, 600).points])
  })
})

describe('stepLloyd', () => {
  it('keeps every seed inside the bounds and anneals toward a more even spread', () => {
    const st = createLloydState(cfg({ count: 150, jitter: 0 }), 400, 300)
    const ctx = make2DContext() as unknown as RenderContext & CanvasRenderingContext2D
    // nearest-neighbour spacing variance should fall as it relaxes (more uniform)
    const spread = (): number => {
      let sum = 0, sum2 = 0, n = 0
      for (let i = 0; i < st.points.length; i += 2) {
        let best = Infinity
        for (let j = 0; j < st.points.length; j += 2) {
          if (i === j) continue
          const dx = st.points[i] - st.points[j], dy = st.points[i + 1] - st.points[j + 1]
          const d = dx * dx + dy * dy
          if (d < best) best = d
        }
        sum += best; sum2 += best * best; n++
      }
      return sum2 / n - (sum / n) ** 2 // variance
    }
    const before = spread()
    for (let k = 0; k < 30; k++) stepLloyd(st, ctx, 16)
    for (let i = 0; i < st.points.length; i += 2) {
      expect(st.points[i]).toBeGreaterThanOrEqual(0); expect(st.points[i]).toBeLessThanOrEqual(400)
      expect(st.points[i + 1]).toBeGreaterThanOrEqual(0); expect(st.points[i + 1]).toBeLessThanOrEqual(300)
    }
    expect(spread()).toBeLessThan(before) // relaxation evened the spacing
  })
})
