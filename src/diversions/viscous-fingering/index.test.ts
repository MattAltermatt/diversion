import { describe, it, expect } from 'vitest'
import viscousFingering from './index'
import { viscousFingeringSchema } from './schema'

describe('viscous-fingering diversion', () => {
  it('declares the webgl contract + two preset axes', () => {
    expect(viscousFingering.id).toBe('viscous-fingering')
    expect(viscousFingering.kind).toBe('webgl')
    expect(typeof viscousFingering.setup).toBe('function')
    expect(typeof viscousFingering.frame).toBe('function')
    expect(typeof viscousFingering.teardown).toBe('function')
    expect(viscousFingering.presets?.map((g) => g.label)).toEqual(['Fingering', 'Color'])
  })

  it('preset patches are all valid partial configs (equal key-sets per group)', () => {
    for (const group of viscousFingering.presets ?? []) {
      const keySets = group.options.map((o) => Object.keys(o.patch).sort().join(','))
      expect(new Set(keySets).size).toBe(1) // matchPresets requires equal key-sets
      for (const opt of group.options) {
        expect(() => viscousFingeringSchema.parse({ ...viscousFingeringSchema.parse({}), ...opt.patch })).not.toThrow()
      }
    }
  })

  it('update() reseeds only on seed change, morphs everything else live', () => {
    const cfg = viscousFingeringSchema.parse({})
    const state = { gl: {} as never, res: null as never, cfg }
    // seed change → structural → false (caller will teardown+setup)
    expect(viscousFingering.update?.(state, { ...cfg, seed: cfg.seed + 1 }, { width: 8, height: 8 })).toBe(false)
    // knob / color-mode / background changes → live → true
    expect(viscousFingering.update?.(state, { ...cfg, viscosityRatio: 0.9 }, { width: 8, height: 8 })).toBe(true)
    expect(viscousFingering.update?.(state, { ...cfg, colorMode: 'arrival' }, { width: 8, height: 8 })).toBe(true)
  })
})
