import { describe, it, expect } from 'vitest'
import { gpuFluidSchema } from './schema'
import { flowPresets, palettePresets } from './presets'
import { nextBlob } from './inject'
import { simDims } from './gl'
import { mulberry32 } from '../../framework/rng'

describe('gpuFluidSchema', () => {
  it('parses to defaults (Billowing flow, Aurora palette)', () => {
    const cfg = gpuFluidSchema.parse({})
    expect(cfg.simSpeed).toBe(1)
    expect(cfg.curl).toBe(30)
    expect(cfg.injectionRate).toBeCloseTo(2)
    expect(cfg.dissipation).toBeCloseTo(0.003)
    expect(cfg.pressureIters).toBe(30)
    expect(cfg.resolution).toBe('medium')
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
  })

  it('every slider field carries numeric min/max meta', () => {
    const shape = gpuFluidSchema.shape
    for (const key of ['simSpeed', 'curl', 'injectionRate', 'dissipation', 'pressureIters'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('seed is pin-only (randomizeOnFreshLoad)', () => {
    expect((gpuFluidSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })

  it('rejects out-of-band values, accepts in-band', () => {
    expect(() => gpuFluidSchema.parse({ curl: 999 })).toThrow()
    expect(() => gpuFluidSchema.parse({ dissipation: -1 })).toThrow()
    expect(() => gpuFluidSchema.parse({ resolution: 'ultra' })).toThrow()
    expect(gpuFluidSchema.parse({ curl: 0 }).curl).toBe(0)
    expect(gpuFluidSchema.parse({ resolution: 'high' }).resolution).toBe('high')
  })

  it('stops must be 6-hex colors', () => {
    expect(() => gpuFluidSchema.parse({ stops: ['#fff', '#000000'] })).toThrow()
    expect(gpuFluidSchema.parse({ stops: ['#123456', '#abcdef'] }).stops.length).toBe(2)
  })
})

describe('gpu-fluid presets', () => {
  it('has three Flow options and four Palette options', () => {
    expect(flowPresets.map((p) => p.name)).toEqual(['Wispy', 'Billowing', 'Turbulent'])
    expect(palettePresets.map((p) => p.name)).toEqual(['Aurora', 'Ink', 'Fire', 'Neon'])
  })

  it("'Billowing' flow == schema defaults (default matches a preset)", () => {
    const d = gpuFluidSchema.parse({})
    const b = flowPresets.find((p) => p.name === 'Billowing')!.patch
    expect(b.curl).toBe(d.curl)
    expect(b.injectionRate).toBe(d.injectionRate)
    expect(b.simSpeed).toBe(d.simSpeed)
  })

  it("'Aurora' palette == schema default stops", () => {
    const d = gpuFluidSchema.parse({})
    expect(palettePresets.find((p) => p.name === 'Aurora')!.patch.stops).toEqual(d.stops)
  })

  it('every flow patch parses inside the schema bands', () => {
    for (const p of flowPresets) {
      expect(() => gpuFluidSchema.parse(p.patch)).not.toThrow()
    }
  })

  it('every palette patch is valid 6-hex and parses', () => {
    for (const p of palettePresets) {
      expect(() => gpuFluidSchema.parse({ stops: p.patch.stops })).not.toThrow()
      for (const s of p.patch.stops) expect(s).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('each preset group shares one key-set (preset-sweep #125 assumption)', () => {
    for (const group of [flowPresets, palettePresets]) {
      const keySets = group.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keySets).size).toBe(1)
    }
  })
})

describe('nextBlob (injection RNG)', () => {
  it('is deterministic for a given seed', () => {
    const stops = gpuFluidSchema.parse({}).stops
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 5; i++) {
      expect(nextBlob(a, stops)).toEqual(nextBlob(b, stops))
    }
  })

  it('different seeds diverge', () => {
    const stops = gpuFluidSchema.parse({}).stops
    const first = nextBlob(mulberry32(1), stops)
    const second = nextBlob(mulberry32(2), stops)
    expect(first).not.toEqual(second)
  })

  it('positions stay in the interior [0.1, 0.9] and color channels in [0,1]', () => {
    const stops = gpuFluidSchema.parse({}).stops
    const rng = mulberry32(7)
    for (let i = 0; i < 50; i++) {
      const b = nextBlob(rng, stops)
      expect(b.nx).toBeGreaterThanOrEqual(0.1)
      expect(b.nx).toBeLessThanOrEqual(0.9)
      expect(b.ny).toBeGreaterThanOrEqual(0.1)
      expect(b.ny).toBeLessThanOrEqual(0.9)
      for (const c of [b.r, b.g, b.b]) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('simDims (resolution → sim grid)', () => {
  it('caps the longest side per resolution preset and preserves aspect', () => {
    const low = simDims(1920, 1080, 'low')
    expect(Math.max(low.sw, low.sh)).toBe(256)
    const high = simDims(1920, 1080, 'high')
    expect(Math.max(high.sw, high.sh)).toBe(512)
    // aspect preserved (16:9 → ~1.78)
    expect(high.sw / high.sh).toBeCloseTo(1920 / 1080, 1)
  })

  it('never upscales a screen smaller than the cap', () => {
    const d = simDims(200, 150, 'high')
    expect(d.sw).toBe(200)
    expect(d.sh).toBe(150)
  })
})
