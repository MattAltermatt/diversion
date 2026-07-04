import type { PresetOption } from '../../framework/types'
import type { BinaryRingConfig } from './schema'

// Pattern axis — the counter rule + its motion feel.
export const patternPresets: PresetOption<BinaryRingConfig>[] = [
  { name: 'Binary clock', patch: { pattern: 'binary', evolveSpeed: 4, rotation: 5 } },
  { name: 'Gray pulse',   patch: { pattern: 'gray', evolveSpeed: 6, rotation: 3 } },
  { name: 'XOR gasket',   patch: { pattern: 'xor', evolveSpeed: 6, rotation: 8 } },
]

// Look axis — patches the whole `color` group (nested group → supplied complete,
// spread at the top level) plus the glow that ties the mood together. All options
// share the SAME key set so matchPresets flips to "Custom" on any manual drift.
export const lookPresets: PresetOption<BinaryRingConfig>[] = [
  {
    name: 'Rising sun',
    patch: {
      glow: 0.55,
      color: { mode: 'warm-horizon', background: '#04060d', colorCycle: 6, colorA: '#ffcf5c', colorB: '#ff4d5e' },
    },
  },
  {
    name: 'Spectrum',
    patch: {
      glow: 0.5,
      color: { mode: 'spectrum', background: '#05060f', colorCycle: 6, colorA: '#ffcf5c', colorB: '#ff4d5e' },
    },
  },
  {
    name: 'Duotone',
    patch: {
      glow: 0.4,
      color: { mode: 'duotone', background: '#04060d', colorCycle: 6, colorA: '#38d9ff', colorB: '#ff5f9e' },
    },
  },
]
