import type { LloydRelaxationConfig } from './schema'

// Palette = cell wheel + wall color. Cells are tinted around the wheel by position.
export const palettePresets: { name: string; patch: Pick<LloydRelaxationConfig, 'palette' | 'border'> }[] = [
  { name: 'Iridescent', patch: { palette: ['#0d2a4a', '#1a8fbf', '#6ee0d0', '#b0a0e8', '#e88ac0'], border: '#05070d' } },
  { name: 'Honey',      patch: { palette: ['#3a1e08', '#c8862a', '#f0c860', '#fff0c0'], border: '#1a0e04' } },
  { name: 'Coral',      patch: { palette: ['#08252e', '#0e8a7e', '#f0a840', '#e0506a', '#a03068'], border: '#03080a' } },
  { name: 'Slate',      patch: { palette: ['#1a2230', '#37506e', '#7a90a8', '#c0cede'], border: '#080b12' } },
  { name: 'Meadow',     patch: { palette: ['#0a2a12', '#2e8a3a', '#a8d84a', '#f0e070', '#5ac0a0'], border: '#04120a' } },
]
