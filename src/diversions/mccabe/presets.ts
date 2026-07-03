import type { MccabeConfig } from './schema'

// Pattern = feature size + contrast (from tight ridges to broad cells).
export const patternPresets: { name: string; patch: Pick<MccabeConfig, 'scale' | 'contrast'> }[] = [
  { name: 'Fingerprint', patch: { scale: 0.4, contrast: 1.9 } },
  { name: 'Reptile',     patch: { scale: 1.2, contrast: 1.6 } },
  { name: 'Islands',     patch: { scale: 2.2, contrast: 1.4 } },
]

// Color = the value ramp (low → high).
export const palettePresets: { name: string; patch: Pick<MccabeConfig, 'palette'> }[] = [
  { name: 'Copper',  patch: { palette: ['#0a0604', '#7a3b1e', '#e8a84a', '#fff2d8'] } },
  { name: 'Steel',   patch: { palette: ['#070b12', '#274060', '#6f95bf', '#eaf2ff'] } },
  { name: 'Ink',     patch: { palette: ['#050507', '#3a3a44', '#9a9aa8', '#f4f4fa'] } },
  { name: 'Emerald', patch: { palette: ['#04120c', '#0e6a4a', '#4ac88a', '#e8ffd8'] } },
  { name: 'Magma',   patch: { palette: ['#0a0410', '#7a1046', '#e85a2a', '#ffe86a'] } },
]
