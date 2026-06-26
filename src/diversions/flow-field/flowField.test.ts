import { describe, it, expect } from 'vitest'
import { createFlowState, makeHueStyleCache } from './flowField'
import { flowFieldSchema } from './schema'

const base = flowFieldSchema.parse({})

describe('makeHueStyleCache', () => {
  it('builds an hsl() string at the given saturation and lightness', () => {
    const style = makeHueStyleCache(90, 65)
    expect(style(200)).toBe('hsl(200, 90%, 65%)')
  })

  it('returns the same cached string instance for a repeated hue (no per-frame allocation)', () => {
    const style = makeHueStyleCache(90, 65)
    expect(style(200)).toBe(style(200)) // value equality
    // reference equality is the real point: the hot loop must reuse, not re-allocate
    const cache = makeHueStyleCache(90, 65)
    const first = cache(200)
    const second = cache(200)
    expect(Object.is(first, second)).toBe(true)
  })

  it('rounds a fractional hue to the nearest integer bucket', () => {
    const style = makeHueStyleCache(90, 65)
    expect(style(200.4)).toBe('hsl(200, 90%, 65%)')
    expect(Object.is(style(200.4), style(200))).toBe(true)
  })

  it('normalizes hue >= 360 to its mod-360 equivalent (same color, cache hit)', () => {
    const style = makeHueStyleCache(90, 65)
    expect(style(560)).toBe('hsl(200, 90%, 65%)') // 560 mod 360 = 200
    expect(Object.is(style(560), style(200))).toBe(true)
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
