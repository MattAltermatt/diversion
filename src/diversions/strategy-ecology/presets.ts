import type { PresetGroup } from '../../framework/types'
import type { StrategyEcologyConfig } from './schema'

// Scene bundles the game dynamics (which strategies, how tempting to defect, how to
// start); Palette swaps the strategy colours. Each option within a group patches an
// identical key-set (matchPresets requirement).
export const strategyPresets: PresetGroup<StrategyEcologyConfig>[] = [
  {
    label: 'Scene',
    options: [
      { name: 'Turnover (4-strategy)', patch: { strategySet: 'C / D / TFT / WSLS', seedPattern: 'random', temptation: 1.82, selfPlay: true } },
      { name: 'Nowak–May fronts', patch: { strategySet: 'C / D', seedPattern: 'random', temptation: 1.85, selfPlay: true } },
      { name: 'Evolving fractal', patch: { strategySet: 'C / D', seedPattern: 'single-defector', temptation: 1.9, selfPlay: true } },
      { name: 'Cutthroat', patch: { strategySet: 'C / D / TFT / WSLS', seedPattern: 'patches', temptation: 1.97, selfPlay: true } },
      { name: 'Gentle world', patch: { strategySet: 'C / D / TFT / WSLS', seedPattern: 'random', temptation: 1.55, selfPlay: true } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Classic', patch: { cellColors: { cooperate: '#3b82f6', defect: '#ff3b57', tft: '#2dd4a7', wsls: '#f5b000' } } },
      { name: 'Neon', patch: { cellColors: { cooperate: '#00e5ff', defect: '#ff2d95', tft: '#7cff4d', wsls: '#ffd000' } } },
      { name: 'Ember', patch: { cellColors: { cooperate: '#ffb347', defect: '#8a1414', tft: '#ffe8a3', wsls: '#e0521a' } } },
      { name: 'Ice & rust', patch: { cellColors: { cooperate: '#8ecbff', defect: '#c1440e', tft: '#d6f0ff', wsls: '#f0a03c' } } },
    ],
  },
]
