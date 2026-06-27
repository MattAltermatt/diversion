import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../flow-field/noise'
import { gravityWellsSchema } from './schema'
import {
  spawnWell, wellEnvelope, maintainWells, accelAt,
  createGravityState, respawnParticle, outOfBounds, colorT, fieldAt,
  BOUNDS_MARGIN, type Well, type Particle, type GravityState,
} from './gravityWells'

const cfg = gravityWellsSchema.parse({})

describe('spawnWell', () => {
  it('places the well in-bounds with force inside [forceMin, forceMax]', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 50; i++) {
      const wl = spawnWell(rng, cfg, 800, 600)
      expect(wl.x).toBeGreaterThanOrEqual(0)
      expect(wl.x).toBeLessThanOrEqual(800)
      expect(wl.force).toBeGreaterThanOrEqual(cfg.forceMin - 1e-9)
      expect(wl.force).toBeLessThanOrEqual(cfg.forceMax + 1e-9)
      expect(wl.life).toBeGreaterThan(0)
    }
  })
})

describe('wellEnvelope', () => {
  it('is 0 at birth, ~1 mid-life, and 0 at the very end', () => {
    const wl: Well = { x: 0, y: 0, force: 1, age: 0, life: 10000, fade: 1000 }
    expect(wellEnvelope({ ...wl, age: 0 })).toBeCloseTo(0, 2)
    expect(wellEnvelope({ ...wl, age: 5000 })).toBeCloseTo(1, 2)
    expect(wellEnvelope({ ...wl, age: 10000 })).toBeCloseTo(0, 2)
  })
})

describe('maintainWells', () => {
  it('fills the pool up to maxWells and replaces expired wells', () => {
    const rng = mulberry32(2)
    const wells: Well[] = []
    maintainWells(wells, 16, rng, cfg, 800, 600)
    expect(wells.length).toBe(cfg.maxWells)
    for (const wl of wells) wl.age = wl.life + 1
    maintainWells(wells, 16, rng, cfg, 800, 600)
    expect(wells.length).toBe(cfg.maxWells)
    expect(wells.every((wl) => wl.age < wl.life)).toBe(true)
  })
  it('trims the pool when maxWells shrinks', () => {
    const rng = mulberry32(3)
    const wells: Well[] = []
    maintainWells(wells, 16, rng, cfg, 800, 600)
    maintainWells(wells, 16, rng, { ...cfg, maxWells: 2 }, 800, 600)
    expect(wells.length).toBe(2)
  })
})

describe('accelAt (gravity bend vector)', () => {
  it('an attractor (force>0) points toward the well', () => {
    const wells = [{ x: 100, y: 0, force: 1, age: 5000, life: 10000, fade: 100 }]
    const { ax } = accelAt(0, 0, wells) // well to the right → ax > 0
    expect(ax).toBeGreaterThan(0)
  })
  it('a repulsor (force<0) points away from the well', () => {
    const wells = [{ x: 100, y: 0, force: -1, age: 5000, life: 10000, fade: 100 }]
    const { ax } = accelAt(0, 0, wells)
    expect(ax).toBeLessThan(0)
  })
  it('stays finite at the singularity (particle on the well) via softening', () => {
    const wells = [{ x: 0, y: 0, force: 2, age: 5000, life: 10000, fade: 100 }]
    const { ax, ay } = accelAt(0, 0, wells)
    expect(Number.isFinite(ax)).toBe(true)
    expect(Number.isFinite(ay)).toBe(true)
  })
})

function stateWith(over: Partial<GravityState['cfg']> = {}, wells: Well[] = []): GravityState {
  const s = createGravityState({ ...cfg, ...over }, 800, 600)
  s.wells = wells
  return s
}

