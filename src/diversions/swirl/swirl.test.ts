import { describe, it, expect } from 'vitest'
import { swirlSchema } from './schema'
import {
  makeCenters, centerXY, rFracAt, armAnglesAt, spiralArmPoints,
  buildLUT, createSwirlState, LUT_SIZE,
} from './swirl'

const defaults = swirlSchema.parse({})

describe('swirl schema', () => {
  it('parses with valid, in-range defaults', () => {
    expect(defaults.centers).toBe(4)
    expect(defaults.armsPerCenter).toBe(18)
    expect(defaults.spiralType).toBe('log')
    expect(defaults.color.mode).toBe('spectrum')
    // Bounded sliders keep min ≤ default ≤ max.
    expect(defaults.spiralTightness).toBeGreaterThanOrEqual(0.5)
    expect(defaults.spiralTightness).toBeLessThanOrEqual(6)
    expect(defaults.spread).toBeGreaterThanOrEqual(0.1)
    expect(defaults.spread).toBeLessThanOrEqual(0.55)
    expect(defaults.color.palette.length).toBeGreaterThanOrEqual(2)
  })

  it('builds every centre count in range', () => {
    for (let n = 2; n <= 5; n++) {
      const cfg = swirlSchema.parse({ centers: n })
      expect(makeCenters(cfg, 0)).toHaveLength(n)
    }
  })
})

describe('determinism (same seed → same arrangement)', () => {
  const fields = (c: ReturnType<typeof makeCenters>) =>
    c.map((s) => [s.homeX, s.homeY, s.armPhase0, s.hueBase, s.freqX, s.phaseY])

  it('same seed+epoch reproduces identical centres', () => {
    const a = makeCenters({ ...defaults, seed: 42 }, 0)
    const b = makeCenters({ ...defaults, seed: 42 }, 0)
    expect(fields(a)).toEqual(fields(b))
  })

  it('a different seed lays the centres down differently', () => {
    const a = makeCenters({ ...defaults, seed: 42 }, 0)
    const b = makeCenters({ ...defaults, seed: 43 }, 0)
    expect(fields(a)).not.toEqual(fields(b))
  })

  it('a later reseed epoch is a fresh arrangement (but epoch 0 is stable)', () => {
    const e0a = makeCenters({ ...defaults, seed: 7 }, 0)
    const e0b = makeCenters({ ...defaults, seed: 7 }, 0)
    const e1 = makeCenters({ ...defaults, seed: 7 }, 1)
    expect(fields(e0a)).toEqual(fields(e0b)) // epoch 0 reproduces → run starts identically
    expect(fields(e0a)).not.toEqual(fields(e1)) // later epochs churn the field
  })
})

describe('headline: well-formed, evenly-fanned, overlapping spirals — no NaN', () => {
  it('radius grows monotonically with arm parameter (both spiral types)', () => {
    for (const type of ['log', 'archimedean'] as const) {
      let prev = -1
      for (let i = 0; i <= 40; i++) {
        const rf = rFracAt(type, i / 40)
        expect(rf).toBeGreaterThanOrEqual(prev)
        prev = rf
      }
      expect(rFracAt(type, 0)).toBeCloseTo(0, 10)
      expect(rFracAt(type, 1)).toBeCloseTo(1, 10)
    }
  })

  it('the arms of a centre are evenly spaced by 2π/arms at every radius', () => {
    const cfg = swirlSchema.parse({ armsPerCenter: 12 })
    const spec = makeCenters(cfg, 0)[0]
    const step = (Math.PI * 2) / 12
    for (const u of [0, 0.4, 1]) {
      const angles = armAnglesAt(spec, cfg, 3210 /* arbitrary time */, u)
      expect(angles).toHaveLength(12)
      for (let a = 1; a < 12; a++) {
        expect(angles[a] - angles[a - 1]).toBeCloseTo(step, 10)
      }
    }
  })

  it('multiple centres sit apart → their spiral fans overlap and interweave', () => {
    const cfg = swirlSchema.parse({ centers: 4 })
    const centers = makeCenters(cfg, 0)
    // No two homes coincide (distinct sources), and all sit within the frame.
    for (let i = 0; i < centers.length; i++) {
      const p = centerXY(centers[i], 0, cfg.drift)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(1)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(1)
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.hypot(centers[i].homeX - centers[j].homeX, centers[i].homeY - centers[j].homeY)
        expect(d).toBeGreaterThan(0.01)
      }
    }
    // With reach ~0.34·minDim from each centre and centres within ~0.3 of the middle,
    // arms from different sources cross the shared centre region → overlap exists.
    const reach = cfg.spread
    const maxHomeDist = Math.max(
      ...centers.flatMap((a) => centers.map((b) => Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY))),
    )
    expect(reach * 2).toBeGreaterThan(maxHomeDist) // fans reach past each other
  })

  it('arm geometry is finite everywhere (no NaN/Infinity) across the param space', () => {
    for (const type of ['log', 'archimedean'] as const) {
      const cfg = swirlSchema.parse({ centers: 5, armsPerCenter: 24, spiralTightness: 6, spiralType: type })
      const centers = makeCenters(cfg, 0)
      for (const t of [0, 500, 20000, 60000, 66000 /* mid-crossfade */]) {
        for (const spec of centers) {
          for (const a of [0, 11, 23]) {
            const pts = spiralArmPoints(spec, cfg, a, t, 1280, 800, 800, 96)
            expect(pts.length).toBeGreaterThan(0)
            for (const v of pts) expect(Number.isFinite(v)).toBe(true)
          }
        }
      }
    }
  })

  it('the colour LUT is fully populated and non-degenerate in both modes', () => {
    for (const mode of ['spectrum', 'palette'] as const) {
      const cfg = swirlSchema.parse({ color: { ...defaults.color, mode } })
      const lut = buildLUT(cfg)
      expect(lut).toHaveLength(LUT_SIZE)
      for (const c of lut) expect(c).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
      expect(new Set(lut).size).toBeGreaterThan(1) // it's a ramp, not one flat colour
    }
  })

  it('centre positions stay bounded as they drift over time', () => {
    const cfg = swirlSchema.parse({ drift: 1 })
    const spec = makeCenters(cfg, 0)[0]
    for (let t = 0; t <= 120000; t += 2500) {
      const p = centerXY(spec, t, cfg.drift)
      expect(p.x).toBeGreaterThan(0)
      expect(p.x).toBeLessThan(1)
      expect(p.y).toBeGreaterThan(0)
      expect(p.y).toBeLessThan(1)
    }
  })

  it('createSwirlState wires a LUT and empty epoch cache', () => {
    const state = createSwirlState(defaults, 800, 600)
    expect(state.lut).toHaveLength(LUT_SIZE)
    expect(state.centersByEpoch.size).toBe(0)
    expect(state.t).toBe(0)
  })
})
