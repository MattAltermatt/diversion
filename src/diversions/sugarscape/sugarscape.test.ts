import { describe, it, expect } from 'vitest'
import { sugarscapeSchema } from './schema'
import { createSugarState, step, advance, buildFieldLut } from './sugarscape'

const cfg = (over = {}) => sugarscapeSchema.parse({ ...over })

describe('sugarscape determinism', () => {
  it('same seed → identical initial agents', () => {
    const a = createSugarState(cfg({ seed: 7 }), 800, 600)
    const b = createSugarState(cfg({ seed: 7 }), 800, 600)
    const dump = (s: typeof a) => s.agents.map((g) => `${g.col},${g.row},${g.vision},${g.metab}`).join('|')
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different agents', () => {
    const a = createSugarState(cfg({ seed: 1 }), 800, 600)
    const b = createSugarState(cfg({ seed: 2 }), 800, 600)
    const dump = (s: typeof a) => s.agents.map((g) => `${g.col},${g.row}`).join('|')
    expect(dump(a)).not.toEqual(dump(b))
  })

  it('runs to the requested population (capped by grid)', () => {
    const s = createSugarState(cfg({ seed: 3, agentCount: 300, gridResolution: 64 }), 800, 600)
    expect(s.agents.length).toBe(300)
  })
})

describe('sugarscape rules', () => {
  it('never seats two agents on one cell, over many steps', () => {
    const s = createSugarState(cfg({ seed: 5, agentCount: 400, gridResolution: 64, reproduction: true }), 800, 600)
    for (let t = 0; t < 200; t++) {
      step(s)
      const cells = s.agents.map((a) => a.row * s.n + a.col)
      expect(new Set(cells).size).toBe(cells.length)
    }
  })

  it('occupied index array stays consistent with the agent list', () => {
    const s = createSugarState(cfg({ seed: 6, agentCount: 250, gridResolution: 48 }), 800, 600)
    for (let t = 0; t < 120; t++) step(s)
    let seen = 0
    for (let i = 0; i < s.occupied.length; i++) {
      const ai = s.occupied[i]
      if (ai === -1) continue
      seen++
      expect(ai).toBeGreaterThanOrEqual(0)
      expect(ai).toBeLessThan(s.agents.length)
      expect(s.agents[ai].row * s.n + s.agents[ai].col).toBe(i)
    }
    expect(seen).toBe(s.agents.length)
  })

  it('with reproduction off, population only shrinks', () => {
    const s = createSugarState(cfg({ seed: 8, agentCount: 400, gridResolution: 64, reproduction: false }), 800, 600)
    let prev = s.agents.length
    for (let t = 0; t < 150; t++) {
      step(s)
      expect(s.agents.length).toBeLessThanOrEqual(prev)
      prev = s.agents.length
    }
  })

  it('sugar never exceeds local capacity after regrowth', () => {
    const s = createSugarState(cfg({ seed: 9, gridResolution: 48, regrowthRate: 4 }), 800, 600)
    for (let t = 0; t < 60; t++) step(s)
    for (let i = 0; i < s.sugar.length; i++) expect(s.sugar[i]).toBeLessThanOrEqual(s.cap[i] + 1e-6)
  })

  it('advance fires whole steps from dt', () => {
    const s = createSugarState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    const t0 = s.tick
    advance(s, 350)
    expect(s.tick).toBeGreaterThanOrEqual(3)
    expect(s.tick).toBeLessThanOrEqual(4)
    void t0
  })
})

describe('sugarscape render gate (#273)', () => {
  it('marks dirty only when a step actually runs', () => {
    const s = createSugarState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    expect(s.dirty).toBe(true) // fresh state must paint once

    s.dirty = false
    advance(s, 0) // no time → no step
    expect(s.dirty).toBe(false) // nothing changed → no field rebuild

    s.dirty = false
    advance(s, 1000) // plenty of time → steps run
    expect(s.dirty).toBe(true)
  })
})

describe('field LUT', () => {
  it('has 65 rgb entries, dark barren → bright peak', () => {
    const lut = buildFieldLut(cfg())
    expect(lut.length).toBe(65 * 3)
    const barren = lut[0] + lut[1] + lut[2]
    const peak = lut[64 * 3] + lut[64 * 3 + 1] + lut[64 * 3 + 2]
    expect(peak).toBeGreaterThan(barren)
  })
})
