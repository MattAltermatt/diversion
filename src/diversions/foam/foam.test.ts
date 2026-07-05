import { describe, it, expect } from 'vitest'
import foam from './index'
import { foamSchema } from './schema'
import { simDims, seedFoam, buildLUT, kappaFor, dtFor, N_FIELDS } from './field'

describe('foam diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(foam.id).toBe('foam')
    expect(foam.kind).toBe('webgl')
    expect(typeof foam.setup).toBe('function')
    expect(typeof foam.frame).toBe('function')
    expect(typeof foam.teardown).toBe('function')
    expect(foam.presets?.map((g) => g.label)).toEqual(['Foam', 'Palette'])
  })

  it('preset patches are all valid partial configs (equal key-sets per group)', () => {
    for (const group of foam.presets ?? []) {
      const keySets = group.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keySets).size).toBe(1) // matchPresets requires equal key-sets
      for (const opt of group.options) {
        expect(() => foamSchema.parse({ ...foamSchema.parse({}), ...opt.patch })).not.toThrow()
      }
    }
  })

  it('update() reseeds only on seed change, morphs everything else live', () => {
    const cfg = foamSchema.parse({})
    const state = { gl: {} as never, res: null as never, cfg }
    // seed change → structural → false (caller will teardown+setup)
    expect(foam.update?.(state, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    // cell-size / speed / wall knob changes → live → true
    expect(foam.update?.(state, { ...cfg, cellScale: 2.5 }, { width: 8, height: 8 })).toBe(true)
    expect(foam.update?.(state, { ...cfg, wallThickness: 0.9 }, { width: 8, height: 8 })).toBe(true)
  })
})

describe('simDims', () => {
  it('caps the longest side to 512, preserving aspect', () => {
    const { sw, sh } = simDims(1920, 1080)
    expect(Math.max(sw, sh)).toBe(512)
    expect(sw / sh).toBeCloseTo(1920 / 1080, 2)
  })
  it('passes a small field through uncapped', () => {
    expect(simDims(400, 300)).toEqual({ sw: 400, sh: 300 })
  })
})

describe('seedFoam', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const s1 = seedFoam(1, 32, 32)
    expect(s1.a).toEqual(seedFoam(1, 32, 32).a)
    expect(s1.b).toEqual(seedFoam(1, 32, 32).b)
    const s2 = seedFoam(2, 32, 32)
    expect(s1.a).not.toEqual(s2.a)
  })

  it('nucleates exactly one dominant field per texel (a single grain), rest near 0', () => {
    const w = 24, h = 24
    const { a, b } = seedFoam(7, w, h)
    for (let i = 0; i < w * h; i++) {
      const fields = [
        a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3],
        b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3],
      ]
      const big = fields.filter((v) => v > 0.5)
      expect(big.length).toBe(1)          // exactly one field ≈ 1
      expect(Math.max(...big)).toBe(1)    // and it is 1
      // every field stays in [0,1]
      for (const v of fields) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1) }
    }
  })

  it('spreads nuclei across all 8 fields (not one degenerate label)', () => {
    const w = 48, h = 48
    const { a, b } = seedFoam(3, w, h)
    const seen = new Set<number>()
    for (let i = 0; i < w * h; i++) {
      const fields = [
        a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3],
        b[i * 4], b[i * 4 + 1], b[i * 4 + 2], b[i * 4 + 3],
      ]
      seen.add(fields.indexOf(Math.max(...fields)))
    }
    expect(seen.size).toBe(N_FIELDS) // all 8 order parameters get nucleated
  })
})

describe('knob → coefficient mappings', () => {
  it('kappaFor tracks cellScale (chunkier walls at higher scale), floored positive', () => {
    expect(kappaFor(1.5)).toBeCloseTo(1.5)
    expect(kappaFor(3)).toBeGreaterThan(kappaFor(1))
    expect(kappaFor(0.1)).toBeGreaterThan(0) // floor keeps κ positive/stable
  })
  it('dtFor stays inside the explicit-Euler stability band and shrinks as κ climbs', () => {
    expect(dtFor(0.5)).toBeLessThanOrEqual(0.2)
    expect(dtFor(4)).toBeLessThan(dtFor(1))    // smaller dt at larger κ
    // dt·κ (the diffusion CFL product) stays well under the ~0.5 limit across the range
    for (const k of [0.25, 0.5, 1, 1.5, 2.8, 4]) {
      expect(dtFor(k) * k).toBeLessThan(0.5)
    }
  })
})

describe('buildLUT', () => {
  it('bakes a 256×RGBA byte ramp, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(256 * 4)
    expect(lut[3]).toBe(255)                  // alpha opaque
    expect(lut[0]).toBeLessThan(lut[255 * 4]) // R climbs dark→bright
  })
})
