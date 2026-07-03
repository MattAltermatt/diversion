import type { PenroseConfig } from './schema'

// Palette = the two rhomb fills + edge + background.
export const palettePresets: { name: string; patch: Pick<PenroseConfig, 'thick' | 'thin' | 'edge' | 'background'> }[] = [
  { name: 'Amber Dusk', patch: { thick: '#e8a33a', thin: '#7a3b9a', edge: '#0e0a14', background: '#0e0a14' } },
  { name: 'Neon',       patch: { thick: '#00e0c8', thin: '#ff2d8e', edge: '#04060a', background: '#04060a' } },
  { name: 'Kilim',      patch: { thick: '#d8483a', thin: '#e8b23a', edge: '#1a0e08', background: '#241208' } },
  { name: 'Ocean',      patch: { thick: '#2a8ac8', thin: '#0e3a6a', edge: '#03080f', background: '#03080f' } },
  { name: 'Mono',       patch: { thick: '#e8e8ee', thin: '#5a5a66', edge: '#0a0a0c', background: '#0a0a0c' } },
]
