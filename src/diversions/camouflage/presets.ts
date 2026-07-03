import type { PresetGroup } from '../../framework/types'
import type { CamouflageConfig } from './schema'

// Habitat swaps the background + pattern scale; Arms race tunes how hard the predator
// pushes. Each option within a group patches an identical key-set.
export const camouflagePresets: PresetGroup<CamouflageConfig>[] = [
  {
    label: 'Habitat',
    options: [
      { name: 'Lichen', patch: { background: 'lichen', patternScale: 3.5 } },
      { name: 'Bark', patch: { background: 'bark', patternScale: 2.6 } },
      { name: 'Seabed', patch: { background: 'seabed', patternScale: 4.2 } },
      { name: 'Night', patch: { background: 'night', patternScale: 3 } },
      { name: 'Autumn', patch: { background: 'autumn', patternScale: 3.4 } },
    ],
  },
  {
    label: 'Arms race',
    options: [
      { name: 'Balanced', patch: { strikeRate: 14, acuityDrive: 0.5, mutationRate: 0.12, drift: 0.35 } },
      { name: 'Relentless eye', patch: { strikeRate: 22, acuityDrive: 0.9, mutationRate: 0.1, drift: 0.3 } },
      { name: 'Gentle', patch: { strikeRate: 8, acuityDrive: 0.25, mutationRate: 0.14, drift: 0.45 } },
      { name: 'Restless moths', patch: { strikeRate: 16, acuityDrive: 0.5, mutationRate: 0.2, drift: 0.8 } },
    ],
  },
]
