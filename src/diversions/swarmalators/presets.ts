// presets.ts — the five collective states of the swarmalator model, as one independent
// axis. Each patch sets the two coupling knobs (+ resets shimmer to the pure model), a
// consistent key-set within the group (matchPresets assumes equal key-sets per group).
// Coordinates verified against O'Keeffe–Hong–Strogatz 2017, Fig. 2/5.
import type { PresetGroup } from '../../framework/types'
import type { SwarmalatorsConfig } from './schema'

export const swarmalatorsPresets: PresetGroup<SwarmalatorsConfig>[] = [
  {
    label: 'State',
    options: [
      { name: 'Active phase wave', patch: { J: 1, K: -0.75, omegaSpread: 0 } },
      { name: 'Splintered phase wave', patch: { J: 1, K: -0.1, omegaSpread: 0 } },
      { name: 'Static phase wave', patch: { J: 1, K: 0, omegaSpread: 0 } },
      { name: 'Static sync', patch: { J: 0.1, K: 1, omegaSpread: 0 } },
      { name: 'Static async', patch: { J: 0.1, K: -1, omegaSpread: 0 } },
    ],
  },
]
