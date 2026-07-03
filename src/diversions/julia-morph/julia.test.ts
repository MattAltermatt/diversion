import { describe, it, expect } from 'vitest'
import { seededPhase, hexToRgb, FRAG_SRC } from './julia'

describe('seededPhase', () => {
  it('is deterministic per seed and in [0, 2π)', () => {
    expect(seededPhase(1)).toBe(seededPhase(1))
    const p = seededPhase(9)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThan(Math.PI * 2)
  })
  it('varies across seeds', () => {
    expect(seededPhase(1)).not.toBe(seededPhase(2))
  })
})

describe('hexToRgb', () => {
  it('maps hex to 0..1 float channels', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    expect(hexToRgb('#ffffff')).toEqual([1, 1, 1])
  })
})

describe('FRAG_SRC', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of ['u_res', 'u_time', 'u_view', 'u_shape', 'u_iter', 'u_bands',
                     'u_colorA', 'u_colorB', 'u_colorInside']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
})
