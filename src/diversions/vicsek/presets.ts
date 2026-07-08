// presets.ts — declared data (framework renders one dropdown per group).
import type { PresetGroup } from '../../framework/types'
import type { VicsekConfig } from './schema'

export const vicsekPresets: PresetGroup<VicsekConfig>[] = [
  {
    label: 'Dynamics',
    options: [
      // Every option in a group must patch the SAME key-set (framework matchPresets
      // rule, presetSweep.test.ts) — all three set noise, worldSize, neighborRadius.
      { name: 'Ordered Flock', patch: { noise: 0.4, worldSize: 650, neighborRadius: 28 } },
      { name: 'Critical Edge', patch: { noise: 1.9, worldSize: 800, neighborRadius: 24 } },
      { name: 'Disordered Gas', patch: { noise: 4.5, worldSize: 1200, neighborRadius: 18 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Spectrum', patch: { palette: ['#ff4d6d', '#ff9e4d', '#ffe14d', '#7bff8a', '#4de1ff', '#4d7bff', '#b14dff', '#ff4de1'], background: '#05070d' } },
      { name: 'Ice', patch: { palette: ['#bdeaff', '#7fd4ff', '#4d9fff', '#4d6dff', '#7f7fff', '#4d9fff'], background: '#03060f' } },
      { name: 'Ember', patch: { palette: ['#fff0c2', '#ffcf6b', '#ff9a3d', '#ff5a3d', '#c4402b', '#ff9a3d'], background: '#0c0503' } },
    ],
  },
]
