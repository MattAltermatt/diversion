import type { ThreeBodyConfig } from './schema'

// Featured = a quick pick of the choreography to trace (or the full cycle).
export const featuredPresets: { name: string; patch: Pick<ThreeBodyConfig, 'orbit'> }[] = [
  { name: 'Cycle all', patch: { orbit: 'Cycle all' } },
  { name: 'Figure-8', patch: { orbit: 'Figure-8' } },
  { name: 'Butterfly I', patch: { orbit: 'Butterfly I' } },
  { name: 'Moth I', patch: { orbit: 'Moth I' } },
  { name: 'Bumblebee', patch: { orbit: 'Bumblebee' } },
]

// Palette = the three body colors + the dark ground they float on.
export const palettePresets: { name: string; patch: Pick<ThreeBodyConfig, 'colors' | 'background'> }[] = [
  { name: 'Aurora', patch: { colors: ['#5ef2c8', '#4d9bff', '#c77dff'], background: '#04060d' } },
  { name: 'Ember', patch: { colors: ['#ff6b3d', '#ffd23b', '#ff3b6b'], background: '#0a0503' } },
  { name: 'Neon', patch: { colors: ['#ff4fd8', '#39f5ff', '#b6ff3b'], background: '#050208' } },
  { name: 'Ghost', patch: { colors: ['#aee3ff', '#e8f0ff', '#7fb0e0'], background: '#060810' } },
  { name: 'Solar', patch: { colors: ['#ffe08a', '#ff9e3b', '#ff5a3c'], background: '#080402' } },
]
