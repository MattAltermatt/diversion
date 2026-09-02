import type { PresetGroup } from '../../framework/types'
import type { SalvageConfig } from './schema'

// One axis: how the colony behaves. Every option patches the SAME key set
// (matchPresets rule), and Calm IS the defaults so the picker opens on a name (#311).
export const salvagePresets: PresetGroup<SalvageConfig>[] = [
  {
    label: 'Crew',
    options: [
      { name: 'Calm',          patch: { drones: 60,  strength: 3, chunkSize: 12, immunity: 20, trailFade: 25 } },
      { name: 'Swarm',         patch: { drones: 320, strength: 8, chunkSize: 12, immunity: 5,  trailFade: 10 } },
      { name: 'Heavy lifting', patch: { drones: 50,  strength: 2, chunkSize: 24, immunity: 20, trailFade: 40 } },
    ],
  },
]
