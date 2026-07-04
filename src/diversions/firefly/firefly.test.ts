import { describe, it, expect } from 'vitest'
import { fireflySchema } from './schema'
import { createFireflyState, stepFireflies, orderParameter } from './firefly'

const DT = 1 / 60

// Run a swarm for `steps` frames and return the mean order parameter over the
// final `windowSteps` frames (so we measure the settled regime, not the transient).
function runMeanR(overrides: Record<string, unknown>, steps: number, windowSteps: number): number {
  const cfg = fireflySchema.parse({ ...overrides })
  const state = createFireflyState(cfg, 1000, 700)
  let sum = 0
  let count = 0
  for (let s = 0; s < steps; s++) {
    stepFireflies(state, DT)
    for (let i = 0; i < state.n; i++) {
      if (Number.isNaN(state.phase[i]) || Number.isNaN(state.glow[i])) {
        throw new Error(`NaN at step ${s}, firefly ${i}`)
      }
    }
    if (s >= steps - windowSteps) {
      sum += orderParameter(state.phase)
      count++
    }
  }
  return sum / count
}

describe('firefly schema', () => {
  it('parses with valid defaults', () => {
    const cfg = fireflySchema.parse({})
    expect(cfg.fireflyCount).toBe(900)
    expect(cfg.coupling).toBeGreaterThan(0)
    expect(cfg.frequencySpread).toBeGreaterThan(0) // never locks dead-still
    expect(cfg.flashColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.motion).toBe('static')
  })

  it('rejects an out-of-range coupling', () => {
    expect(() => fireflySchema.parse({ coupling: 5 })).toThrow()
  })
})

describe('firefly determinism', () => {
  it('same seed → identical phases after N steps', () => {
    const cfg = fireflySchema.parse({ seed: 42, phaseNoise: 0.05 })
    const a = createFireflyState(cfg, 800, 600)
    const b = createFireflyState(cfg, 800, 600)
    for (let s = 0; s < 200; s++) {
      stepFireflies(a, DT)
      stepFireflies(b, DT)
    }
    expect(Array.from(a.phase)).toEqual(Array.from(b.phase))
    expect(Array.from(a.glow)).toEqual(Array.from(b.glow))
  })

  it('different seed → different phases', () => {
    const base = { fireflyCount: 300 }
    const a = createFireflyState(fireflySchema.parse({ ...base, seed: 1 }), 800, 600)
    const b = createFireflyState(fireflySchema.parse({ ...base, seed: 2 }), 800, 600)
    for (let s = 0; s < 100; s++) {
      stepFireflies(a, DT)
      stepFireflies(b, DT)
    }
    expect(Array.from(a.phase)).not.toEqual(Array.from(b.phase))
  })
})

describe('firefly headline: coupling drives synchrony', () => {
  // Common field: many neighbours per firefly so coupling can organize them.
  const base = { fireflyCount: 500, neighbourRadius: 0.18, frequencySpread: 0.1, phaseNoise: 0 }
  const STEPS = 900 // ~15s
  const WINDOW = 180 // last ~3s

  it('coupled swarm synchronizes far above the uncoupled baseline', () => {
    const coupledR = runMeanR({ ...base, coupling: 0.25 }, STEPS, WINDOW)
    const uncoupledR = runMeanR({ ...base, coupling: 0 }, STEPS, WINDOW)

    // Uncoupled: heterogeneous phases stay dispersed → low order parameter.
    expect(uncoupledR).toBeLessThan(0.35)
    // Coupled: the swarm entrains into waves/unison → high order parameter.
    expect(coupledR).toBeGreaterThan(0.6)
    // And synchrony is clearly an EFFECT of coupling, not a fixed artefact.
    expect(coupledR).toBeGreaterThan(uncoupledR * 2)
  })
})
