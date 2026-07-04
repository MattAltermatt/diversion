import type { CynosureConfig } from './schema'

// Palette = the color set + a matching background it floats on.
export const palettePresets: { name: string; patch: Pick<CynosureConfig, 'palette' | 'background'> }[] = [
  { name: 'Rothko', patch: { palette: ['#8a1c10', '#d4471f', '#e88a2a', '#c9302c', '#f2c14e'], background: '#140a08' } },
  { name: 'Albers', patch: { palette: ['#e4a72e', '#c25a2a', '#5a7a3a', '#2e5a4a', '#e8dcc0'], background: '#1a1712' } },
  { name: 'Sea Glass', patch: { palette: ['#5fb7b0', '#8fd0c4', '#3a7a8c', '#c9e6d8', '#2a4a5a'], background: '#0a1518' } },
  { name: 'Twilight', patch: { palette: ['#6a4a8c', '#c05a8c', '#e88a6a', '#3a3a6e', '#f0c0a0'], background: '#100a1a' } },
  { name: 'Nocturne', patch: { palette: ['#2a3a6e', '#3a6ab0', '#6ea0d0', '#d0d8e8', '#8a5ab0'], background: '#070a14' } },
]

// Motion = the pace and stillness of the recomposition.
export const motionPresets: { name: string; patch: Pick<CynosureConfig, 'driftSpeed' | 'rotate' | 'lifespan'> }[] = [
  { name: 'Meditative', patch: { driftSpeed: 0.2, rotate: true, lifespan: 40 } },
  { name: 'Drifting', patch: { driftSpeed: 0.45, rotate: true, lifespan: 22 } },
  { name: 'Still', patch: { driftSpeed: 0, rotate: false, lifespan: 60 } },
]
