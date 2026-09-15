import { describe, it, expect } from 'vitest'
import { ifsKeyframes, maxGenerations, IFS_RULES } from './ifs'
import { CURVE_POINTS } from './curve'

const len = (c: Float32Array) => {
  let s = 0
  for (let i = 1; i < c.length / 2; i++) {
    s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
  }
  return s
}

describe('IFS_RULES', () => {
  it('every rule runs from (0,0) to (1,0)', () => {
    for (const { rule } of IFS_RULES) {
      expect(rule[0]).toEqual([0, 0])
      expect(rule[rule.length - 1]).toEqual([1, 0])
    }
  })

  // CURVE_POINTS must OUT-sample the finest keyframe or resampling cuts chords
  // across the very detail the generation added.
  it('caps generations so the finest keyframe fits in CURVE_POINTS', () => {
    for (const { rule } of IFS_RULES) {
      const segs = rule.length - 1
      const g = maxGenerations(rule)
      expect(g).toBeGreaterThanOrEqual(1)
      expect(Math.pow(segs, g) + 1).toBeLessThanOrEqual(CURVE_POINTS)
      expect(Math.pow(segs, g + 1) + 1).toBeGreaterThan(CURVE_POINTS)
    }
  })
})

describe('ifsKeyframes', () => {
  it('generation 0 is the straight edge', () => {
    const st = ifsKeyframes(IFS_RULES[0].rule, 2)
    for (let i = 0; i < CURVE_POINTS; i++) expect(st[0][i * 2 + 1]).toBeCloseTo(0, 5)
  })

  it('returns gens+1 keyframes with endpoints pinned', () => {
    const g = maxGenerations(IFS_RULES[1].rule)
    const st = ifsKeyframes(IFS_RULES[1].rule, g)
    expect(st.length).toBe(g + 1)
    for (const c of st) {
      expect(c[0]).toBeCloseTo(0, 5)
      expect(c[c.length - 2]).toBeCloseTo(1, 5)
      expect(c[c.length - 1]).toBeCloseTo(0, 5)
    }
  })

  it('each generation is strictly longer than the last', () => {
    for (const { rule } of IFS_RULES) {
      const st = ifsKeyframes(rule, maxGenerations(rule))
      for (let i = 1; i < st.length; i++) expect(len(st[i])).toBeGreaterThan(len(st[i - 1]))
    }
  })

  it('is deterministic — no randomness anywhere', () => {
    expect(Array.from(ifsKeyframes(IFS_RULES[2].rule, 2)[2]))
      .toEqual(Array.from(ifsKeyframes(IFS_RULES[2].rule, 2)[2]))
  })
})
