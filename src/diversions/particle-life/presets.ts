// presets.ts — declared data, not chrome. Two independent axes: how the broth MOVES
// (Feel) and how it LOOKS. Each option patches a consistent key-set within its group
// (matchPresets assumes equal key-sets per group), so picking one flips only its axis
// and manual edits drop that axis to "Custom".
import type { PresetGroup } from '../../framework/types'
import type { ParticleLifeConfig } from './schema'

export const particleLifePresets: PresetGroup<ParticleLifeConfig>[] = [
  {
    label: 'Feel',
    options: [
      { name: 'Calm', patch: { forceScale: 0.6, friction: 0.08, beta: 0.32, attractBias: 0.15, symmetry: 'Symmetric' } },
      { name: 'Balanced', patch: { forceScale: 1, friction: 0.04, beta: 0.3, attractBias: 0.1, symmetry: 'Asymmetric' } },
      { name: 'Lively', patch: { forceScale: 1.6, friction: 0.025, beta: 0.28, attractBias: 0.05, symmetry: 'Asymmetric' } },
    ],
  },
  {
    label: 'Look',
    options: [
      { name: 'Spectrum', patch: { palette: 'Spectrum', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } },
      { name: 'Neon Night', patch: { palette: 'Neon', background: '#05070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
      { name: 'Pastel Dream', patch: { palette: 'Pastel', background: '#0b0a12', trailFade: 0.25, glow: true, dotSize: 3 } },
      { name: 'Ember', patch: { palette: 'Fire', background: '#0a0503', trailFade: 0.18, glow: true, dotSize: 2.5 } },
      { name: 'Ice', patch: { palette: 'Ice', background: '#04070d', trailFade: 0.2, glow: true, dotSize: 2.5 } },
    ],
  },
]
