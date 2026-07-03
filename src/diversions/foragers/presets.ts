import type { PresetGroup } from '../../framework/types'
import type { ForagersConfig } from './schema'

// Ecology sets the population/pellet density + evolution regime; Palette
// recolours foragers and pellets. Each option within a group patches an
// identical key-set.
export const foragersPresets: PresetGroup<ForagersConfig>[] = [
  {
    label: 'Ecology',
    options: [
      { name: 'Balanced meadow', patch: { creatureCount: 40, foodCount: 45, poisonCount: 20, roundSeconds: 12, mutationRate: 0.12 } },
      { name: 'Food-rich', patch: { creatureCount: 40, foodCount: 80, poisonCount: 8, roundSeconds: 12, mutationRate: 0.1 } },
      { name: 'Poison gauntlet', patch: { creatureCount: 40, foodCount: 35, poisonCount: 55, roundSeconds: 14, mutationRate: 0.12 } },
      { name: 'Crowded colony', patch: { creatureCount: 90, foodCount: 70, poisonCount: 30, roundSeconds: 12, mutationRate: 0.12 } },
      { name: 'Fast evolution', patch: { creatureCount: 40, foodCount: 45, poisonCount: 20, roundSeconds: 7, mutationRate: 0.22 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Meadow', patch: { creatureColors: { slow: '#2a6cff', fast: '#6ff0ff' }, foodColor: '#5CFF7A', poisonColor: '#ff3050', background: '#080a12' } },
      { name: 'Ocean', patch: { creatureColors: { slow: '#1f6fae', fast: '#8ee4ff' }, foodColor: '#3affc4', poisonColor: '#ff2d95', background: '#05100f' } },
      { name: 'Amber dusk', patch: { creatureColors: { slow: '#8a5a2a', fast: '#ffcf8a' }, foodColor: '#ffe066', poisonColor: '#ff3b3b', background: '#100a05' } },
      { name: 'Mono ice', patch: { creatureColors: { slow: '#3a5a8a', fast: '#bfe0ff' }, foodColor: '#ffffff', poisonColor: '#ff4040', background: '#0a0a0a' } },
    ],
  },
]
