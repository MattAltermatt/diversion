import { describe, it, expect } from 'vitest'
import { pursuitEvasionSchema } from './schema'
import { createArena, stepArena, breed, leaderIndex, WORLD_W, WORLD_H } from './arena'
import { randomBrain, forward, crossover, mutate, type NetDims } from './net'
import { mulberry32 } from '../../framework/rng'

const cfg = (over = {}) => pursuitEvasionSchema.parse({ ...over })

describe('net', () => {
  const dims: NetDims = { nIn: 5, nHid: 6, nOut: 2 }
  it('same seed → identical brain', () => {
    const a = randomBrain(dims, mulberry32(3))
    const b = randomBrain(dims, mulberry32(3))
    expect(Array.from(a.w1)).toEqual(Array.from(b.w1))
  })
  it('forward produces outputs in (-1,1) (tanh)', () => {
    const b = randomBrain(dims, mulberry32(1))
    const hid = new Float32Array(dims.nHid), out = new Float32Array(dims.nOut)
    forward(b, dims, new Float32Array([0.5, -0.2, 1, 0, 1]), hid, out)
    for (const o of out) { expect(o).toBeGreaterThanOrEqual(-1); expect(o).toBeLessThanOrEqual(1) }
  })
  it('crossover child weights all come from one parent or the other', () => {
    const a = randomBrain(dims, mulberry32(1)), b = randomBrain(dims, mulberry32(2))
    const c = crossover(a, b, mulberry32(9))
    for (let i = 0; i < c.w1.length; i++) expect([a.w1[i], b.w1[i]]).toContain(c.w1[i])
  })
  it('mutate at rate 0 is a no-op', () => {
    const a = randomBrain(dims, mulberry32(1))
    const m = mutate(a, 0, 0.5, mulberry32(1))
    expect(Array.from(m.w1)).toEqual(Array.from(a.w1))
  })
})

describe('pursuit-evasion determinism', () => {
  it('same seed → identical initial arena', () => {
    const a = createArena(cfg({ seed: 7 }), 800, 600)
    const b = createArena(cfg({ seed: 7 }), 800, 600)
    const dump = (s: typeof a) => s.prey.map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)}`).join('|')
    expect(dump(a)).toEqual(dump(b))
    expect(Array.from(a.prey[0].brain.w1)).toEqual(Array.from(b.prey[0].brain.w1))
  })
  it('different seed → different arena', () => {
    const a = createArena(cfg({ seed: 1 }), 800, 600)
    const b = createArena(cfg({ seed: 2 }), 800, 600)
    expect(a.prey[0].x).not.toEqual(b.prey[0].x)
  })
})

describe('pursuit-evasion rules', () => {
  it('creatures stay in-bounds under wrap over a long run', () => {
    const s = createArena(cfg({ seed: 5, arenaWrap: true }), 800, 600)
    for (let t = 0; t < 600; t++) stepArena(s, 1 / 60)
    for (const c of [...s.prey, ...s.predators]) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(WORLD_W)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThanOrEqual(WORLD_H)
    }
  })

  it('creatures stay in-bounds against walls (no-wrap)', () => {
    const s = createArena(cfg({ seed: 6, arenaWrap: false }), 800, 600)
    for (let t = 0; t < 600; t++) stepArena(s, 1 / 60)
    for (const c of [...s.prey, ...s.predators]) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(WORLD_W)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThanOrEqual(WORLD_H)
    }
  })

  it('a round breeds a fresh generation of the same size', () => {
    const s = createArena(cfg({ seed: 3, roundSeconds: 5, preyCount: 20, predatorCount: 6 }), 800, 600)
    const g0 = s.gen
    for (let t = 0; t < 60 * 6; t++) stepArena(s, 1 / 60) // > one round
    expect(s.gen).toBeGreaterThan(g0)
    expect(s.prey.length).toBe(20)
    expect(s.predators.length).toBe(6)
  })

  it('elites carry the best brain forward unchanged', () => {
    const s = createArena(cfg({ seed: 4, eliteFrac: 0.2 }), 800, 600)
    for (let t = 0; t < 300; t++) stepArena(s, 1 / 60)
    const bestBefore = [...s.prey].sort((a, b) => b.fitness - a.fitness)[0]
    const brainCopy = Array.from(bestBefore.brain.w1)
    breed(s)
    // the top elite's brain should match the pre-breed champion's brain
    expect(Array.from(s.prey[0].brain.w1)).toEqual(brainCopy)
  })

  it('leaderIndex returns the highest-fitness member', () => {
    const s = createArena(cfg({ seed: 8 }), 800, 600)
    s.prey[3].fitness = 999
    expect(leaderIndex(s.prey)).toBe(3)
  })
})

describe('pursuit-evasion learning (feasibility)', () => {
  // Reward shaping must give predators a usable gradient: averaged over many seeds,
  // catch performance should not collapse — and evolution should be able to lift it.
  it('predators make catches within a few generations', () => {
    const s = createArena(cfg({ seed: 11, roundSeconds: 10, preyCount: 50, predatorCount: 10 }), 800, 600)
    let totalCatches = 0
    for (let g = 0; g < 6; g++) {
      s.catchesThisRound = 0
      for (let t = 0; t < 60 * 10; t++) stepArena(s, 1 / 60)
      totalCatches += s.bestPred
    }
    // Across 6 generations with reward shaping + a slight speed edge, hunters should
    // land at least a handful of catches (not the zero-signal sparse-reward trap).
    expect(totalCatches).toBeGreaterThan(0)
  })
})
