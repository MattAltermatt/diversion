import type { PresetGroup } from '../../framework/types'
import type { SlimeAggregationConfig } from './schema'

// Two independent axes: Pattern shapes the excitable regime + pacemaker count;
// Palette swaps the field ramp + stream accent. waveSpeed/chemotaxisStrength/seed
// stay user-controlled outside both.
export const patternPresets: PresetGroup<SlimeAggregationConfig>['options'] = [
  { name: 'Classic relay', patch: { excitability: 0.4, waveWidth: 4, recoveryTime: 20, pacemakerCount: 4 } },
  { name: 'Tight spirals', patch: { excitability: 0.55, waveWidth: 3, recoveryTime: 10, pacemakerCount: 3 } },
  { name: 'Broad target waves', patch: { excitability: 0.3, waveWidth: 6, recoveryTime: 34, pacemakerCount: 2 } },
  { name: 'Many centers', patch: { excitability: 0.45, waveWidth: 4, recoveryTime: 16, pacemakerCount: 8 } },
]

const AURORA = [
  '#05040a', '#170a2e', '#2c1050', '#43126d', '#5e1585', '#7c1a92', '#9c2496',
  '#bc3690', '#d85484', '#ec7a80', '#f9a688', '#ffd0a0', '#fff0c8',
]
const FERROIN = [
  '#0a0402', '#1f0a03', '#3a1004', '#5c1505', '#821a06', '#a82508', '#c73d0c',
  '#e05a14', '#f17b24', '#fca23e', '#ffc768', '#ffe7a0', '#fffaf0',
]
const BIOLUM = [
  '#020814', '#04122a', '#082444', '#0c3d66', '#0f5a86', '#1279a0', '#1a9bb2',
  '#2cbcbc', '#4ed8ba', '#7fecad', '#b6fac9', '#e5ffe9', '#ffffff',
]

export const colorPresets: PresetGroup<SlimeAggregationConfig>['options'] = [
  { name: 'Aurora', patch: { palette: AURORA, streamColor: '#eafcff' } },
  { name: 'Ferroin (BZ dish)', patch: { palette: FERROIN, streamColor: '#fffdf5' } },
  { name: 'Bioluminescent', patch: { palette: BIOLUM, streamColor: '#f4fffb' } },
]
