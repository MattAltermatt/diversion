import type { PresetGroup } from '../../framework/types'
import type { AntColonyConfig } from './schema'

// Scene sets colony count + world dynamics; Palette swaps colors. Each option
// within a group patches an identical key-set (matchPresets requirement).
export const antColonyPresets: PresetGroup<AntColonyConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Single hive', patch: { colonies: '1', foodSources: 4, antCount: 500, evaporation: 0.02, foodRegenerates: true } },
      { name: 'Rival colonies', patch: { colonies: '2', foodSources: 5, antCount: 700, evaporation: 0.02, foodRegenerates: true } },
      { name: 'Dense network', patch: { colonies: '1', foodSources: 3, antCount: 900, evaporation: 0.012, foodRegenerates: true } },
      { name: 'Restless foraging', patch: { colonies: '1', foodSources: 6, antCount: 400, evaporation: 0.045, foodRegenerates: true } },
      { name: 'Finite harvest', patch: { colonies: '1', foodSources: 4, antCount: 500, evaporation: 0.02, foodRegenerates: false } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Amber & Cyan', patch: { palette: {
        background: '#05070a', trailA: '#39d7ff', nestA: '#ffe066',
        trailB: '#ff5c8a', nestB: '#ff9f4d', foodLow: '#3a2410', foodHigh: '#ffb347',
      } } },
      { name: 'Bioluminescent', patch: { palette: {
        background: '#020814', trailA: '#1bd6ff', nestA: '#eaffff',
        trailB: '#43e389', nestB: '#e9fff1', foodLow: '#0a3b66', foodHigh: '#7ff0d0',
      } } },
      { name: 'Ember Rivals', patch: { palette: {
        background: '#0b0402', trailA: '#ff6a1a', nestA: '#ffe7a8',
        trailB: '#7a3bff', nestB: '#e6d6ff', foodLow: '#3a1408', foodHigh: '#ffcf6a',
      } } },
      { name: 'Aurora', patch: { palette: {
        background: '#02060f', trailA: '#34e0a2', nestA: '#eafff2',
        trailB: '#f24fb0', nestB: '#ffe6f4', foodLow: '#0c2e2a', foodHigh: '#9df2ff',
      } } },
    ],
  },
]
