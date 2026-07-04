import { describe, it, expect } from 'vitest'
import { vinesSchema, type VinesConfig } from './schema'
import {
  createVineState,
  advanceVines,
  fadeAlpha,
  shouldReseed,
  needsRebuild,
} from './vines'

const defaults = (): VinesConfig => vinesSchema.parse({})

describe('vines lifecycle', () => {
  it('cycles grow → settle → fade → reseed', () => {
    const state = createVineState(defaults(), 800, 600)
    expect(state.phase).toBe('growing')
    expect(shouldReseed(state)).toBe(false)

    // grow to completion
    for (let i = 0; i < 2000 && state.phase === 'growing'; i++) advanceVines(state, 16)
    expect(state.phase).toBe('settled')
    expect(state.front).toBeCloseTo(state.geo.maxDist)
    expect(fadeAlpha(state)).toBe(1)

    // settle then fade
    for (let i = 0; i < 2000 && state.phase !== 'fading'; i++) advanceVines(state, 16)
    expect(state.phase).toBe('fading')

    // fade fully → asks the framework to reseed
    for (let i = 0; i < 2000 && !shouldReseed(state); i++) advanceVines(state, 16)
    expect(shouldReseed(state)).toBe(true)
    expect(fadeAlpha(state)).toBe(0)
  })
})

describe('needsRebuild', () => {
  it('geometry fields force a rebuild; render fields do not', () => {
    const a = defaults()
    expect(needsRebuild(a, a)).toBe(false)
    expect(needsRebuild(a, { ...a, seed: a.seed + 1 })).toBe(true)
    expect(needsRebuild(a, { ...a, species: 'fern' })).toBe(true)
    expect(needsRebuild(a, { ...a, iterations: 5 })).toBe(true)
    // render-only tweaks apply live
    expect(needsRebuild(a, { ...a, glow: 0.9 })).toBe(false)
    expect(needsRebuild(a, { ...a, colors: ['#ffffff'] })).toBe(false)
    expect(needsRebuild(a, { ...a, growthSpeed: 200 })).toBe(false)
  })
})
