import { describe, it, expect } from 'vitest'
import { particleLifeGpuPresets } from './presets'

// The Worlds axis (#214): one dynamics axis ("Worlds") that replaces the old
// "Feel" group, plus the unchanged "Look" axis. A curated world is identity
// `matrixSeed` (fixed rules) + a rerolling soup `seed` (fresh each visit), so
// every Worlds option must pin the same key-set and must NOT patch the derived
// `matrix` array (that would break matrixSeed-reproducibility). #277 widened the
// key-set with `count` + `worldSize` so a world also declares its own density.

const WORLD_KEYS = [
  'attractBias', 'beta', 'colors', 'count', 'forceScale',
  'friction', 'matrixSeed', 'rMax', 'symmetry', 'worldSize',
].sort().join(',')

describe('particle-life-gpu presets — Worlds axis (#214)', () => {
  it('declares exactly two groups: Worlds then Look', () => {
    expect(particleLifeGpuPresets.map((g) => g.label)).toEqual(['Worlds', 'Look'])
  })

  const worlds = () => particleLifeGpuPresets.find((g) => g.label === 'Worlds')!

  it('every Worlds option patches the same key-set (8 dynamics + count + worldSize)', () => {
    for (const opt of worlds().options) {
      expect(Object.keys(opt.patch).sort().join(','), opt.name).toBe(WORLD_KEYS)
    }
  })

  it('no Worlds option patches the derived matrix array', () => {
    for (const opt of worlds().options) {
      expect(Object.prototype.hasOwnProperty.call(opt.patch, 'matrix'), opt.name).toBe(false)
    }
  })

  it('🎲 Random options follow the soup (matrixSeed 0); curated ones pin a nonzero matrixSeed', () => {
    for (const opt of worlds().options) {
      const isRandom = opt.name.startsWith('🎲')
      const ms = (opt.patch as { matrixSeed?: number }).matrixSeed
      if (isRandom) expect(ms, opt.name).toBe(0)
      else expect(ms, opt.name).not.toBe(0)
    }
  })

  it('provides the three Random feels', () => {
    const names = worlds().options.map((o) => o.name)
    expect(names).toEqual(expect.arrayContaining(['🎲 Calm', '🎲 Balanced', '🎲 Lively']))
  })
})
