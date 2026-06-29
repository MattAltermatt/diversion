import { describe, it, expect } from 'vitest'
import grayscott from './index'

describe('grayscott diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(grayscott.id).toBe('grayscott')
    expect(grayscott.kind).toBe('webgl')
    expect(typeof grayscott.setup).toBe('function')
    expect(typeof grayscott.frame).toBe('function')
    expect(grayscott.presets?.map((g) => g.label)).toEqual(['Pattern', 'Color'])
  })
  it('update() reseeds only on seed change, morphs otherwise', () => {
    const cfg = grayScottBase()
    const state = { gl: {} as any, res: null as any, cfg }
    // seed change → structural → false (caller will teardown+setup)
    expect(grayscott.update?.(state as any, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    // feed/kill (pattern morph) → live → true
    expect(grayscott.update?.(state as any, { ...cfg, feed: 0.03 }, { width: 8, height: 8 })).toBe(true)
  })
})

function grayScottBase() {
  return { simSpeed: 12, seed: 1, feed: 0.0545, kill: 0.062, stops: ['#06121f', '#0a4f6e', '#58d8ff'] }
}
