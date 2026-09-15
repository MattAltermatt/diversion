import { describe, it, expect } from 'vitest'
import { gridKeyframes, gridPaths, pushAround, GRID_SUBDIV, GRID_REACH } from './grid'
import { CURVE_POINTS, type Curve } from './curve'

const arcLen = (c: Curve): number => {
  let s = 0
  for (let i = 1; i < c.length / 2; i++) {
    s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
  }
  return s
}

const straightPath = (): [number, number][] => {
  const p: [number, number][] = []
  for (let i = 0; i <= GRID_SUBDIV; i++) p.push([i, 0])
  return p
}

describe('pushAround — legality', () => {
  it('rejects a cell that touches no edge of the path', () => {
    expect(pushAround(straightPath(), [2, 4])).toBeNull()
  })

  it('a legal push returns a SIMPLE path with the endpoints still pinned', () => {
    const next = pushAround(straightPath(), [2, 0])
    expect(next).not.toBeNull()
    const seen = new Set<string>()
    for (const p of next!) {
      const k = `${p[0]},${p[1]}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    expect(next![0]).toEqual([0, 0])
    expect(next![next!.length - 1]).toEqual([GRID_SUBDIV, 0])
  })
})

describe('gridPaths — every stage stays legal', () => {
  for (const seed of [1013, 77, 2024, 99991]) {
    it(`simple, pinned and bounded for seed ${seed}`, () => {
      for (const path of gridPaths(30, seed)) {
        const seen = new Set<string>()
        for (const p of path) {
          const k = `${p[0]},${p[1]}`
          expect(seen.has(k)).toBe(false) // the path must never touch itself
          seen.add(k)
          expect(Math.abs(p[1])).toBeLessThanOrEqual(GRID_REACH)
          expect(p[0]).toBeGreaterThanOrEqual(0) // no overshoot along the edge
          expect(p[0]).toBeLessThanOrEqual(GRID_SUBDIV)
        }
        expect(path[0]).toEqual([0, 0])
        expect(path[path.length - 1]).toEqual([GRID_SUBDIV, 0])
        for (let i = 1; i < path.length; i++) {
          const d = Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])
          expect(d).toBe(1) // consecutive points are unit grid steps
        }
      }
    })
  }
})

describe('gridKeyframes', () => {
  it('starts straight, pins the endpoints, resamples to CURVE_POINTS', () => {
    for (const c of gridKeyframes(20, 1013)) {
      expect(c.length).toBe(CURVE_POINTS * 2)
      expect(c[0]).toBeCloseTo(0, 5)
      expect(c[1]).toBeCloseTo(0, 5)
      expect(c[c.length - 2]).toBeCloseTo(1, 5)
      expect(c[c.length - 1]).toBeCloseTo(0, 5)
    }
  })

  // NOT monotone per step: pushAround accepts on.length of 3, which replaces 3
  // edges with 1 and SHORTENS the path — and that is the third of Kaplan's
  // Figure 2 moves, so it is required. Assert total growth only.
  it('is substantially longer at the end of the stack than at the start', () => {
    const st = gridKeyframes(24, 2024)
    expect(arcLen(st[st.length - 1])).toBeGreaterThan(arcLen(st[0]) * 1.5)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    expect(Array.from(gridKeyframes(12, 9)[12])).toEqual(Array.from(gridKeyframes(12, 9)[12]))
    expect(Array.from(gridKeyframes(12, 9)[12])).not.toEqual(Array.from(gridKeyframes(12, 10)[12]))
  })
})
