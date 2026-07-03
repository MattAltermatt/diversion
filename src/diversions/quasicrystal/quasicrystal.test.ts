import { describe, it, expect } from 'vitest'
import { seededRotation, hexToRgb, FRAG_SRC } from './quasicrystal'

describe('seededRotation', () => {
  it('is deterministic per seed and in [0, 2π)', () => {
    expect(seededRotation(1)).toBe(seededRotation(1))
    const r = seededRotation(42)
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThan(Math.PI * 2)
  })
  it('varies across seeds', () => {
    expect(seededRotation(1)).not.toBe(seededRotation(2))
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
    for (const u of ['u_res', 'u_time', 'u_scale', 'u_waves', 'u_fringes', 'u_rot', 'u_colorA', 'u_colorB']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
})
