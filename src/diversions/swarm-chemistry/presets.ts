// presets.ts — declared data, not chrome. Two independent axes: how the broth EVOLVES
// (Dynamics) and how it LOOKS (Look). Colour is emergent from genomes (no palette), so
// the appearance axis tunes intensity/trails/background rather than swatches. Each option
// patches a consistent key-set within its group (matchPresets assumes equal key-sets).
import type { PresetGroup } from '../../framework/types'
import type { SwarmChemistryConfig } from './schema'

export const swarmChemistryPresets: PresetGroup<SwarmChemistryConfig>[] = [
  {
    label: 'Dynamics',
    options: [
      { name: 'Primordial', patch: { competition: 'Majority', mutationRate: 0.14, collisionRadius: 14, evolve: true } },
      { name: 'Turbulent', patch: { competition: 'Faster', mutationRate: 0.3, collisionRadius: 20, evolve: true } },
      { name: 'Crystalline', patch: { competition: 'Denser', mutationRate: 0.05, collisionRadius: 10, evolve: true } },
      { name: 'Frozen', patch: { competition: 'Majority', mutationRate: 0, collisionRadius: 14, evolve: false } },
    ],
  },
  {
    label: 'Look',
    options: [
      { name: 'Vivid', patch: { colorBoost: 1.2, background: '#05070d', trailFade: 0.14, glow: true, dotSize: 2.5 } },
      { name: 'Dreamy', patch: { colorBoost: 1.1, background: '#0b0a12', trailFade: 0.28, glow: true, dotSize: 3 } },
      { name: 'Ember Dark', patch: { colorBoost: 1.5, background: '#0a0503', trailFade: 0.18, glow: true, dotSize: 2.5 } },
      { name: 'Crisp', patch: { colorBoost: 1.3, background: '#04060c', trailFade: 0, glow: false, dotSize: 2 } },
    ],
  },
]
