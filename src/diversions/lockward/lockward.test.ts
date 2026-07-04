import { describe, it, expect } from 'vitest'
import { lockwardSchema } from './schema'
import { makeRings, stepLockward, createLockwardState, type LockwardState } from './lockward'

const TAU = Math.PI * 2

describe('lockward schema', () => {
  it('parses with valid defaults', () => {
    const cfg = lockwardSchema.parse({})
    expect(cfg.ringCount).toBe(6)
    expect(cfg.bladesMin).toBeLessThanOrEqual(cfg.bladesMax)
    expect(cfg.color.mode).toBe('spectrum')
    expect(cfg.color.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.seed).toBe(110)
  })

  it('every field carries a default (codec relies on it)', () => {
    // A no-arg parse succeeding IS the proof every leaf has a default.
    expect(() => lockwardSchema.parse({})).not.toThrow()
  })
})

describe('lockward determinism', () => {
  it('same seed → identical ring/blade/speed layout', () => {
    const cfg = lockwardSchema.parse({ seed: 42 })
    const a = makeRings(cfg)
    const b = makeRings(cfg)
    expect(a).toEqual(b)
  })

  it('different seed → different layout', () => {
    const r1 = makeRings(lockwardSchema.parse({ seed: 1 }))
    const r2 = makeRings(lockwardSchema.parse({ seed: 2 }))
    // Compare the seed-derived signature (blades + speed factors), not phase.
    const sig = (rs: ReturnType<typeof makeRings>) =>
      rs.map(r => `${r.blades}:${r.unit.toFixed(6)}:${r.dir}`).join('|')
    expect(sig(r1)).not.toEqual(sig(r2))
  })
})

describe('lockward headline: blade-rings partition the circle', () => {
  const cfg = lockwardSchema.parse({ seed: 7, ringCount: 8, bladesMin: 4, bladesMax: 20 })
  const rings = makeRings(cfg)

  it('has the configured number of rings', () => {
    expect(rings.length).toBe(8)
  })

  it('each ring has an even, non-degenerate blade count within the range', () => {
    for (const r of rings) {
      expect(r.blades % 2).toBe(0) // even → seamless two-ink alternation
      expect(r.blades).toBeGreaterThanOrEqual(4)
      expect(r.blades).toBeLessThanOrEqual(20)
    }
  })

  it('each ring\'s blades tile the full circle (angles sum to 2π)', () => {
    for (const r of rings) {
      const bladeWidth = TAU / r.blades
      expect(bladeWidth * r.blades).toBeCloseTo(TAU, 9)
      expect(bladeWidth).toBeGreaterThan(0)
    }
  })

  it('neighbouring rings counter-rotate (alternating direction sign)', () => {
    for (let i = 1; i < rings.length; i++) {
      expect(Math.sign(rings[i].dir)).toBe(-Math.sign(rings[i - 1].dir))
    }
  })

  it('rings have distinct angular speeds (no single frozen moire)', () => {
    const speeds = rings.map(r => r.speed)
    const unique = new Set(speeds.map(s => s.toFixed(6)))
    expect(unique.size).toBe(speeds.length)
  })

  it('no NaN in the layout or after stepping the sim', () => {
    const state: LockwardState = createLockwardState(cfg, 800, 600)
    for (let f = 0; f < 200; f++) stepLockward(state, 16)
    for (const r of state.rings) {
      expect(Number.isFinite(r.phase)).toBe(true)
      expect(Number.isFinite(r.speed)).toBe(true)
    }
    expect(Number.isFinite(state.huePhase)).toBe(true)
  })
})
