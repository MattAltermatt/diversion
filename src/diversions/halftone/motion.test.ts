import { describe, it, expect } from 'vitest'
import { halftoneSchema } from './schema'
import { seedMasses, stepMasses, fieldAt, applyStrength } from './motion'

const cfg = halftoneSchema.parse({})
const ASPECT = 16 / 9

describe('halftone mass seeding is deterministic', () => {
  it('same seed → identical mass set', () => {
    const a = seedMasses(cfg, ASPECT)
    const b = seedMasses(cfg, ASPECT)
    expect(a).toEqual(b)
    expect(a).toHaveLength(cfg.massCount)
  })

  it('different seed → different mass set', () => {
    const a = seedMasses({ ...cfg, seed: 1 }, ASPECT)
    const b = seedMasses({ ...cfg, seed: 2 }, ASPECT)
    expect(a).not.toEqual(b)
  })

  it('strength derives from massStrength × seeded fraction', () => {
    const masses = seedMasses(cfg, ASPECT)
    for (const m of masses) {
      expect(m.strength).toBeCloseTo(cfg.massStrength * m.strengthFrac, 10)
    }
    // live re-tune without a reseed keeps the same fractions
    applyStrength(masses, { ...cfg, massStrength: 0.5 })
    for (const m of masses) expect(m.strength).toBeCloseTo(0.5 * m.strengthFrac, 10)
  })
})

describe('halftone field', () => {
  it('is higher near a mass than far away', () => {
    const masses = seedMasses(cfg, ASPECT)
    const m = masses[0]
    const near = fieldAt(masses, m.x, m.y, cfg.spread)
    const far = fieldAt(masses, m.x + 100, m.y + 100, cfg.spread)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThanOrEqual(0)
  })

  it('grows monotonically as you approach a single mass', () => {
    const single = seedMasses({ ...cfg, massCount: 2 }, ASPECT).slice(0, 1)
    const m = single[0]
    const close = fieldAt(single, m.x + 0.05, m.y, cfg.spread)
    const mid = fieldAt(single, m.x + 0.4, m.y, cfg.spread)
    const away = fieldAt(single, m.x + 2.0, m.y, cfg.spread)
    expect(close).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(away)
  })
})

describe('halftone motion step', () => {
  it('advances sim time and stays finite + bounded', () => {
    const masses = seedMasses(cfg, ASPECT)
    // orbit stays within |centre| + radius of its seeded orbit — comfortably inside
    // this generous world box regardless of how long it runs.
    const bound = ASPECT + 1
    let t = 0
    for (let i = 0; i < 5000; i++) {
      t = stepMasses(masses, cfg, 16.7, t)
      for (const m of masses) {
        expect(Number.isFinite(m.x)).toBe(true)
        expect(Number.isFinite(m.y)).toBe(true)
        expect(Math.abs(m.x)).toBeLessThan(bound)
        expect(Math.abs(m.y)).toBeLessThan(bound)
      }
    }
    expect(Number.isFinite(t)).toBe(true)
    expect(t).toBeLessThan(1e4) // wrapped, never unbounded
  })

  it('is frozen at speed 0', () => {
    const masses = seedMasses(cfg, ASPECT)
    const x0 = masses.map((m) => m.x)
    let t = 0
    for (let i = 0; i < 10; i++) t = stepMasses(masses, { ...cfg, speed: 0 }, 16.7, t)
    masses.forEach((m, i) => expect(m.x).toBeCloseTo(x0[i], 10))
    expect(t).toBe(0)
  })
})
