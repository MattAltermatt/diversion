import { describe, it, expect } from 'vitest'
import { stepFront, variance, runFront, type FrontParams } from './growth'

// These tests are the instability KEYSTONE: they prove the growth rule produces an
// UNSTABLE, fingering interface (variance of the front GROWS) rather than a smooth
// expanding disc (variance shrinks). If this ever flips, the diversion stopped
// fingering and became a boring blob. Params keep the runaway bounded (no float
// overflow) while still being unmistakably unstable: net curvature response
// tension − 0.5·feedback < 0 ⇔ feedback > 2·tension.
const UNSTABLE: FrontParams = { feedback: 5, tension: 1, noise: 0.01, dt: 0.1 } // feedback > 2·tension
const STABLE: FrontParams = { feedback: 0, tension: 1, noise: 0, dt: 0.1 }      // pure smoothing
const STEPS = 250

describe('stepFront / runFront — Saffman–Taylor instability', () => {
  it('is deterministic per seed, and different seeds diverge', () => {
    const a = runFront(128, STEPS, UNSTABLE, 42)
    const b = runFront(128, STEPS, UNSTABLE, 42)
    expect(a.front).toEqual(b.front)
    expect(runFront(128, STEPS, UNSTABLE, 42).endVar)
      .not.toEqual(runFront(128, STEPS, UNSTABLE, 43).endVar)
  })

  it('an almost-flat front AMPLIFIES its roughness into fingers (variance grows)', () => {
    const { startVar, endVar } = runFront(128, STEPS, UNSTABLE, 1)
    expect(Number.isFinite(endVar)).toBe(true)
    expect(endVar).toBeGreaterThan(startVar * 100) // runaway growth, not a nudge
  })

  it('the pure-diffusion control instead SMOOTHS the front (variance shrinks)', () => {
    const { startVar, endVar } = runFront(128, STEPS, STABLE, 1)
    expect(endVar).toBeLessThan(startVar) // surface tension wins → smooth disc
  })

  it('the unstable front ends far rougher than the stable one from the same seed', () => {
    const unstable = runFront(128, STEPS, UNSTABLE, 5)
    const stable = runFront(128, STEPS, STABLE, 5)
    expect(unstable.endVar).toBeGreaterThan(stable.endVar * 1000)
  })

  it('advances the mean front outward (there IS injection, not just roughening)', () => {
    let front = new Array(64).fill(0)
    for (let i = 0; i < 50; i++) front = stepFront(front, UNSTABLE, () => 0.5)
    const mean = front.reduce((a, b) => a + b, 0) / front.length
    expect(mean).toBeGreaterThan(0)
  })

  it('variance() is zero for a flat front', () => {
    expect(variance([3, 3, 3, 3])).toBe(0)
  })
})
