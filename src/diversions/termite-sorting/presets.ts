import type { PresetGroup } from '../../framework/types'
import type { TermiteSortingConfig } from './schema'

// Scene bundles the scatter + sorting behavior; Palette swaps the colors. Options
// within a group patch an identical key-set (matchPresets requirement).
export const termitePresets: PresetGroup<TermiteSortingConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Sort by color', patch: { chipDensity: 0.28, colorCount: 3, sameColorBias: 0.85, wanderStrength: 0.25 } },
      { name: 'Single heap', patch: { chipDensity: 0.28, colorCount: 1, sameColorBias: 0, wanderStrength: 0.25 } },
      { name: 'Rainbow mix', patch: { chipDensity: 0.28, colorCount: 5, sameColorBias: 0.25, wanderStrength: 0.25 } },
      { name: 'Sparse', patch: { chipDensity: 0.12, colorCount: 3, sameColorBias: 0.9, wanderStrength: 0.3 } },
      { name: 'Dense sort', patch: { chipDensity: 0.45, colorCount: 4, sameColorBias: 0.9, wanderStrength: 0.2 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Confetti', patch: { color: { background: '#08090c', termite: '#8b93a6', chips: ['#ff6b5c', '#ffd34e', '#4ecb8f', '#4ea8ff', '#c77dff'] } } },
      { name: 'Autumn', patch: { color: { background: '#0c0704', termite: '#a08a6a', chips: ['#e0431f', '#ff9a3c', '#ffd15c', '#9c5a2a', '#c7382a'] } } },
      { name: 'Jewel', patch: { color: { background: '#05070d', termite: '#6f7aa0', chips: ['#2ee6d6', '#3b7dff', '#b14bff', '#ff3ba7', '#37d04a'] } } },
      { name: 'Sherbet', patch: { color: { background: '#0d0a10', termite: '#9aa0b0', chips: ['#ff9ec7', '#ffd39a', '#b6f0a3', '#9ad8ff', '#d9b8ff'] } } },
    ],
  },
]
