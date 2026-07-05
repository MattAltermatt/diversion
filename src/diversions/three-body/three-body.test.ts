import { describe, it, expect } from 'vitest'
import {
  ORBITS,
  ORBIT_NAMES,
  suvakovState,
  initialState,
  orbitIndexByName,
} from './orbits'
import { makeScratch, rk4Step, energy, momentum } from './integrator'
import threeBody, { cycleOrder } from './index'
import { threeBodySchema } from './schema'
import { make2DContext } from '../../test-setup'

// Integrate an orbit for `periods` full periods with a fine absolute step,
// returning the final state. NOTE: no expect() inside the tight loop (CI-timeout
// gate) — we assert only after the loop returns.
function integrate(y0: Float64Array, T: number, periods: number, dt: number): Float64Array {
  const y = Float64Array.from(y0)
  const scratch = makeScratch()
  const total = T * periods
  const steps = Math.round(total / dt)
  const h = total / steps
  for (let s = 0; s < steps; s++) rk4Step(y, h, scratch)
  return y
}

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('orbits catalogue', () => {
  it('ORBIT_NAMES stays in lockstep with ORBITS', () => {
    expect(ORBITS.map((o) => o.name)).toEqual([...ORBIT_NAMES])
  })

  it('figure-eight leads the catalogue', () => {
    expect(ORBITS[0].name).toBe('Figure-8')
  })

  it('every orbit yields a length-12 initial state', () => {
    for (const o of ORBITS) expect(initialState(o).length).toBe(12)
  })

  it('orbitIndexByName round-trips', () => {
    expect(orbitIndexByName('Figure-8')).toBe(0)
    expect(orbitIndexByName('Bumblebee')).toBe(ORBITS.findIndex((o) => o.name === 'Bumblebee'))
    expect(orbitIndexByName('nope')).toBe(-1)
  })
})

describe('Šuvakov expansion', () => {
  it('gives v3 = -2·v1 and equal v1, v2', () => {
    const vx = 0.30689
    const vy = 0.12551
    const s = suvakovState(vx, vy)
    // velocities: v1 = (s6,s7), v2 = (s8,s9), v3 = (s10,s11)
    expect(s[6]).toBeCloseTo(vx, 12)
    expect(s[7]).toBeCloseTo(vy, 12)
    expect(s[8]).toBeCloseTo(vx, 12)
    expect(s[9]).toBeCloseTo(vy, 12)
    expect(s[10]).toBeCloseTo(-2 * vx, 12)
    expect(s[11]).toBeCloseTo(-2 * vy, 12)
  })

  it('has zero net linear momentum', () => {
    const s = Float64Array.from(suvakovState(0.30689, 0.12551))
    const p = momentum(s)
    expect(Math.abs(p.px)).toBeLessThan(1e-12)
    expect(Math.abs(p.py)).toBeLessThan(1e-12)
  })

  it('positions are r1=(-1,0), r2=(1,0), r3=(0,0)', () => {
    const s = suvakovState(0.2, 0.3)
    expect([s[0], s[1], s[2], s[3], s[4], s[5]]).toEqual([-1, 0, 1, 0, 0, 0])
  })
})

describe('integrator — periodicity & energy conservation', () => {
  const DT = 3e-5 // matches the diversion's absolute step (index.ts DT)

  // Both orbits should return close to their initial condition after one period
  // and conserve total energy across it. Figure-8 is smooth (stable); Butterfly I
  // is linearly unstable with a close approach, so it gets a looser (still small)
  // tolerance. Residuals verified in an offline sweep at this step.
  const cases: { name: string; posTol: number; energyTol: number }[] = [
    { name: 'Figure-8', posTol: 1e-4, energyTol: 1e-6 },
    { name: 'Butterfly I', posTol: 5e-3, energyTol: 1e-3 },
  ]

  for (const c of cases) {
    it(`${c.name}: state returns near the IC after one period`, () => {
      const o = ORBITS[orbitIndexByName(c.name)]
      const ic = initialState(o)
      const final = integrate(ic, o.T, 1, DT)
      const drift = maxAbsDiff(final, ic)
      expect(drift, `${c.name} periodicity drift = ${drift}`).toBeLessThan(c.posTol)
    })

    it(`${c.name}: total energy is conserved over a period`, () => {
      const o = ORBITS[orbitIndexByName(c.name)]
      const ic = initialState(o)
      const e0 = energy(ic)
      // sample energy along the period at a few points; track worst drift, assert after
      const y = Float64Array.from(ic)
      const scratch = makeScratch()
      const steps = Math.round(o.T / DT)
      const h = o.T / steps
      const checkEvery = Math.max(1, Math.floor(steps / 40))
      let worst = 0
      for (let s = 0; s < steps; s++) {
        rk4Step(y, h, scratch)
        if (s % checkEvery === 0) worst = Math.max(worst, Math.abs(energy(y) - e0))
      }
      worst = Math.max(worst, Math.abs(energy(y) - e0))
      expect(worst, `${c.name} energy drift = ${worst}`).toBeLessThan(c.energyTol)
    })
  }

  it('Figure-8 keeps zero momentum over a period', () => {
    const o = ORBITS[0]
    const final = integrate(initialState(o), o.T, 1, DT)
    const p = momentum(final)
    expect(Math.abs(p.px)).toBeLessThan(1e-6)
    expect(Math.abs(p.py)).toBeLessThan(1e-6)
  })
})

describe('frame loop — bounded across an orbit transition', () => {
  it('advances the cycle and keeps every body finite through a fade', () => {
    // Fast cycle: one period per orbit, brisk speed, so ~a couple hundred frames
    // crosses figure-8 → fade → the next choreography. Drive against the mock 2D
    // context; assert AFTER the loop (no expect() in the hot loop / CI-timeout).
    const config = threeBodySchema.parse({
      orbit: 'Cycle all',
      periodsPerOrbit: 1,
      speed: 3,
      seed: 5,
    })
    const ctx = make2DContext() as unknown as CanvasRenderingContext2D
    const state = threeBody.setup(ctx as never, config, { width: 640, height: 480 }) as {
      y: Float64Array
      activeOrbit: number
    }
    const startOrbit = state.activeOrbit
    let allFinite = true
    let t = 0
    for (let i = 0; i < 320; i++) {
      t += 16
      threeBody.frame(state as never, ctx as never, t, 16)
      for (let k = 0; k < 12; k++) {
        if (!Number.isFinite(state.y[k])) allFinite = false
      }
    }
    expect(allFinite, 'a body coordinate went non-finite during the run').toBe(true)
    expect(state.activeOrbit, 'the cycle never advanced to the next orbit').not.toBe(startOrbit)
  })
})

describe('cycle order', () => {
  it('is deterministic for a fixed seed', () => {
    expect(cycleOrder(ORBITS.length, 42)).toEqual(cycleOrder(ORBITS.length, 42))
  })

  it('is a valid permutation with figure-eight (index 0) leading', () => {
    const order = cycleOrder(ORBITS.length, 7)
    expect(order[0]).toBe(0)
    expect([...order].sort((a, b) => a - b)).toEqual(
      Array.from({ length: ORBITS.length }, (_, i) => i),
    )
  })

  it('differs across seeds (shuffles the tail)', () => {
    const a = cycleOrder(ORBITS.length, 1)
    const b = cycleOrder(ORBITS.length, 999)
    expect(a).not.toEqual(b)
  })
})
