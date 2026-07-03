import type { PresetGroup } from '../../framework/types'
import type { SugarscapeConfig } from './schema'

// Scene bundles world dynamics; Palette swaps the landscape + agent colors. Each
// option within a group patches an identical key-set (matchPresets requirement).
export const sugarPresets: PresetGroup<SugarscapeConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Two mountains', patch: { regrowthRate: 1, seasons: false, reproduction: true, agentCount: 420 } },
      { name: 'Seasonal tides', patch: { regrowthRate: 1.2, seasons: true, reproduction: true, agentCount: 500 } },
      { name: 'Scarcity', patch: { regrowthRate: 0.4, seasons: false, reproduction: true, agentCount: 300 } },
      { name: 'Boom & bust', patch: { regrowthRate: 1.6, seasons: true, reproduction: true, agentCount: 700 } },
      { name: 'Fixed cohort', patch: { regrowthRate: 1, seasons: false, reproduction: false, agentCount: 500 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Amber', patch: { agentColor: 'wealth', land: { background: '#0a0704', low: '#5c3410', high: '#ffd27a', agent: '#7ff0ff' } } },
      { name: 'Verdant', patch: { agentColor: 'wealth', land: { background: '#04090a', low: '#125a2e', high: '#c9ff7a', agent: '#ff9de0' } } },
      { name: 'Ember', patch: { agentColor: 'fixed', land: { background: '#0b0402', low: '#7a1e0a', high: '#ffb038', agent: '#f4f0e8' } } },
      { name: 'Ice', patch: { agentColor: 'vision', land: { background: '#04070d', low: '#12406a', high: '#bff0ff', agent: '#ffcf6a' } } },
    ],
  },
]
