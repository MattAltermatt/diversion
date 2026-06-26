import { describe, it, expect } from 'vitest'
import { createFlowState, hexToRgba } from './flowField'
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
