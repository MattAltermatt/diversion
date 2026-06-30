import type { PresetGroup } from '../../framework/types'
import type { BoxCar2DConfig } from './schema'
import { PALETTES } from './palette'

export const boxcar2dPresets: PresetGroup<BoxCar2DConfig>[] = [
  {
    label: 'Palette',
    options: Object.entries(PALETTES).map(([name, color]) => ({ name, patch: { color } })),
  },
  {
    label: 'Terrain feel',
    options: [
      { name: 'Gentle', patch: { roughness: 0.25 } },
      { name: 'Rolling', patch: { roughness: 0.5 } },
      { name: 'Rugged', patch: { roughness: 0.95 } },
    ],
  },
]
