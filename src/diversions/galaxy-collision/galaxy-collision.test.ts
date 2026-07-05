import { describe, it, expect } from 'vitest'
import {
  initSim, step, coreEnergy, coreMomentum, coreSeparation, frameExtent,
  DISK_R, INITIAL_SEP, type PhysicsConfig,
} from './physics'
import { galaxyCollisionSchema } from './schema'
import { galaxyCollisionPresets } from './presets'

const CFG: PhysicsConfig = {
  starCount: 2000,
  seed: 12345,
  coreMass: 1,
  softening: 0.12,
  impactParameter: 0.9,
  approachSpeed: 0.55,
  retrograde: false,
}

describe('galaxy-collision physics', () => {
  it('is deterministic: same seed → identical initial state', () => {
    const a = initSim(CFG)
    const b = initSim(CFG)
    expect(a.n).toBe(b.n)
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))
    expect(Array.from(a.vx)).toEqual(Array.from(b.vx))
    expect(Array.from(a.vy)).toEqual(Array.from(b.vy))
    expect(Array.from(a.gal)).toEqual(Array.from(b.gal))
  })

  it('a different seed → a different layout', () => {
    const a = initSim(CFG)
    const b = initSim({ ...CFG, seed: 999 })
    // at least one star position must differ
    let differs = false
    for (let i = 0; i < a.n && !differs; i++) {
      if (a.x[i] !== b.x[i] || a.y[i] !== b.y[i]) differs = true
    }
    expect(differs).toBe(true)
  })

  it('splits stars into two galaxies, each around its own core', () => {
    const s = initSim(CFG)
    expect(s.nA).toBe(Math.ceil(s.n / 2))
    // every star sits within the disk radius of its parent core (bounded radii).
    let maxR = 0
    for (let i = 0; i < s.n; i++) {
      const g = s.gal[i]
      const dx = s.x[i] - s.cx[g]
      const dy = s.y[i] - s.cy[g]
      const r = Math.hypot(dx, dy)
      if (r > maxR) maxR = r
    }
    expect(maxR).toBeLessThanOrEqual(DISK_R * 1.001)
  })

  it('disk velocities are near-tangential (cold disk) about the parent core', () => {
    const s = initSim(CFG)
    // radial velocity component (relative to the parent core's bulk motion) should
    // be ~0. Track the worst radial fraction in a local — no expect() in the loop.
    let worstRadialFrac = 0
    for (let i = 0; i < s.n; i++) {
      const g = s.gal[i]
      const rx = s.x[i] - s.cx[g]
      const ry = s.y[i] - s.cy[g]
      const rlen = Math.hypot(rx, ry)
      if (rlen < 1e-6) continue
      const relvx = s.vx[i] - s.cvx[g]
      const relvy = s.vy[i] - s.cvy[g]
      const speed = Math.hypot(relvx, relvy)
      if (speed < 1e-9) continue
      const vRadial = Math.abs((relvx * rx + relvy * ry) / rlen)
      const frac = vRadial / speed
      if (frac > worstRadialFrac) worstRadialFrac = frac
    }
    // purely tangential by construction → radial component is numerical dust
    expect(worstRadialFrac).toBeLessThan(1e-4)
  })

  it('retrograde flips galaxy B spin but leaves galaxy A alone', () => {
    const pro = initSim(CFG)
    const retro = initSim({ ...CFG, retrograde: true })
    // galaxy A (index < nA) velocities are unchanged; galaxy B differ (spin flipped)
    let aSame = true
    for (let i = 0; i < pro.nA; i++) {
      if (pro.vx[i] !== retro.vx[i] || pro.vy[i] !== retro.vy[i]) { aSame = false; break }
    }
    let bDiffers = false
    for (let i = pro.nA; i < pro.n; i++) {
      if (pro.vx[i] !== retro.vx[i] || pro.vy[i] !== retro.vy[i]) { bDiffers = true; break }
    }
    expect(aSame).toBe(true)
    expect(bDiffers).toBe(true)
  })

  it('integrator conserves the 2-core momentum (~0) over many steps', () => {
    const s = initSim(CFG)
    const [px0, py0] = coreMomentum(s)
    expect(Math.hypot(px0, py0)).toBeLessThan(1e-9) // antisymmetric setup starts at rest COM
    let worst = 0
    for (let k = 0; k < 400; k++) {
      step(s, 0.002)
      const [px, py] = coreMomentum(s)
      const m = Math.hypot(px, py)
      if (m > worst) worst = m
    }
    expect(worst).toBeLessThan(1e-6)
  })

  it('integrator conserves the 2-core energy over many steps', () => {
    const s = initSim(CFG)
    const e0 = coreEnergy(s)
    let worstDrift = 0
    for (let k = 0; k < 400; k++) {
      step(s, 0.002)
      const drift = Math.abs((coreEnergy(s) - e0) / e0)
      if (drift > worstDrift) worstDrift = drift
    }
    // symplectic integrator: energy oscillates but does not secularly drift
    expect(worstDrift).toBeLessThan(0.02)
  })

  it('the two cores actually approach (a real encounter, not a fly-by miss)', () => {
    const s = initSim(CFG)
    expect(coreSeparation(s)).toBeCloseTo(
      Math.hypot(INITIAL_SEP, CFG.impactParameter), 5,
    )
    for (let k = 0; k < 2000; k++) step(s, 0.002)
    // closest approach seen is well inside the starting separation
    expect(s.minSep).toBeLessThan(INITIAL_SEP * 0.7)
  })

  it('frameExtent stays finite and positive as the disks evolve', () => {
    const s = initSim(CFG)
    let ok = true
    for (let k = 0; k < 500; k++) {
      step(s, 0.002)
      const e = frameExtent(s)
      if (!Number.isFinite(e) || e <= 0) { ok = false; break }
    }
    expect(ok).toBe(true)
    // all star positions remain finite (softening prevents blow-ups)
    let finite = true
    for (let i = 0; i < s.n; i++) {
      if (!Number.isFinite(s.x[i]) || !Number.isFinite(s.y[i])) { finite = false; break }
    }
    expect(finite).toBe(true)
  })
})

describe('galaxy-collision schema + presets', () => {
  it('schema.parse({}) resolves with all defaults', () => {
    expect(() => galaxyCollisionSchema.parse({})).not.toThrow()
  })

  it('every preset patch parses cleanly over defaults', () => {
    const defaults = galaxyCollisionSchema.parse({})
    for (const group of galaxyCollisionPresets) {
      for (const opt of group.options) {
        expect(() => galaxyCollisionSchema.parse({ ...defaults, ...opt.patch }), `${group.label}/${opt.name}`).not.toThrow()
      }
    }
  })

  it('defaults match the first option of each preset group', () => {
    const d = galaxyCollisionSchema.parse({}) as Record<string, unknown>
    for (const group of galaxyCollisionPresets) {
      const first = group.options[0].patch as Record<string, unknown>
      for (const [k, v] of Object.entries(first)) {
        expect(d[k], `${group.label}: ${k}`).toEqual(v)
      }
    }
  })
})
