import type { CwavesConfig } from './schema'

// Flow = how the gratings are arranged: near-parallel silk vs a woven mesh.
export const flowPresets: { name: string; patch: Pick<CwavesConfig, 'waveCount' | 'angleSpread' | 'frequencySpread'> }[] = [
  { name: 'Silk',    patch: { waveCount: 4, angleSpread: 0.12, frequencySpread: 0.2 } },
  { name: 'Aurora',  patch: { waveCount: 5, angleSpread: 0.35, frequencySpread: 0.35 } },
  { name: 'Weave',   patch: { waveCount: 6, angleSpread: 0.7, frequencySpread: 0.45 } },
  { name: 'Moiré',   patch: { waveCount: 8, angleSpread: 0.9, frequencySpread: 0.15 } },
]

// Palette = the gradient the field flows through (dark→light, high contrast).
export const colorPresets: { name: string; patch: Pick<CwavesConfig, 'palette'> }[] = [
  { name: 'Aurora',  patch: { palette: ['#060826', '#123a6a', '#1fb3a3', '#8ff0a8', '#f4f6ff'] } },
  { name: 'Ember',   patch: { palette: ['#0b0206', '#5a1020', '#d64525', '#ffb14a', '#fff2cf'] } },
  { name: 'Ocean',   patch: { palette: ['#040a1a', '#0d3b66', '#1f9bd6', '#8fe0f0', '#f2fbff'] } },
  { name: 'Orchid',  patch: { palette: ['#0d0420', '#4a0d5e', '#c02a9a', '#ff7fd6', '#ffe6fb'] } },
  { name: 'Ink',     patch: { palette: ['#0a0a0c', '#3a3a44', '#8a8a98', '#d8d8e0', '#f7f7fb'] } },
  { name: 'Spectrum', patch: { palette: ['#12043a', '#1f6fd0', '#22c07a', '#e8d13a', '#ff5d5d'] } },
]
