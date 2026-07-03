import { describe, it, expect } from 'vitest'
import { buildSources, liveSources, SHAPE_VLINE, SHAPE_POINT } from './sources'
import { morphogenSchema } from './schema'

const base = (over = {}) => morphogenSchema.parse(over)

describe('buildSources', () => {
  it('is deterministic in the seed (same seed → identical cast)', () => {
    const cfg = base({ sourceLayout: 'scatter', sourceCount: 6 })
    expect(buildSources(cfg, 42)).toEqual(buildSources(cfg, 42))
  })

  it('different seeds give a different cast', () => {
    const cfg = base({ sourceLayout: 'scatter', sourceCount: 6 })
    expect(buildSources(cfg, 1)).not.toEqual(buildSources(cfg, 2))
  })

  it('poles = two opposing vertical lines breathing in anti-phase', () => {
    const s = buildSources(base({ sourceLayout: 'poles', morphogenCount: 2 }), 7)
    expect(s).toHaveLength(2)
    expect(s.every((x) => x.shape === SHAPE_VLINE)).toBe(true)
    expect(s[0].channel).toBe(0)
    expect(s[1].channel).toBe(1)
    // mirrored breathing: phase offset of π drives converge/spread
    expect(Math.abs((s[1].px - s[0].px) - Math.PI)).toBeLessThan(1e-9)
  })

  it('point = one centered permanent source; scatter sources have a lifecycle', () => {
    const pt = buildSources(base({ sourceLayout: 'point' }), 3)
    expect(pt).toHaveLength(1)
    expect(pt[0].shape).toBe(SHAPE_POINT)
    expect(pt[0].lifePeriod).toBe(0) // permanent
    const sc = buildSources(base({ sourceLayout: 'scatter', sourceCount: 5 }), 3)
    expect(sc).toHaveLength(5)
    expect(sc.every((x) => x.lifePeriod > 0)).toBe(true)
  })

  it('scatter honors sourceCount and cycles channels across morphogenCount', () => {
    const sc = buildSources(base({ sourceLayout: 'scatter', sourceCount: 8, morphogenCount: 3 }), 9)
    expect(sc).toHaveLength(8)
    expect(new Set(sc.map((x) => x.channel))).toEqual(new Set([0, 1, 2]))
  })
})

describe('liveSources', () => {
  it('permanent sources hold full strength; reorganize=0 keeps scatter at home + full', () => {
    const bases = buildSources(base({ sourceLayout: 'scatter', sourceCount: 4 }), 5)
    const live = liveSources(bases, 0, 0, 0, 5)
    expect(live.every((s) => s.strength === 1)).toBe(true)
    // at t=0 with no drift, positions equal homes
    live.forEach((s, i) => {
      expect(s.x).toBeCloseTo(bases[i].hx)
      expect(s.y).toBeCloseTo(bases[i].hy)
    })
  })

  it('birth/death envelope drives a scatter source strength below 1 over its cycle', () => {
    const bases = buildSources(base({ sourceLayout: 'scatter', sourceCount: 3 }), 11)
    // sample many instants; with reorganize on, at least one source dips under full
    let sawDip = false
    for (let t = 0; t < 300; t += 3) {
      const live = liveSources(bases, 0, t, 1, 11)
      if (live.some((s) => s.strength < 0.99)) sawDip = true
    }
    expect(sawDip).toBe(true)
  })

  it('drift moves a source off its home', () => {
    const bases = buildSources(base({ sourceLayout: 'point' }), 2)
    const moved = liveSources(bases, 20, 0, 0, 2)[0]
    const home = bases[0]
    expect(Math.hypot(moved.x - home.hx, moved.y - home.hy)).toBeGreaterThan(0)
  })
})