describe('fieldAt (noise ⊕ gravity, 1st-order)', () => {
  it('returns a unit direction vector', () => {
    const s = stateWith()
    const f = fieldAt(s, 400, 300)
    expect(Math.hypot(f.dx, f.dy)).toBeCloseTo(1, 5)
  })
  it('with gravityInfluence 0 it ignores the wells (pure flow field)', () => {
    const wells: Well[] = [{ x: 410, y: 300, force: 2, age: 5000, life: 10000, fade: 100 }]
    const a = fieldAt(stateWith({ gravityInfluence: 0 }, wells), 0, 300)
    const b = fieldAt(stateWith({ gravityInfluence: 0 }, []), 0, 300)
    expect(a.dx).toBeCloseTo(b.dx, 10)
    expect(a.dy).toBeCloseTo(b.dy, 10)
  })
  it('an attractor bends the field toward the well (vs the same flow with no well)', () => {
    // well directly to the right of the particle; the bend should rotate the
    // field rightward relative to the pure-noise flow at the same point.
    const wells: Well[] = [{ x: 700, y: 300, force: 2, age: 5000, life: 10000, fade: 100 }]
    const withWell = fieldAt(stateWith({ gravityInfluence: 2 }, wells), 400, 300)
    const noWell = fieldAt(stateWith({ gravityInfluence: 2 }, []), 400, 300)
    expect(withWell.dx).toBeGreaterThan(noWell.dx)
  })
  it('reports higher bend strength nearer a well', () => {
    const wells: Well[] = [{ x: 400, y: 300, force: 2, age: 5000, life: 10000, fade: 100 }]
    const near = fieldAt(stateWith({}, wells), 420, 300).strength
    const far = fieldAt(stateWith({}, wells), 50, 50).strength
    expect(near).toBeGreaterThan(far)
  })
})

describe('createGravityState', () => {
  it('is deterministic: same seed → identical particle layout', () => {
    const a = createGravityState(cfg, 800, 600)
    const b = createGravityState(cfg, 800, 600)
    expect(a.particles.map((p) => [p.x, p.y])).toEqual(b.particles.map((p) => [p.x, p.y]))
  })
  it('different seed → different layout', () => {
    const a = createGravityState(cfg, 800, 600)
    const b = createGravityState({ ...cfg, seed: cfg.seed + 1 }, 800, 600)
    expect(a.particles[0].x).not.toBe(b.particles[0].x)
  })
  it('starts with a full well pool', () => {
    expect(createGravityState(cfg, 800, 600).wells.length).toBe(cfg.maxWells)
  })
})

describe('respawnParticle', () => {
  it('reseeds position in-bounds and resets the age timer', () => {
    const p: Particle = { x: 9999, y: 9999, age: 50, life: 60, ci: 3 }
    respawnParticle(p, mulberry32(5), 800, 600)
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.x).toBeLessThanOrEqual(800)
    expect(p.age).toBe(0)
    expect(p.life).toBeGreaterThan(0)
  })
})

describe('outOfBounds (padded box)', () => {
  it('a particle just past the visible edge is NOT recycled', () => {
    expect(outOfBounds({ x: 820, y: 300, age: 0, life: 1, ci: 0 }, 800, 600)).toBe(false)
  })
  it('a particle well outside the padded box IS recycled', () => {
    const far = 800 * (1 + BOUNDS_MARGIN) + 10
    expect(outOfBounds({ x: far, y: 300, age: 0, life: 1, ci: 0 }, 800, 600)).toBe(true)
  })
})

describe('colorT', () => {
  it('field source maps bend strength to 0..1', () => {
    const p: Particle = { x: 0, y: 0, age: 0, life: 1, ci: 0 }
    expect(colorT('field', p, 0, 0, 800, 600)).toBeCloseTo(0, 5)
    expect(colorT('field', p, 0, 1, 800, 600)).toBeCloseTo(1, 5)
  })
  it('flow-angle source is cyclic in 0..1', () => {
    const p: Particle = { x: 0, y: 0, age: 0, life: 1, ci: 0 }
    expect(colorT('flow-angle', p, 0, 0, 800, 600)).toBeCloseTo(0, 5)
    expect(colorT('flow-angle', p, Math.PI, 0, 800, 600)).toBeCloseTo(0.5, 5)
  })
})
