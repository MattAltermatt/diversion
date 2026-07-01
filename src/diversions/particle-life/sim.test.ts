import { describe, it, expect } from 'vitest'
import { createSim, stepSim, WORLD_W, WORLD_H, type SimConfig } from './sim'

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  count: 400, colors: 5, seed: 1337, rMax: 80, beta: 0.3,
  forceScale: 1, friction: 0.04, symmetry: 'Asymmetric', attractBias: 0.1, ...over,
})

const run = (c: SimConfig, steps: number) => {
  const s = createSim(c)
  for (let i = 0; i < steps; i++) stepSim(s)
  return s
}

describe('particle-life sim', () => {
  it('is deterministic: same seed + config → identical positions after N steps', () => {
    const a = run(cfg(), 50)
    const b = run(cfg(), 50)
    expect(Array.from(a.px)).toEqual(Array.from(b.px))
    expect(Array.from(a.py)).toEqual(Array.from(b.py))
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx))
  })

  it('a different seed diverges', () => {
    const a = run(cfg({ seed: 1 }), 50)
    const b = run(cfg({ seed: 2 }), 50)
    expect(Array.from(a.px)).not.toEqual(Array.from(b.px))
  })

  it('keeps every particle finite and inside the toroidal world', () => {
    const s = run(cfg({ count: 800 }), 120)
    for (let i = 0; i < s.n; i++) {
      expect(Number.isFinite(s.px[i])).toBe(true)
      expect(Number.isFinite(s.py[i])).toBe(true)
      expect(Number.isFinite(s.vx[i])).toBe(true)
      expect(s.px[i]).toBeGreaterThanOrEqual(0)
      expect(s.px[i]).toBeLessThan(WORLD_W)
      expect(s.py[i]).toBeGreaterThanOrEqual(0)
      expect(s.py[i]).toBeLessThan(WORLD_H)
    }
  })

  it('initial species indices are within [0, colors)', () => {
    const s = createSim(cfg({ colors: 8 }))
    for (let i = 0; i < s.n; i++) expect(s.type[i]).toBeLessThan(8)
  })

  it('actually moves particles (forces do work)', () => {
    const s0 = createSim(cfg())
    const x0 = Float32Array.from(s0.px)
    for (let i = 0; i < 30; i++) stepSim(s0)
    let moved = 0
    for (let i = 0; i < s0.n; i++) if (Math.abs(s0.px[i] - x0[i]) > 1e-3) moved++
    expect(moved).toBeGreaterThan(s0.n * 0.5)
  })
})
