import type { GoldenApollonianConfig } from './schema'

// Palette = ring color + sun glow.
export const palettePresets: { name: string; patch: Pick<GoldenApollonianConfig, 'ring' | 'sun'> }[] = [
  { name: 'Golden',  patch: { ring: '#ffc470', sun: '#ffcce0' } },
  { name: 'Ice',     patch: { ring: '#7ecbff', sun: '#d0eaff' } },
  { name: 'Emerald', patch: { ring: '#6ee0a0', sun: '#d0ffe0' } },
  { name: 'Magenta', patch: { ring: '#ff6ec0', sun: '#ffd0f0' } },
  { name: 'Silver',  patch: { ring: '#d8d8e0', sun: '#f0f0ff' } },
]
