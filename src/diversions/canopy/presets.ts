import type { PresetGroup } from '../../framework/types'
import type { CanopyConfig } from './schema'

// Regime bundles the growth/light economy that sets the arms-race balance point;
// Palette swaps the sky + foliage colors. Options within a group patch an identical
// key-set (matchPresets requirement).
export const canopyPresets: PresetGroup<CanopyConfig>[] = [
  {
    label: 'Regime',
    options: [
      { name: 'Temperate', patch: { sunlight: 1, heightCost: 1, growthSpeed: 1, seedSpread: 90 } },
      { name: 'Runaway giants', patch: { sunlight: 1, heightCost: 0.4, growthSpeed: 1.1, seedSpread: 110 } },
      { name: 'Stable turf', patch: { sunlight: 1, heightCost: 2.2, growthSpeed: 0.9, seedSpread: 70 } },
      { name: 'Deep shade', patch: { sunlight: 0.6, heightCost: 1, growthSpeed: 0.8, seedSpread: 90 } },
      { name: 'Fast succession', patch: { sunlight: 1, heightCost: 1.2, growthSpeed: 2, seedSpread: 140 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Forest', patch: { color: { skyTop: '#0a1420', skyBottom: '#05080c', trunk: '#3a2a1c', leafShade: '#123a24', leafSun: '#b6f05a' } } },
      { name: 'Autumn', patch: { color: { skyTop: '#241206', skyBottom: '#0a0604', trunk: '#402518', leafShade: '#5c2a12', leafSun: '#ffd24a' } } },
      { name: 'Dusk', patch: { color: { skyTop: '#1a1030', skyBottom: '#07040f', trunk: '#2c2030', leafShade: '#1e2a52', leafSun: '#ff9edd' } } },
      { name: 'Kelp', patch: { color: { skyTop: '#04161c', skyBottom: '#02090c', trunk: '#173036', leafShade: '#0d3a3a', leafSun: '#7cf0d0' } } },
    ],
  },
]
