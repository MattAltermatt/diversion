import type { PresetGroup } from '../../framework/types'
import type { BoxCar2DConfig } from './schema'
import { PALETTES } from './palette'

export const boxcar2dPresets: PresetGroup<BoxCar2DConfig>[] = [
  {
    label: 'Palette',
    options: Object.entries(PALETTES).map(([name, color]) => ({ name, patch: { color } })),
  },
  {
    label: 'Terrain',
    options: [
      { name: 'Rolling', patch: { terrainType: 'rolling' } },
      { name: 'Dunes', patch: { terrainType: 'dunes' } },
      { name: 'Plateaus', patch: { terrainType: 'plateaus' } },
      { name: 'Ridges', patch: { terrainType: 'ridges' } },
    ],
  },
  {
    label: 'Objective',
    options: [
      { name: 'Distance', patch: { mode: 'distance' } },
      { name: 'Race', patch: { mode: 'time' } },
    ],
  },
]
