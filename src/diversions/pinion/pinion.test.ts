import { describe, it, expect } from 'vitest'
import { pinionSchema, type PinionConfig } from './schema'
import {
  buildGears, meshResidual, solveChildPhase, toothPos, resolveOmega, type Gear,
} from './pinion'

const defaults = (): PinionConfig => pinionSchema.parse({})

describe('pinion schema', () => {
  it('parses with valid defaults', () => {
    const cfg = defaults()
    expect(cfg.gearCount).toBeGreaterThanOrEqual(3)
    expect(cfg.teethMin).toBeGreaterThan(0)
    expect(cfg.teethMax).toBeGreaterThanOrEqual(cfg.teethMin)
    expect(['chain', 'cluster', 'ring']).toContain(cfg.layout)
    expect(['brass', 'solid', 'line']).toContain(cfg.style)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('sliders declare bounds (invariant #4)', () => {
    const shape = pinionSchema.shape
    for (const key of ['gearCount', 'teethMin', 'teethMax', 'fill', 'driveSpeed', 'toothDepth'] as const) {
      const meta = shape[key].meta() as { ui?: string; min?: number; max?: number }
      if (meta.ui === 'slider') {
        expect(typeof meta.min).toBe('number')
        expect(typeof meta.max).toBe('number')
      }
    }
  })
})

describe('pinion determinism', () => {
  it('same seed → identical gear train', () => {
    const a = buildGears(defaults())
    const b = buildGears(defaults())
    expect(a.length).toBe(b.length)
    for (let i = 0; i < a.length; i++) {
      expect(a[i].cx).toBeCloseTo(b[i].cx, 10)
      expect(a[i].cy).toBeCloseTo(b[i].cy, 10)
      expect(a[i].T).toBe(b[i].T)
      expect(a[i].phase0).toBeCloseTo(b[i].phase0, 10)
      expect(a[i].omega).toBeCloseTo(b[i].omega, 10)
    }
  })

  it('different seed → different train', () => {
    const a = buildGears(defaults())
    const b = buildGears({ ...defaults(), seed: 999 })
    const same = a.length === b.length
      && a.every((g, i) => g.cx === b[i].cx && g.cy === b[i].cy && g.T === b[i].T)
    expect(same).toBe(false)
  })

  it('grows the requested number of gears for every layout', () => {
    for (const layout of ['chain', 'cluster', 'ring'] as const) {
      const cfg = { ...defaults(), layout }
      const gears = buildGears(cfg)
      // Layouts may stop early if boxed in, but defaults must place a healthy train.
      expect(gears.length).toBeGreaterThanOrEqual(Math.min(cfg.gearCount, 10))
      expect(gears.length).toBeLessThanOrEqual(cfg.gearCount)
    }
  })
})

// The headline: the meshing must be geometrically + kinematically correct.
describe('pinion meshing correctness', () => {
  const layouts = ['chain', 'cluster', 'ring'] as const

  it('every mesh: centre distance = sum of pitch radii', () => {
    for (const layout of layouts) {
      const gears = buildGears({ ...defaults(), layout })
      for (const g of gears) {
        if (g.parent < 0) continue
        const p = gears[g.parent]
        const d = Math.hypot(g.cx - p.cx, g.cy - p.cy)
        expect(d).toBeCloseTo(p.rp + g.rp, 6)
      }
    }
  })

  it('every mesh: opposite direction, ratio-correct (ω₁·T₁ = −ω₂·T₂)', () => {
    for (const layout of layouts) {
      const gears = buildGears({ ...defaults(), layout })
      for (const g of gears) {
        if (g.parent < 0) continue
        const p = gears[g.parent]
        expect(Math.sign(g.omega)).toBe(-Math.sign(p.omega))
        expect(g.omega * g.T).toBeCloseTo(-(p.omega * p.T), 6)
      }
    }
  })

  it('every mesh: a tooth of one sits in a gap of the other (residual = ½), and holds over time', () => {
    for (const layout of layouts) {
      const gears = buildGears({ ...defaults(), layout })
      for (const t of [0, 1.3, 7.9, -4.2]) {
        for (const g of gears) {
          if (g.parent < 0) continue
          const r = meshResidual(gears[g.parent], g, t)
          // residual is in [0,1); a tooth-into-gap alignment is 0.5
          expect(Math.abs(r - 0.5)).toBeLessThan(1e-6)
        }
      }
    }
  })

  it('non-meshing gears never overlap (tooth tips clear)', () => {
    for (const layout of layouts) {
      const gears = buildGears({ ...defaults(), layout })
      for (let i = 0; i < gears.length; i++) {
        for (let j = i + 1; j < gears.length; j++) {
          const a = gears[i], b = gears[j]
          if (a.parent === b.index || b.parent === a.index) continue // meshing pair: teeth interlock
          const d = Math.hypot(a.cx - b.cx, a.cy - b.cy)
          expect(d).toBeGreaterThanOrEqual(a.rOut + b.rOut - 1e-6)
        }
      }
    }
  })

  it('no NaN in any gear field', () => {
    for (const layout of layouts) {
      const gears = buildGears({ ...defaults(), layout })
      for (const g of gears) {
        for (const v of [g.cx, g.cy, g.rp, g.rOut, g.phase0, g.omega]) {
          expect(Number.isFinite(v)).toBe(true)
        }
        for (let k = 0; k < g.rim.length; k++) expect(Number.isFinite(g.rim[k])).toBe(true)
      }
    }
  })
})

describe('pinion phase solve (unit)', () => {
  it('solveChildPhase puts a parent tooth into a child gap at the mesh line', () => {
    // parent T=20 at phase 0, child T=12, mesh straight to the right (β = 0)
    const beta = 0
    const parentT = 20, childT = 12
    const childPhase = solveChildPhase(parentT, 0, childT, beta)
    const pParent = toothPos(beta, 0, parentT) // parent tooth position at mesh
    const pChild = toothPos(beta + Math.PI, childPhase, childT) // child position at mesh
    const sum = (((pParent + pChild) % 1) + 1) % 1
    expect(sum).toBeCloseTo(0.5, 10)
  })

  it('resolveOmega keeps |ω·T| constant with the root at driveSpeed', () => {
    const gears = buildGears(defaults())
    resolveOmega(gears, 0.7)
    expect(gears[0].omega).toBeCloseTo(0.7, 10) // root turns at exactly driveSpeed
    const invariant = Math.abs(gears[0].omega * gears[0].T)
    for (const g of gears as Gear[]) {
      expect(Math.abs(g.omega * g.T)).toBeCloseTo(invariant, 6)
    }
  })
})
