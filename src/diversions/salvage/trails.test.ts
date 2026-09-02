import { describe, it, expect } from 'vitest'
import { makeTrails, deposit, decay, recruitColor, clearTrails } from './trails'
import { TRAIL_RECRUIT } from './state'

describe('trails', () => {
  it('halves in one half-life to within 1%', () => {
    const t = makeTrails(4, 4)
    deposit(t, 1, 5, 1)
    for (let i = 0; i < 100; i++) decay(t, 0.1, 10)
    expect(t.strength[5]).toBeCloseTo(0.5, 2)
    expect(t.color[5]).toBe(1)
  })
  it('reinforces a matching colour and clamps at 1', () => {
    const t = makeTrails(2, 2)
    deposit(t, 0, 0, 0.8); deposit(t, 0, 0, 0.8)
    expect(t.strength[0]).toBe(1)
  })
  it('a foreign colour contests the cell and flips it on crossing zero', () => {
    const t = makeTrails(2, 2)
    deposit(t, 0, 0, 0.3)
    deposit(t, 1, 0, 0.1)
    expect(t.color[0]).toBe(0); expect(t.strength[0]).toBeCloseTo(0.2)
    deposit(t, 1, 0, 0.5)
    expect(t.color[0]).toBe(1); expect(t.strength[0]).toBeCloseTo(0.3)
  })
  it('recruits only above the threshold, and clears', () => {
    const t = makeTrails(2, 2)
    deposit(t, 2, 1, TRAIL_RECRUIT * 0.9)
    expect(recruitColor(t, 1)).toBe(-1)
    deposit(t, 2, 1, TRAIL_RECRUIT)
    expect(recruitColor(t, 1)).toBe(2)
    clearTrails(t)
    expect(recruitColor(t, 1)).toBe(-1)
    expect(t.color[1]).toBe(-1)
  })
})
