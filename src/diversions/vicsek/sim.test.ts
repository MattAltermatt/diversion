import { describe, it, expect } from 'vitest'
import { createFlock, stepFlock, DEFAULT_SIM_CONFIG, type SimConfig } from './sim'

describe('vicsek sim', () => {
  it('is deterministic for a given seed', () => {
    const cfgA: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 7 }
    const cfgB: SimConfig = { ...DEFAULT_SIM_CONFIG, seed: 7 }
    const a = createFlock(cfgA), b = createFlock(cfgB)
    for (let i = 0; i < 40; i++) { stepFlock(a); stepFlock(b) }
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
    expect(Array.from(a.py)).toEqual(Array.from(b.py))
    expect(Array.from(a.theta)).toEqual(Array.from(b.theta))
    expect(a.orderParam).toBeCloseTo(b.orderParam)
  })

  it('different seeds diverge', () => {
    const a = createFlock({ ...DEFAULT_SIM_CONFIG, seed: 1 })
    const b = createFlock({ ...DEFAULT_SIM_CONFIG, seed: 2 })
    for (let i = 0; i < 10; i++) { stepFlock(a); stepFlock(b) }
    expect(Array.from(a.px)).not.toEqual(Array.from(b.px))
  })

  // The headline mechanic: the ORDER→DISORDER phase transition. At η=0, alignment
  // is noise-free and the order parameter (|mean heading vector|) should climb
  // toward 1 as the flock condenses. At the maximum noise (η=2π, fully random
  // perturbation), it should stay low — the classic Vicsek result.
  it('order parameter trends toward order at zero noise', () => {
    const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, noise: 0 }
    const s = createFlock(cfg)
    const early = s.orderParam
    let last = early
    for (let i = 0; i < 150; i++) { stepFlock(s); last = s.orderParam }
    expect(last).toBeGreaterThan(early)
    expect(last).toBeGreaterThan(0.9)
  })

  it('order parameter stays low at maximum noise', () => {
    const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, noise: Math.PI * 2 }
    const s = createFlock(cfg)
    let sum = 0, steps = 60
    for (let i = 0; i < steps; i++) { stepFlock(s); sum += s.orderParam }
    const avg = sum / steps
    expect(avg).toBeLessThan(0.3)
  })

  it('zero noise converges to substantially higher order than max noise', () => {
    const ordered = createFlock({ ...DEFAULT_SIM_CONFIG, noise: 0 })
    const chaotic = createFlock({ ...DEFAULT_SIM_CONFIG, noise: Math.PI * 2 })
    for (let i = 0; i < 150; i++) { stepFlock(ordered); stepFlock(chaotic) }
    expect(ordered.orderParam).toBeGreaterThan(chaotic.orderParam * 2)
  })

  it('positions stay wrapped within the toroidal arena', () => {
    const s = createFlock({ ...DEFAULT_SIM_CONFIG, noise: 3 })
    for (let i = 0; i < 30; i++) stepFlock(s)
    for (let i = 0; i < s.n; i++) {
      expect(s.px[i]).toBeGreaterThanOrEqual(0)
      expect(s.px[i]).toBeLessThan(s.worldSize)
      expect(s.py[i]).toBeGreaterThanOrEqual(0)
      expect(s.py[i]).toBeLessThan(s.worldSize)
    }
  })
})
