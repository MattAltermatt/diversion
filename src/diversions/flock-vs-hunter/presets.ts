// presets.ts — declared data (framework renders one dropdown per group).
import type { PresetGroup } from '../../framework/types'
import type { FlockVsHunterConfig } from './schema'

export const flockVsHunterPresets: PresetGroup<FlockVsHunterConfig>[] = [
  {
    label: 'Dynamics',
    options: [
      // Every option in a group must patch the SAME key-set (framework matchPresets
      // rule, presetSweep.test.ts #127) — so all three set both mutation rates.
      { name: 'Calm Murmuration', patch: { boidCount: 240, predatorCount: 4, roundLength: 22, flockMutationRate: 0.12, predMutationRate: 0.15 } },
      { name: 'Predator Pressure', patch: { boidCount: 260, predatorCount: 7, roundLength: 18, flockMutationRate: 0.12, predMutationRate: 0.2 } },
      { name: 'Skittish Flock', patch: { boidCount: 200, predatorCount: 2, roundLength: 26, flockMutationRate: 0.16, predMutationRate: 0.15 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Ice & Ember', patch: { flockColors: ['#7fd4ffcc', '#a9e7ffcc', '#d8f3ffcc'], predatorColor: '#ff3b30', background: '#05070d' } },
      { name: 'Ink', patch: { flockColors: ['#c9c9d6aa', '#e8e8f0cc'], predatorColor: '#ffffff', background: '#0a0a0c' } },
      { name: 'Aurora', patch: { flockColors: ['#4dffb0cc', '#7df0e0cc', '#b8ffe6cc'], predatorColor: '#ff36c6', background: '#04100c' } },
    ],
  },
]
