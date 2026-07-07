import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { gravityWellsSchema } from './schema'
import {
  spawnWell, wellEnvelope, wellForce, maintainWells, accelAt,
  createGravityState, respawnParticle, outOfBounds, colorT, fieldAt, fieldStrength,
  BOUNDS_MARGIN, type Well, type Particle, type GravityState,
} from './gravityWells'
import gravityWells from './index'

const cfg = gravityWellsSchema.parse({})

describe('spawnWell', () => {
  it('places the well in-bounds and starts its force at the floor', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 50; i++) {
      const wl = spawnWell(rng, cfg, 800, 600)
      expect(wl.x).toBeGreaterThanOrEqual(0)
      expect(wl.x).toBeLessThanOrEqual(800)
      expect(wl.force).toBeCloseTo(cfg.forceMin, 9) // ramps up from here over its life
      expect(wl.life).toBeGreaterThan(0)
    }
  })
})

describe('wellEnvelope', () => {
  it('is 0 at birth, ~1 mid-life, and 0 at the very end', () => {
    const wl: Well = { x: 0, y: 0, force: 1, age: 0, life: 10000 }
    expect(wellEnvelope({ ...wl, age: 0 })).toBeCloseTo(0, 2)
    expect(wellEnvelope({ ...wl, age: 5000 })).toBeCloseTo(1, 2)
    expect(wellEnvelope({ ...wl, age: 10000 })).toBeCloseTo(0, 2)
  })
})

describe('wellForce', () => {
  it('ramps forceMin → forceMax → forceMin across the well life', () => {
    const wl: Well = { x: 0, y: 0, force: 0, age: 0, life: 10000 }
    expect(wellForce({ ...wl, age: 0 }, cfg)).toBeCloseTo(cfg.forceMin, 5)
    expect(wellForce({ ...wl, age: 5000 }, cfg)).toBeCloseTo(cfg.forceMax, 5)
    expect(wellForce({ ...wl, age: 10000 }, cfg)).toBeCloseTo(cfg.forceMin, 5)
  })
  it('never goes negative (attract-only)', () => {
    const wl: Well = { x: 0, y: 0, force: 0, age: 2500, life: 10000 }
    expect(wellForce(wl, cfg)).toBeGreaterThanOrEqual(0)
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
    const wells = [{ x: 100, y: 0, force: 1, age: 5000, life: 10000 }]
    const { ax } = accelAt(0, 0, wells) // well to the right → ax > 0
    expect(ax).toBeGreaterThan(0)
  })
  it('a repulsor (force<0) points away from the well', () => {
    const wells = [{ x: 100, y: 0, force: -1, age: 5000, life: 10000 }]
    const { ax } = accelAt(0, 0, wells)
    expect(ax).toBeLessThan(0)
  })
  it('stays finite at the singularity (particle on the well) via softening', () => {
    const wells = [{ x: 0, y: 0, force: 2, age: 5000, life: 10000 }]
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
    const wells: Well[] = [{ x: 410, y: 300, force: 2, age: 5000, life: 10000 }]
    const a = fieldAt(stateWith({ gravityInfluence: 0 }, wells), 0, 300)
    const b = fieldAt(stateWith({ gravityInfluence: 0 }, []), 0, 300)
    expect(a.dx).toBeCloseTo(b.dx, 10)
    expect(a.dy).toBeCloseTo(b.dy, 10)
  })
  it('a strong nearby attractor (swirl 0) makes the flow point toward it', () => {
    // well close to the right; with no swirl the radial pull dominates the faint
    // floor, so the flow points almost straight at the well regardless of noise.
    const wells: Well[] = [{ x: 700, y: 300, force: 2, age: 5000, life: 10000 }]
    const f = fieldAt(stateWith({ gravityInfluence: 2, swirl: 0 }, wells), 650, 300)
    expect(f.dx).toBeGreaterThan(0.9)
  })
  it('swirl turns radial pull into tangential orbit', () => {
    // well directly to the right (dy=0): pure radial bends the flow only in x;
    // pure swirl bends it perpendicular, so |dy| grows with swirl.
    const wells: Well[] = [{ x: 700, y: 300, force: 2, age: 5000, life: 10000 }]
    const radial = fieldAt(stateWith({ gravityInfluence: 2, swirl: 0 }, wells), 650, 300)
    const orbit = fieldAt(stateWith({ gravityInfluence: 2, swirl: 1 }, wells), 650, 300)
    expect(Math.abs(orbit.dy)).toBeGreaterThan(Math.abs(radial.dy))
  })
  it('reports higher bend strength nearer a well', () => {
    // strength falls off with distance; the tonemap (fieldStrength) keeps near vs
    // far distinct at any influence — no clamp to dodge anymore (#46).
    const wells: Well[] = [{ x: 400, y: 300, force: 1, age: 5000, life: 10000 }]
    const near = fieldAt(stateWith({ gravityInfluence: 0.3 }, wells), 650, 300).strength
    const far = fieldAt(stateWith({ gravityInfluence: 0.3 }, wells), 50, 300).strength
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

describe('fieldStrength (tonemap, not hard clamp)', () => {
  it('is 0 at no bend and stays within [0,1)', () => {
    expect(fieldStrength(0)).toBe(0)
    expect(fieldStrength(1000)).toBeLessThan(1)
    expect(fieldStrength(1000)).toBeGreaterThan(0)
  })
  it('is strictly monotonic — never flat-saturates', () => {
    // the bug was min(1,h): h>1 all mapped to exactly 1. A tonemap keeps every
    // step distinct, so a strong field still spreads across the gradient.
    expect(fieldStrength(2)).toBeGreaterThan(fieldStrength(1))
    expect(fieldStrength(5)).toBeGreaterThan(fieldStrength(2))
    expect(fieldStrength(20)).toBeGreaterThan(fieldStrength(5))
    expect(fieldStrength(5)).toBeLessThan(1) // would be 1 (clamped) under the old map
  })
})

describe('gravity-wells live palette update (#270 — new colours get used)', () => {
  const size = { width: 800, height: 600 }

  // Mirror the diversion's setup(): build a live state and spread each
  // particle's colour index across the palette length.
  function makeState(startCfg: typeof cfg): GravityState & { styles: string[]; gradientLUT: string[] } {
    const base = createGravityState(startCfg, size.width, size.height)
    const styles = startCfg.color.colors.length ? startCfg.color.colors : ['#ffffffff']
    const state = { ...base, styles, gradientLUT: [] as string[] }
    for (const p of state.particles) p.ci = Math.floor(base.rng() * styles.length)
    return state
  }

  it('re-spreads particle colour indices when the palette grows so added colours are referenced', () => {
    const startCfg = gravityWellsSchema.parse({
      particles: 500,
      color: { colors: ['#ff0000ff', '#00ff00ff'] }, // 2-colour palette
    })
    const state = makeState(startCfg)
    // baseline: every index sits inside the old 2-colour range
    expect(state.particles.every((p) => p.ci < 2)).toBe(true)

    const grown = {
      ...startCfg,
      color: { ...startCfg.color, colors: [...startCfg.color.colors, '#0000ffff', '#ffff00ff', '#00ffffff'] },
    }
    const applied = gravityWells.update!(state, grown, size)
    expect(applied).toBe(true)
    // at least one particle now points at an index that only exists in the new palette
    expect(state.particles.some((p) => p.ci >= 2)).toBe(true)
    // and none escapes the new length
    expect(state.particles.every((p) => p.ci < 5)).toBe(true)
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
