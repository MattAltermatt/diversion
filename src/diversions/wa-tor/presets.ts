import type { PresetGroup } from '../../framework/types'
import type { WaTorConfig } from './schema'

// Scene bundles the population + rule constants that shape the wave regime;
// Palette swaps the ocean/fish/shark colours. Each option within a group patches an
// identical key-set (matchPresets requirement).
export const waTorPresets: PresetGroup<WaTorConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Classic waves', patch: { initialFish: 0.4, initialSharks: 0.05, fishBreedTime: 8, sharkBreedTime: 14, sharkStartEnergy: 10, fishEnergy: 6 } },
      { name: 'Slow tides', patch: { initialFish: 0.35, initialSharks: 0.04, fishBreedTime: 14, sharkBreedTime: 24, sharkStartEnergy: 16, fishEnergy: 10 } },
      { name: 'Frantic', patch: { initialFish: 0.45, initialSharks: 0.06, fishBreedTime: 4, sharkBreedTime: 7, sharkStartEnergy: 6, fishEnergy: 3 } },
      { name: 'Shark-heavy start', patch: { initialFish: 0.3, initialSharks: 0.12, fishBreedTime: 6, sharkBreedTime: 12, sharkStartEnergy: 9, fishEnergy: 5 } },
      { name: 'Fish-heavy start', patch: { initialFish: 0.55, initialSharks: 0.02, fishBreedTime: 9, sharkBreedTime: 16, sharkStartEnergy: 12, fishEnergy: 7 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Deep sea', patch: { palette: { background: '#050b16', fish: '#f2c14e', shark: '#ff3b57' } } },
      { name: 'Kelp forest', patch: { palette: { background: '#031a12', fish: '#bff26a', shark: '#ff8a3d' } } },
      { name: 'Abyss', patch: { palette: { background: '#020208', fish: '#7ff0ff', shark: '#ff2d95' } } },
      { name: 'Coral', patch: { palette: { background: '#0a0416', fish: '#ffd27a', shark: '#3bf2c9' } } },
    ],
  },
]
