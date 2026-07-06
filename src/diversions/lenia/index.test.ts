import { describe, it, expect } from 'vitest'
import lenia from './index'

describe('lenia diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(lenia.id).toBe('lenia')
    expect(lenia.kind).toBe('webgl')
    expect(typeof lenia.setup).toBe('function')
    expect(typeof lenia.frame).toBe('function')
    expect(lenia.presets?.map((g) => g.label)).toEqual(['Pattern', 'Palette'])
  })
  it('update() reseeds on seed or radius change, morphs otherwise', () => {
    const cfg = leniaBase()
    const state = { gl: {} as any, res: null as any, cfg }
    // seed change → structural → false (caller will teardown + setup)
    expect(lenia.update?.(state as any, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    // kernelRadius change → structural (shader recompile) → false
    expect(lenia.update?.(state as any, { ...cfg, kernelRadius: 10 }, { width: 8, height: 8 })).toBe(false)
    // μ/σ morph → live → true
    expect(lenia.update?.(state as any, { ...cfg, mu: 0.2 }, { width: 8, height: 8 })).toBe(true)
  })
})

function leniaBase() {
  return { simSpeed: 2, seed: 1, mu: 0.15, sigma: 0.017, kernelRadius: 12, kernel: 'Smooth' as const,
           stops: ['#040a1a', '#0a6e7a', '#eafcff'] }
}
