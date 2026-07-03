import { describe, it, expect } from 'vitest'
import morphogen from './index'
import { morphogenSchema } from './schema'

describe('morphogen diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(morphogen.id).toBe('morphogen')
    expect(morphogen.kind).toBe('webgl')
    expect(typeof morphogen.setup).toBe('function')
    expect(typeof morphogen.frame).toBe('function')
    expect(morphogen.presets?.map((g) => g.label)).toEqual(['Body plan', 'Palette'])
  })

  it('update() re-setups on a structural change, morphs otherwise', () => {
    const cfg = morphogenSchema.parse({})
    const state = { gl: {} as any, res: null as any, cfg, bases: [], driftT: 0, lifeT: 0 }
    // structural (grid / layout / counts / seed) → false (teardown+setup)
    expect(morphogen.update?.(state as any, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    expect(morphogen.update?.(state as any, { ...cfg, sourceLayout: 'poles' }, { width: 8, height: 8 })).toBe(false)
    expect(morphogen.update?.(state as any, { ...cfg, morphogenCount: 2 }, { width: 8, height: 8 })).toBe(false)
    // display-only knobs → live → true
    expect(morphogen.update?.(state as any, { ...cfg, edgeStrength: 0.9 }, { width: 8, height: 8 })).toBe(true)
    expect(morphogen.update?.(state as any, { ...cfg, driftSpeed: 2 }, { width: 8, height: 8 })).toBe(true)
  })
})
