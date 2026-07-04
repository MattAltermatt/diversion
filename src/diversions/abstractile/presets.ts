import type { AbstractileConfig } from './schema'

// Palette = tile colours + the grout/background they sit on.
export const palettePresets: { name: string; patch: Pick<AbstractileConfig, 'palette' | 'background'> }[] = [
  { name: 'Bazaar', patch: { palette: ['#e6472f', '#f3a712', '#f6e8cb', '#1c8a8a', '#25446b'], background: '#141019' } },
  { name: 'Azulejo', patch: { palette: ['#f4f1e6', '#2f6fb0', '#1b3a6b', '#7fb5d8', '#d9e6f0'], background: '#0c1626' } },
  { name: 'Quilt', patch: { palette: ['#d94f4f', '#e8b04b', '#4f7a5a', '#f3ead6', '#8c4a6b'], background: '#221a17' } },
  { name: 'Linoleum', patch: { palette: ['#2a9d8f', '#e9c46a', '#e76f51', '#264653', '#f4f1de'], background: '#12110f' } },
  { name: 'Neon', patch: { palette: ['#ff3caa', '#12d9ff', '#faff5a', '#7a2fff', '#0affc2'], background: '#0a0a12' } },
  { name: 'Mono', patch: { palette: ['#f4f4fa', '#c8c8d2', '#7a7a86', '#3a3a42'], background: '#0a0a0d' } },
]

// Tile-set feel: an independent axis from colour.
export const stylePresets: { name: string; patch: Pick<AbstractileConfig, 'tileSet' | 'symmetry'> }[] = [
  { name: 'Kaleido Quilt', patch: { tileSet: 'Triangles', symmetry: 'Mirror' } },
  { name: 'Flowing Waves', patch: { tileSet: 'Arcs', symmetry: 'Rotate' } },
  { name: 'Fish Scale', patch: { tileSet: 'Quarters', symmetry: 'Translate' } },
  { name: 'Moorish', patch: { tileSet: 'Diamonds', symmetry: 'Mirror' } },
  { name: 'Basket Weave', patch: { tileSet: 'Bars', symmetry: 'Translate' } },
  { name: 'Grand Mosaic', patch: { tileSet: 'Mixed', symmetry: 'Mirror' } },
]
