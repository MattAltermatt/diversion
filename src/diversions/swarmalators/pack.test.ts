import { describe, it, expect } from 'vitest'
import { seedWorld, packParams, packView, PARAMS_SIZE, VIEW_SIZE, DT, EPS, VIEW_RADIUS, DEFAULT_CAMERA } from './pack'

describe('seedWorld', () => {
  it('is deterministic for a given seed and byte-identical on re-seed', () => {
    const a = seedWorld(500, 42)
    const b = seedWorld(500, 42)
    expect(a.pos).toEqual(b.pos)
    expect(a.phase).toEqual(b.phase)
    expect(a.omega).toEqual(b.omega)
  })
  it('a different seed gives a different world', () => {
    const a = seedWorld(500, 1)
    const b = seedWorld(500, 2)
    expect(a.pos).not.toEqual(b.pos)
  })
  it('seeds positions in [-1,1], phases in [-PI,PI), and the right lengths', () => {
    const n = 1000
    const { pos, phase, vel, phaseVel, omega } = seedWorld(n, 7)
    expect(pos.length).toBe(n * 2)
    expect(vel.length).toBe(n * 2)
    expect(phase.length).toBe(n)
    expect(phaseVel.length).toBe(n)
    expect(omega.length).toBe(n)
    for (let i = 0; i < pos.length; i++) { expect(pos[i]).toBeGreaterThanOrEqual(-1); expect(pos[i]).toBeLessThanOrEqual(1) }
    for (let i = 0; i < n; i++) { expect(phase[i]).toBeGreaterThanOrEqual(-Math.PI); expect(phase[i]).toBeLessThan(Math.PI) }
    expect(Array.from(vel)).toEqual(new Array(n * 2).fill(0))
    expect(Array.from(phaseVel)).toEqual(new Array(n).fill(0))
  })
})

describe('packParams', () => {
  it('lays out N, invN, J, K, dt, eps, omegaSpread little-endian', () => {
    const buf = packParams({ count: 1000, J: 1, K: -0.75, omegaSpread: 0.3 })
    expect(buf.byteLength).toBe(PARAMS_SIZE)
    const dv = new DataView(buf)
    expect(dv.getUint32(0, true)).toBe(1000)
    expect(dv.getFloat32(4, true)).toBeCloseTo(1 / 1000, 6) // invN
    expect(dv.getFloat32(8, true)).toBeCloseTo(1)     // J
    expect(dv.getFloat32(12, true)).toBeCloseTo(-0.75) // K
    expect(dv.getFloat32(16, true)).toBeCloseTo(DT)
    expect(dv.getFloat32(20, true)).toBeCloseTo(EPS)
    expect(dv.getFloat32(24, true)).toBeCloseTo(0.3)  // omegaSpread
  })
})

describe('packView', () => {
  it('centres on origin, fits VIEW_RADIUS to the min screen dim, and encodes colorMap', () => {
    const buf = packView({ dotSize: 2.5, colorMap: 'Sinebow' }, { width: 800, height: 600 }, 1, DEFAULT_CAMERA)
    expect(buf.byteLength).toBe(VIEW_SIZE)
    const dv = new DataView(buf)
    const expScale = (600 / 2 * 0.9 / VIEW_RADIUS)
    expect(dv.getFloat32(0, true)).toBeCloseTo(expScale, 3)
    expect(dv.getFloat32(4, true)).toBeCloseTo(0) // centreX
    expect(dv.getFloat32(8, true)).toBeCloseTo(0) // centreY
    expect(dv.getUint32(28, true)).toBe(1) // colorMap index: Sinebow → 1
  })
})
