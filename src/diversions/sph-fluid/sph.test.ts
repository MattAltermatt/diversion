import { describe, it, expect } from 'vitest'
import { createFluid, stepFluidFixed, BOX_H, type SphParams } from './sph'

const boxW = BOX_H * (16 / 9)

// The schema defaults map (via index.ts deriveParams) to roughly these physics —
// the deep, calm, glossy pool that is the headline look. The headline probe below
// asserts that this configuration is STABLE and COHESIVE, not an explosion.
const DEFAULT_PARAMS: SphParams = { stiffness: 54000, viscosity: 33, gravity: 140, tiltAngle: 0 }

describe('sph-fluid determinism', () => {
  it('same seed → identical particle positions after N steps', () => {
    const a = createFluid(500, 777, boxW, BOX_H)
    const b = createFluid(500, 777, boxW, BOX_H)
    stepFluidFixed(a, DEFAULT_PARAMS, 120)
    stepFluidFixed(b, DEFAULT_PARAMS, 120)
    for (let i = 0; i < a.n; i++) {
      expect(a.px[i]).toBe(b.px[i])
      expect(a.py[i]).toBe(b.py[i])
    }
  })

  it('different seed → a different layout', () => {
    const a = createFluid(500, 1, boxW, BOX_H)
    const b = createFluid(500, 2, boxW, BOX_H)
    stepFluidFixed(a, DEFAULT_PARAMS, 60)
    stepFluidFixed(b, DEFAULT_PARAMS, 60)
    let diff = 0
    for (let i = 0; i < a.n; i++) {
      if (a.px[i] !== b.px[i] || a.py[i] !== b.py[i]) diff++
    }
    expect(diff).toBeGreaterThan(a.n * 0.9)
  })
})

describe('sph-fluid headline: stable, bounded, cohesive pool', () => {
  it('settles into a pool — no explosion, stays in the tank, denser at the bottom', () => {
    const count = 900
    const fluid = createFluid(count, 4218, boxW, BOX_H)
    // Level tank (tiltAngle 0) so it truly settles; run well past the splash.
    // (Kept modest so the SPH loop stays well under the 5s CI test timeout.)
    stepFluidFixed(fluid, DEFAULT_PARAMS, 1500)

    // (1) no NaN / Inf anywhere.
    let nan = 0
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(fluid.px[i]) || !Number.isFinite(fluid.py[i])
        || !Number.isFinite(fluid.vx[i]) || !Number.isFinite(fluid.vy[i])) nan++
    }
    expect(nan).toBe(0)

    // (2) every particle stays inside the container.
    let outside = 0
    let maxSpeed = 0
    let meanKE = 0
    for (let i = 0; i < count; i++) {
      if (fluid.px[i] < -1 || fluid.px[i] > boxW + 1 || fluid.py[i] < -1 || fluid.py[i] > BOX_H + 1) outside++
      const sp = fluid.speed[i]
      if (sp > maxSpeed) maxSpeed = sp
      meanKE += sp * sp
    }
    meanKE /= count
    expect(outside).toBe(0)

    // (3) kinetic energy is bounded — a settled pool, not a runaway (an explosion
    //     pegs every particle at the velocity clamp → meanKE ~ VMAX² ≈ 3.3e6).
    expect(meanKE).toBeLessThan(30000)
    expect(maxSpeed).toBeLessThan(600)

    // (4) it POOLS: the bottom fifth of particles is markedly denser than the top.
    const ys = Array.from({ length: count }, (_, i) => ({ y: fluid.py[i], rho: fluid.rho[i] }))
    ys.sort((p, q) => p.y - q.y)
    const seg = Math.floor(count * 0.2)
    const avg = (arr: { rho: number }[]) => arr.reduce((s, o) => s + o.rho, 0) / arr.length
    const topRho = avg(ys.slice(0, seg)) // small y = top of the tank
    const botRho = avg(ys.slice(-seg)) // large y = the floor
    expect(botRho).toBeGreaterThan(topRho * 1.5)
  }, 30000)
})
