import { describe, it, expect } from 'vitest'
import { fuzzyflakesSchema, type FuzzyflakesConfig } from './schema'
import {
  createFlakes,
  stepFlakes,
  armAngles,
  buildArm,
  TAU,
  type Flake,
} from './fuzzyflakes'

const defaults = (): FuzzyflakesConfig => fuzzyflakesSchema.parse({})

const allFinite = (f: Flake) =>
  Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.size) && Number.isFinite(f.rot)

describe('fuzzyflakes schema', () => {
  it('parses with valid defaults', () => {
    const cfg = defaults()
    expect(cfg.arms).toBe(6)
    expect(cfg.flakeCount).toBeGreaterThan(0)
    expect(cfg.sizeMin).toBeLessThan(cfg.sizeMax)
    expect(cfg.palette).toBe('frost')
    // every default must survive the schema round-trip
    expect(fuzzyflakesSchema.parse(cfg)).toEqual(cfg)
  })
})

describe('determinism', () => {
  it('same seed → identical flake set', () => {
    const cfg = defaults()
    const a = createFlakes(cfg, 800, 600)
    const b = createFlakes(cfg, 800, 600)
    expect(a).toEqual(b)
  })

  it('different seed → different flake set', () => {
    const a = createFlakes({ ...defaults(), seed: 1 }, 800, 600)
    const b = createFlakes({ ...defaults(), seed: 2 }, 800, 600)
    expect(a).not.toEqual(b)
  })

  it('returns flakeCount flakes, all within size bounds, sorted small→large', () => {
    const cfg = { ...defaults(), flakeCount: 60, sizeMin: 12, sizeMax: 70 }
    const flakes = createFlakes(cfg, 800, 600)
    expect(flakes).toHaveLength(60)
    for (const f of flakes) {
      expect(f.size).toBeGreaterThanOrEqual(12)
      expect(f.size).toBeLessThanOrEqual(70)
    }
    for (let i = 1; i < flakes.length; i++) {
      expect(flakes[i].size).toBeGreaterThanOrEqual(flakes[i - 1].size)
    }
  })
})

describe('headline: K-fold symmetry', () => {
  it('arm angles are evenly spaced by 2π/K for every K', () => {
    for (let k = 3; k <= 8; k++) {
      const rot = 0.37
      const angles = armAngles(k, rot)
      expect(angles).toHaveLength(k)
      const expectedStep = TAU / k
      for (let i = 1; i < k; i++) {
        expect(angles[i] - angles[i - 1]).toBeCloseTo(expectedStep, 10)
      }
      // first arm carries the flake's own rotation
      expect(angles[0]).toBeCloseTo(rot, 10)
    }
  })

  it('every arm-style geometry is finite (no NaN)', () => {
    for (const style of ['stem', 'dotted', 'crystal'] as const) {
      const arm = buildArm(40, style)
      for (const s of arm.segments) for (const v of s) expect(Number.isFinite(v)).toBe(true)
      for (const d of arm.dots) for (const v of d) expect(Number.isFinite(v)).toBe(true)
      // dotted is a bead row; stem/crystal are stroked segments
      if (style === 'dotted') expect(arm.dots.length).toBeGreaterThan(0)
      else expect(arm.segments.length).toBeGreaterThan(0)
    }
  })
})

describe('drift + wrap', () => {
  it('flakes drift and wrap, staying bounded and finite over many steps', () => {
    const cfg = { ...defaults(), driftSpeed: 1, rotateSpeed: 1 }
    const w = 800
    const h = 600
    const flakes = createFlakes(cfg, w, h)
    const maxSize = Math.max(...flakes.map((f) => f.size))
    const bound = maxSize * 1.6 + 2 // wrap margin + slack
    // ~30s of sim at 16ms — without wrapping a driftSpeed=1 breeze runs off-screen
    for (let i = 0; i < 2000; i++) {
      stepFlakes(flakes, cfg, w, h, 16)
      for (const f of flakes) {
        expect(allFinite(f)).toBe(true)
      }
    }
    for (const f of flakes) {
      expect(f.y).toBeGreaterThanOrEqual(-bound)
      expect(f.y).toBeLessThanOrEqual(h + bound)
      expect(f.x).toBeGreaterThanOrEqual(-bound)
      expect(f.x).toBeLessThanOrEqual(w + bound)
    }
  })

  it('a flake pushed past the bottom edge wraps to the top', () => {
    const cfg = { ...defaults(), driftSpeed: 1, rotateSpeed: 0 }
    const w = 800
    const h = 600
    const size = 30
    // start just past the bottom wrap threshold (h + size*1.6) so one step wraps it
    const f: Flake = { x: 400, y: h + size * 1.6 + 2, size, rot: 0, rotDir: 1, vxJit: 0, colorIndex: 0 }
    stepFlakes([f], cfg, w, h, 16)
    expect(f.y).toBeLessThan(0)
  })

  it('driftSpeed 0 → flakes hold position (only rotation)', () => {
    const cfg = { ...defaults(), driftSpeed: 0, rotateSpeed: 0.5 }
    const flakes = createFlakes(cfg, 800, 600)
    const before = flakes.map((f) => ({ x: f.x, y: f.y }))
    stepFlakes(flakes, cfg, 800, 600, 16)
    flakes.forEach((f, i) => {
      expect(f.x).toBeCloseTo(before[i].x, 10)
      expect(f.y).toBeCloseTo(before[i].y, 10)
    })
  })
})
