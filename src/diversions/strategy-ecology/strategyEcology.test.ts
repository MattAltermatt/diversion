import { describe, it, expect } from 'vitest'
import { strategyEcologySchema } from './schema'
import {
  createStrategyState, step, advance, buildTable, pairScore, buildLut,
  C, D, TFT, WSLS,
} from './strategyEcology'

const cfg = (over = {}) => strategyEcologySchema.parse({ ...over })

describe('strategy-ecology determinism', () => {
  it('same seed → identical initial grid', () => {
    const a = createStrategyState(cfg({ seed: 7 }), 800, 600)
    const b = createStrategyState(cfg({ seed: 7 }), 800, 600)
    expect(Array.from(a.strat)).toEqual(Array.from(b.strat))
  })

  it('different seed → different grid', () => {
    const a = createStrategyState(cfg({ seed: 1 }), 800, 600)
    const b = createStrategyState(cfg({ seed: 2 }), 800, 600)
    expect(Array.from(a.strat)).not.toEqual(Array.from(b.strat))
  })

  it('single-defector seed is one D in a sea of C', () => {
    const s = createStrategyState(cfg({ seedPattern: 'single-defector' }), 800, 600)
    let defectors = 0
    for (const v of s.strat) if (v === D) defectors++
    expect(defectors).toBe(1)
  })
})

describe('payoff table', () => {
  it('single-shot: D beats C, mutual C beats mutual D', () => {
    const t = buildTable(cfg({ strategySet: 'C / D', temptation: 1.8 }))
    const N = 4
    expect(t[D * N + C]).toBeCloseTo(1.8) // temptation
    expect(t[C * N + C]).toBeCloseTo(1) // reward
    expect(t[C * N + D]).toBeCloseTo(0) // sucker
    expect(t[D * N + D]).toBeCloseTo(0) // punishment
  })

  it('iterated: TFT vs TFT fully cooperates (score = rounds)', () => {
    const rounds = 10
    expect(pairScore(TFT, TFT, rounds, true, 1.8)).toBeCloseTo(rounds * 1) // all mutual-C
  })

  it('iterated: AllD exploits AllC every round', () => {
    const rounds = 10
    expect(pairScore(D, C, rounds, true, 1.8)).toBeCloseTo(rounds * 1.8)
  })

  it('iterated: WSLS recovers cooperation against TFT', () => {
    // Both start C and mirror → mutual cooperation, high score.
    expect(pairScore(WSLS, TFT, 12, true, 1.8)).toBeGreaterThan(10)
  })
})

describe('strategy-ecology rules', () => {
  it('all strategies stay in the valid range over many steps', () => {
    const s = createStrategyState(cfg({ seed: 5, gridResolution: 48 }), 800, 600)
    for (let t = 0; t < 60; t++) step(s)
    for (const v of s.strat) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(3)
    }
  })

  it('a full grid of cooperators is stable (no spontaneous defection)', () => {
    const s = createStrategyState(cfg({ seedPattern: 'random', gridResolution: 40 }), 400, 400)
    s.strat.fill(C)
    step(s)
    for (const v of s.strat) expect(v).toBe(C)
  })

  it('fractions sum to ~1 after a step', () => {
    const s = createStrategyState(cfg({ seed: 9, gridResolution: 40 }), 400, 400)
    step(s)
    const sum = s.fractions[0] + s.fractions[1] + s.fractions[2] + s.fractions[3]
    expect(sum).toBeCloseTo(1)
  })

  it('advance fires whole steps from dt', () => {
    const s = createStrategyState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    advance(s, 350)
    expect(s.tick).toBeGreaterThanOrEqual(3)
    expect(s.tick).toBeLessThanOrEqual(4)
  })
})

describe('colour LUT', () => {
  it('has 4 distinct rgb entries', () => {
    const lut = buildLut(cfg())
    expect(lut.length).toBe(12)
    const c = `${lut[0]},${lut[1]},${lut[2]}`
    const d = `${lut[3]},${lut[4]},${lut[5]}`
    expect(c).not.toEqual(d)
  })
})
