import type { PresetOption } from '../../framework/types'
import type { ChemicalGardenConfig } from './schema'

// Two independent preset axes: Garden (structure/feel) and Minerals (which
// salts seed the garden). Each patch is applied over the current config
// (top-level spread).

export const gardenPresets: PresetOption<ChemicalGardenConfig>[] = [
  { name: 'Tall plumes', patch: { buoyancy: 0.85, branchRate: 0.012, wander: 4, seeds: 3 } },
  { name: 'Balanced', patch: { buoyancy: 0.6, branchRate: 0.035, wander: 6, seeds: 5 } },
  { name: 'Dense coral', patch: { buoyancy: 0.4, branchRate: 0.06, wander: 9, seeds: 6 } },
]

export const mineralPresets: PresetOption<ChemicalGardenConfig>[] = [
  { name: 'Full spectrum', patch: { palette: 'full' } },
  { name: 'Copper blues', patch: { palette: 'copper' } },
  { name: 'Iron & manganese', patch: { palette: 'ironManganese' } },
  { name: 'Mono', patch: { palette: 'mono' } },
]
