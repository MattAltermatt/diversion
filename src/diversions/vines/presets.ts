import type { PresetOption } from '../../framework/types'
import type { VinesConfig } from './schema'

// Two independent preset axes: Vine (structure/feel) and Palette (colour).
// Each patch is applied over the current config (top-level spread), and `colors`
// is a whole-array replacement.

export const vinePresets: PresetOption<VinesConfig>[] = [
  { name: 'Climbing bush', patch: { species: 'bush', iterations: 4, branchAngle: 24, angleJitter: 7, lengthDecay: 0.86, seedPoints: 3 } },
  { name: 'Feather fern', patch: { species: 'fern', iterations: 4, branchAngle: 22, angleJitter: 5, lengthDecay: 0.82, seedPoints: 2 } },
  { name: 'Open tree', patch: { species: 'tree', iterations: 4, branchAngle: 28, angleJitter: 9, lengthDecay: 0.9, seedPoints: 2 } },
  { name: 'Weeping willow', patch: { species: 'willow', iterations: 4, branchAngle: 20, angleJitter: 12, lengthDecay: 0.88, seedPoints: 3 } },
  { name: 'Wild thicket', patch: { species: 'bush', iterations: 5, branchAngle: 18, angleJitter: 16, lengthDecay: 0.84, seedPoints: 4 } },
]

export const palettePresets: PresetOption<VinesConfig>[] = [
  { name: 'Jade', patch: { background: '#060a08', colors: ['#153a20', '#2f7d3f', '#7ac74f', '#e9f7bf'] } },
  { name: 'Wisteria', patch: { background: '#0a070f', colors: ['#3a2560', '#7a53c0', '#b48ce6', '#f0e6ff'] } },
  { name: 'Autumn', patch: { background: '#0d0704', colors: ['#5a2a12', '#b5541f', '#e8a33d', '#fff0c2'] } },
  { name: 'Moonlit', patch: { background: '#03080a', colors: ['#0e3b3a', '#1f8f8a', '#63e0d0', '#eafffb'] } },
  { name: 'Coral bloom', patch: { background: '#0b0508', colors: ['#4a1533', '#c23a6b', '#ff8ab0', '#ffe6ef'] } },
]
