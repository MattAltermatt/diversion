import type { PresetGroup } from '../../framework/types'
import type { PursuitEvasionConfig } from './schema'

// Match-up sets the physics + evolution regime; Palette recolours the two sides.
// Each option within a group patches an identical key-set.
export const pursuitEvasionPresets: PresetGroup<PursuitEvasionConfig>[] = [
  {
    label: 'Match-up',
    options: [
      { name: 'Classic chase', patch: { preyCount: 48, predatorCount: 9, preySpeed: 210, predatorSpeed: 225, turnRate: 4.5, roundSeconds: 12, mutationRate: 0.12 } },
      { name: 'Wolfpack', patch: { preyCount: 60, predatorCount: 16, preySpeed: 220, predatorSpeed: 220, turnRate: 5, roundSeconds: 12, mutationRate: 0.12 } },
      { name: 'Lone hunters', patch: { preyCount: 40, predatorCount: 4, preySpeed: 205, predatorSpeed: 245, turnRate: 4, roundSeconds: 14, mutationRate: 0.1 } },
      { name: 'Agile prey', patch: { preyCount: 50, predatorCount: 10, preySpeed: 235, predatorSpeed: 225, turnRate: 6.5, roundSeconds: 12, mutationRate: 0.14 } },
      { name: 'Fast evolution', patch: { preyCount: 48, predatorCount: 9, preySpeed: 210, predatorSpeed: 225, turnRate: 4.5, roundSeconds: 7, mutationRate: 0.22 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Cool vs ember', patch: { preyColors: { slow: '#2a6cff', fast: '#6ff0ff' }, predatorColor: '#ff5030', background: '#080a12' } },
      { name: 'Mint vs magenta', patch: { preyColors: { slow: '#1fae7a', fast: '#8effc4' }, predatorColor: '#ff2d95', background: '#07100c' } },
      { name: 'Ice vs gold', patch: { preyColors: { slow: '#5b8cff', fast: '#cfe4ff' }, predatorColor: '#ffb020', background: '#05070e' } },
      { name: 'Mono heat', patch: { preyColors: { slow: '#3a5a8a', fast: '#bfe0ff' }, predatorColor: '#ff3838', background: '#0a0a0a' } },
    ],
  },
]
