import { describe, it, expect } from 'vitest'
import { createFlowState, hexToRgba, trailFadeAlpha, toHex2 } from './flowField'
import { flowFieldSchema } from './schema'

const base = flowFieldSchema.parse({})

describe('hexToRgba', () => {
  it('converts #rrggbbaa to an rgba() string (alpha rounded to 3 dp)', () => {
    expect(hexToRgba('#1e63ff1f')).toBe('rgba(30, 99, 255, 0.122)')
    expect(hexToRgba('#102030ff')).toBe('rgba(16, 32, 48, 1)')
    expect(hexToRgba('#00000000')).toBe('rgba(0, 0, 0, 0)')
  })
})

describe('createFlowState palette', () => {
  it('precomputes one rgba style per palette color', () => {
    const s = createFlowState({ ...base, particles: 20 }, 800, 600)
    expect(s.styles).toHaveLength(base.palette.colors.length)
    expect(s.styles[0]).toBe(hexToRgba(base.palette.colors[0]))
  })

  it('assigns every particle a color index within the palette range', () => {
    const n = base.palette.colors.length
    const s = createFlowState({ ...base, particles: 200 }, 800, 600)
    for (const p of s.particles) {
      expect(p.ci).toBeGreaterThanOrEqual(0)
      expect(p.ci).toBeLessThan(n)
      expect(Number.isInteger(p.ci)).toBe(true)
    }
  })
})

describe('createFlowState determinism', () => {
  it('produces identical particle layouts for the same seed', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 777 }, 800, 600)
    expect(a.particles).toEqual(b.particles)
  })

  it('produces different layouts for different seeds', () => {
    const a = createFlowState({ ...base, particles: 50, seed: 1 }, 800, 600)
    const b = createFlowState({ ...base, particles: 50, seed: 2 }, 800, 600)
    expect(a.particles).not.toEqual(b.particles)
  })
})

describe('trailFadeAlpha', () => {
  it('maps 0 -> full wipe (1.0) and 100 -> the floor (0.02)', () => {
    expect(trailFadeAlpha(0)).toBe(1)
    expect(trailFadeAlpha(100)).toBeCloseTo(0.02, 5)
  })
  it('matches the legacy ~0.13 fade near the default (88)', () => {
    expect(trailFadeAlpha(88)).toBeCloseTo(0.1376, 3)
  })
  it('is monotonically decreasing in trail length', () => {
    expect(trailFadeAlpha(20)).toBeGreaterThan(trailFadeAlpha(80))
  })
})

describe('toHex2', () => {
  it('converts a 0..1 alpha to a 2-digit hex byte', () => {
    expect(toHex2(1)).toBe('ff')
    expect(toHex2(0)).toBe('00')
    expect(toHex2(0.1376)).toBe('23') // round(0.1376*255)=35=0x23
  })
})

describe('lifespan-derived particle life', () => {
  it('keeps every particle life within [lifespan/3, lifespan] seconds (default 4s)', () => {
    const cfg = flowFieldSchema.parse({})
    const s = createFlowState({ ...cfg, particles: 300 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(1333) // 4000/3
      expect(p.life).toBeLessThanOrEqual(4000)
    }
  })
  it('scales the bounds with the lifespan slider (12s -> [4000, 12000])', () => {
    const cfg = flowFieldSchema.parse({})
    const s = createFlowState({ ...cfg, particles: 300, lifespan: 12 }, 800, 600)
    for (const p of s.particles) {
      expect(p.life).toBeGreaterThanOrEqual(4000)
      expect(p.life).toBeLessThanOrEqual(12000)
    }
  })
})

describe('schema defaults', () => {
  it('defaults blend to screen (out-of-box white-out tame)', () => {
    expect(flowFieldSchema.parse({}).blend).toBe('screen')
  })
  it('defaults trailLength to 88 and lifespan to 4', () => {
    const cfg = flowFieldSchema.parse({})
    expect(cfg.trailLength).toBe(88)
    expect(cfg.lifespan).toBe(4)
  })
})
