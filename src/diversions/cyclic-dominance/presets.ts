import type { PresetGroup } from '../../framework/types'
import type { CyclicDominanceConfig } from './schema'

// Scene tunes the rate balance (mobility is the domain-scale lever; predation
// vs reproduction shifts empties vs fill, i.e. speckle vs clean); Palette swaps
// the species colours. Each option within a group patches an identical key-set
// (matchPresets requirement).
export const cyclicDominancePresets: PresetGroup<CyclicDominanceConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Curling fronts', patch: { mobility: 0.12, predationRate: 0.34, reproductionRate: 0.54 } },
      { name: 'Slow giants', patch: { mobility: 0.06, predationRate: 0.3, reproductionRate: 0.6 } },
      { name: 'Fine turbulence', patch: { mobility: 0.3, predationRate: 0.34, reproductionRate: 0.54 } },
      { name: 'Predator surge', patch: { mobility: 0.15, predationRate: 0.5, reproductionRate: 0.35 } },
      { name: 'Sparse drift', patch: { mobility: 0.08, predationRate: 0.4, reproductionRate: 0.4 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Classic RGB', patch: { colors: { a: '#ff4136', b: '#2ecc40', c: '#0074d9', background: '#0a0a0f' } } },
      { name: 'Neon', patch: { colors: { a: '#ff2d95', b: '#7cff4d', c: '#00e5ff', background: '#08060f' } } },
      { name: 'Sunset', patch: { colors: { a: '#ff5e3a', b: '#ffd400', c: '#7c4dff', background: '#0d0a12' } } },
      { name: 'Ice & ember', patch: { colors: { a: '#ff6b3d', b: '#8ecbff', c: '#2c6e8f', background: '#04060a' } } },
    ],
  },
]
