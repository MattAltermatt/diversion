import type { BoxfitConfig } from './schema'

// Two independent preset axes:
//   • Style — what packs and how it grows (the mosaic's shape + rhythm)
//   • Look  — palette + colouring (how it's coloured)
// Seed is excluded from both so the 🎲 dice stays independent.

type StyleFields = Pick<BoxfitConfig, 'shape' | 'gap' | 'maxSize' | 'growthSpeed' | 'spawnRate' | 'maxConcurrent'>

export const stylePresets: { name: string; patch: StyleFields }[] = [
  { name: 'Mondrian', patch: { shape: 'boxes', gap: 3.5, maxSize: 0.22, growthSpeed: 140, spawnRate: 12, maxConcurrent: 14 } },
  { name: 'Gravel', patch: { shape: 'boxes', gap: 1.5, maxSize: 0.09, growthSpeed: 180, spawnRate: 30, maxConcurrent: 26 } },
  { name: 'Bubbles', patch: { shape: 'circles', gap: 2, maxSize: 0.2, growthSpeed: 120, spawnRate: 14, maxConcurrent: 16 } },
  { name: 'Confetti', patch: { shape: 'mixed', gap: 2.5, maxSize: 0.15, growthSpeed: 160, spawnRate: 20, maxConcurrent: 20 } },
  { name: 'Zen', patch: { shape: 'boxes', gap: 4, maxSize: 0.26, growthSpeed: 70, spawnRate: 6, maxConcurrent: 4 } },
]

type LookFields = Pick<BoxfitConfig, 'colorMode' | 'background' | 'colors'>

export const lookPresets: { name: string; patch: LookFields }[] = [
  // Landing look — cool→warm ramp on GitHub-dark; by-size reveals the structure.
  { name: 'Spectrum', patch: { colorMode: 'by-size', background: '#0d1117',
      colors: ['#457b9d', '#2a9d8f', '#8cb369', '#e9c46a', '#f4a259', '#e63946'] } },
  // Classic de Stijl — primaries on white, cycling.
  { name: 'De Stijl', patch: { colorMode: 'random', background: '#f4f1e8',
      colors: ['#d1332e', '#f2c53d', '#1a4b8c', '#1a1a1a', '#e8e4d8'] } },
  // Neon tile — electric mosaic on near-black.
  { name: 'Neon', patch: { colorMode: 'palette-cycle', background: '#080610',
      colors: ['#00e5ff', '#7c4dff', '#ff2d95', '#ffd000', '#00ffa3'] } },
  // Terracotta — warm ceramic tiles, muted.
  { name: 'Terracotta', patch: { colorMode: 'by-size', background: '#1b120d',
      colors: ['#5c3a2e', '#a0522d', '#c97b4a', '#e0a96d', '#f2d3a0'] } },
  // Sea glass — soft translucent pebbles on ivory (the light look).
  { name: 'Sea Glass', patch: { colorMode: 'random', background: '#eef2ee',
      colors: ['#5f9ea0', '#88c0a8', '#a8d8c0', '#c7e6d7', '#7fb3b3'] } },
]
