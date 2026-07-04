import { describe, it, expect } from 'vitest'
import { hypnowheelSchema } from './schema'
import {
  createHypnowheelState, stepHypnowheel, layerRotation,
  armLeadingAngles, wedgePolygon, effectiveTurns,
} from './hypnowheel'

const defaults = hypnowheelSchema.parse({})

describe('hypnowheel schema', () => {
  it('parses with valid defaults', () => {
    expect(defaults.arms).toBe(9)
    expect(defaults.layers).toBe(3)
    expect(defaults.spiralTightness).toBeGreaterThan(0)
    expect(defaults.color.mode).toBe('duotone')
    // Bounded sliders keep min ≤ default ≤ max.
    expect(defaults.dutyCycle).toBeGreaterThanOrEqual(0.1)
    expect(defaults.dutyCycle).toBeLessThanOrEqual(0.9)
  })

  it('every layer count in range builds that many seeded layers', () => {
    for (let n = 2; n <= 6; n++) {
      const cfg = hypnowheelSchema.parse({ layers: n })
      expect(createHypnowheelState(cfg, 800, 600).layers).toHaveLength(n)
    }
  })
})

describe('determinism (same seed → same layer layout)', () => {
  it('same seed reproduces identical starting rotations', () => {
    const a = createHypnowheelState({ ...defaults, seed: 42 }, 800, 600)
    const b = createHypnowheelState({ ...defaults, seed: 42 }, 800, 600)
    expect(a.layers.map((l) => l.phase0)).toEqual(b.layers.map((l) => l.phase0))
  })

  it('a different seed lays the layers down differently', () => {
    const a = createHypnowheelState({ ...defaults, seed: 42 }, 800, 600)
    const b = createHypnowheelState({ ...defaults, seed: 43 }, 800, 600)
    expect(a.layers.map((l) => l.phase0)).not.toEqual(b.layers.map((l) => l.phase0))
  })
})

describe('headline: M-fold radial symmetry + offset layers, no NaN', () => {
  it('the M arms of a layer are evenly spaced by 2π/M at every radius', () => {
    const state = createHypnowheelState({ ...defaults, arms: 12 }, 800, 600)
    stepHypnowheel(state, 1234) // arbitrary non-zero time — symmetry is time-invariant
    const M = 12
    const step = (Math.PI * 2) / M
    for (const rNorm of [0, 0.37, 1]) {
      const angles = armLeadingAngles(state, 0, rNorm)
      expect(angles).toHaveLength(M)
      for (let a = 1; a < M; a++) {
        // Consecutive arms differ by exactly one sector.
        expect(angles[a] - angles[a - 1]).toBeCloseTo(step, 10)
      }
    }
  })

  it('the layers are rotationally offset from each other (moire is possible)', () => {
    const state = createHypnowheelState({ ...defaults, layers: 3, layerOffset: 8, churn: 2.5 }, 800, 600)
    stepHypnowheel(state, 2000)
    const rots = [0, 1, 2].map((k) => layerRotation(state, k, state.t))
    // No two layers share a rotation → their wedges don't coincide → beat exists.
    expect(rots[0]).not.toBeCloseTo(rots[1], 6)
    expect(rots[1]).not.toBeCloseTo(rots[2], 6)
  })

  it('churn=0 still keeps layers offset via layerOffset alone', () => {
    const state = createHypnowheelState({ ...defaults, layers: 3, layerOffset: 8, churn: 0 }, 800, 600)
    const rots = [0, 1, 2].map((k) => layerRotation(state, k, 5000))
    expect(rots[0]).not.toBeCloseTo(rots[1], 6)
  })

  it('wedge geometry is finite everywhere (no NaN/Infinity)', () => {
    const state = createHypnowheelState({ ...defaults, arms: 40, spiralTightness: 6 }, 1024, 768)
    for (const t of [0, 500, 12000, 24000]) {
      stepHypnowheel(state, t - state.t)
      expect(Number.isFinite(effectiveTurns(state.cfg, state.t))).toBe(true)
      for (let k = 0; k < state.cfg.layers; k++) {
        for (const a of [0, 19, 39]) {
          const pts = wedgePolygon(state, k, a, 512, 384, 380)
          expect(pts.length).toBeGreaterThan(0)
          for (const v of pts) expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
  })
})
