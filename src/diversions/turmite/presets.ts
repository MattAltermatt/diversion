import type { PresetOption } from '../../framework/types'
import type { TurmiteConfig } from './schema'
import { RULES } from './schema'

// Human names for the curated rules, index-aligned with RULES.
const RULE_NAMES = [
  'Langton', 'Cardioid', 'Square Spiral', 'Bloom', 'Fractal', 'Woven',
  'Spiral Arms', 'Knot', 'Mirror Knot', 'Drift', 'Pinwheel', 'Stagger',
]

export const rulePresets: PresetOption<TurmiteConfig>[] = RULES.map((rule, i) => ({
  name: RULE_NAMES[i] ?? rule,
  patch: { rule },
}))

export const palettePresets: PresetOption<TurmiteConfig>[] = [
  {
    name: 'Tide',
    patch: { background: '#070910', palette: [
      '#0a1020ff', '#173a6bff', '#2f6fb0ff', '#5aa9e6ff', '#9bd1ffff', '#ffe7b0ff',
      '#ffd27aff', '#ff9e57ff', '#e8643cff', '#b83a3aff', '#7a2c4cff', '#3a2c5aff',
    ] },
  },
  {
    name: 'Ember',
    patch: { background: '#0c0606', palette: [
      '#160a08ff', '#3a160eff', '#6b2a12ff', '#a8451cff', '#e0712cff', '#ffa64dff',
      '#ffce7aff', '#ffe9b0ff', '#fff3d6ff', '#d68a5aff', '#9c4b3aff', '#5a241fff',
    ] },
  },
  {
    name: 'Moss',
    patch: { background: '#06100a', palette: [
      '#0a1810ff', '#12301cff', '#1f5230ff', '#2f7a46ff', '#52a868ff', '#86d199ff',
      '#c2eccbff', '#e8f6c2ff', '#d2e88aff', '#a8c95aff', '#6b8c3aff', '#3a5224ff',
    ] },
  },
  {
    name: 'Violet',
    patch: { background: '#0a0712', palette: [
      '#140a24ff', '#2a163aff', '#43215eff', '#6b3a9cff', '#9c5ad1ff', '#c79beeff',
      '#e8d6ffff', '#ffd6f0ff', '#ff9ed1ff', '#e8579cff', '#b83a6bff', '#5a2c4cff',
    ] },
  },
]
