import type { PresetOption } from '../../framework/types'
import type { MandalaConfig } from './schema'

// Palette + background pairs — each a self-contained jewel-toned world.
export const palettePresets: PresetOption<MandalaConfig>[] = [
  { name: 'Jewel', patch: { palette: ['#f4d35e', '#e8623a', '#c0306a', '#8e3bd6', '#2f9e7e', '#2a6fd6'], background: '#0a0812' } },
  { name: 'Lotus', patch: { palette: ['#ffd1e8', '#ff7aa8', '#d64f8f', '#a83ec0', '#ffe6a0'], background: '#160a1e' } },
  { name: 'Peacock', patch: { palette: ['#0fe0c0', '#12a5c8', '#2a5ad6', '#8e5ad6', '#f0c24a'], background: '#04121a' } },
  { name: 'Ember', patch: { palette: ['#ffe08a', '#ffab3d', '#f0592a', '#c0203a', '#7a1030'], background: '#160604' } },
  { name: 'Jade', patch: { palette: ['#eafff0', '#8ef0b4', '#2fd68e', '#12946e', '#c8f04a'], background: '#04140e' } },
  { name: 'Amethyst', patch: { palette: ['#f0e6ff', '#c8a0ff', '#9a5af0', '#6a30c0', '#f4a8d0'], background: '#0c0620' } },
]

// Motif family + symmetry character.
export const motifPresets: PresetOption<MandalaConfig>[] = [
  { name: 'Mixed', patch: { motifStyle: 'Mixed', symmetry: 12, mirror: true } },
  { name: 'Petal bloom', patch: { motifStyle: 'Petals', symmetry: 16, mirror: true } },
  { name: 'Dot lace', patch: { motifStyle: 'Dots', symmetry: 18, mirror: true } },
  { name: 'Lotus', patch: { motifStyle: 'Lotus', symmetry: 8, mirror: true } },
  { name: 'Geometric', patch: { motifStyle: 'Geometric', symmetry: 6, mirror: false } },
]
