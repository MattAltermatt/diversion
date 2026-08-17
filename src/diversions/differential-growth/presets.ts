import type { DifferentialGrowthConfig } from './schema'

// Two independent preset axes (mirrors Flow Field's Flow + Color):
//   • Growth — the simulation feel (fold wavelength, fineness, pace, irregularity)
//   • Style  — render treatment + palette (line vs fill, colour mode, glow, trail)
// Seed is excluded from both so the 🎲 dice stays independent.

type GrowthFields = Pick<
  DifferentialGrowthConfig,
  'repulsionRadius' | 'splitLength' | 'speed'
  | 'repulsionStrength' | 'attractionStrength' | 'alignment' | 'growthBias'
>

export const growthPresets: { name: string; patch: GrowthFields }[] = [
  { name: 'Coral', patch: { repulsionRadius: 22, splitLength: 9, speed: 40,
      repulsionStrength: 0.6, attractionStrength: 0.45, alignment: 0.1, growthBias: 0.25 } },
  { name: 'Cerebral', patch: { repulsionRadius: 30, splitLength: 11, speed: 36,
      repulsionStrength: 0.6, attractionStrength: 0.45, alignment: 0.08, growthBias: 0.4 } },
  { name: 'Kelp', patch: { repulsionRadius: 40, splitLength: 14, speed: 46,
      repulsionStrength: 0.5, attractionStrength: 0.4, alignment: 0.18, growthBias: 0.15 } },
  { name: 'Fine Weave', patch: { repulsionRadius: 14, splitLength: 6, speed: 52,
      repulsionStrength: 0.55, attractionStrength: 0.5, alignment: 0.1, growthBias: 0.2 } },
]

type StyleFields = Pick<
  DifferentialGrowthConfig,
  'renderStyle' | 'colorMode' | 'smoothing' | 'lineWidth' | 'glow' | 'history' | 'background' | 'colors'
>

export const stylePresets: { name: string; patch: StyleFields }[] = [
  // Landing look — deep-sea black, neon growth front glowing as it buds.
  { name: 'Bioluma', patch: { renderStyle: 'line', colorMode: 'age', smoothing: true,
      lineWidth: 1.25, glow: 0.4, history: 0.85, background: '#04060a',
      colors: ['#0e3b32', '#1f9e6b', '#5ff0c8', '#eafff8'] } },
  // Showpiece — warm fleshy brain-coral lobes with soft interior volume.
  { name: 'Ember Coral', patch: { renderStyle: 'membrane', colorMode: 'ink', smoothing: true,
      lineWidth: 1.0, glow: 0.2, history: 0.94, background: '#0b0705',
      colors: ['#5a1e12', '#c0492a', '#f2a24b', '#ffe9c2'] } },
  // Timeless line etching — faceted mono, clears each frame.
  { name: 'Ink', patch: { renderStyle: 'line', colorMode: 'ink', smoothing: false,
      lineWidth: 1.25, glow: 0, history: 1, background: '#0a0a0b',
      colors: ['#2a2a2e', '#5a5a62', '#9a9aa4', '#e8e8ee'] } },
  // Ambient endpoint — growth silts into layered contour strata.
  { name: 'Topographic', patch: { renderStyle: 'line', colorMode: 'sweep', smoothing: true,
      lineWidth: 0.75, glow: 0, history: 0, background: '#05070d',
      colors: ['#1b3a5f', '#2e8bba', '#7fe3d0', '#eafff7'] } },
  // The one light preset — pale ceramic lettuce-edge on warm paper, dark rim.
  { name: 'Porcelain', patch: { renderStyle: 'fillEdge', colorMode: 'ink', smoothing: true,
      lineWidth: 1.0, glow: 0, history: 1, background: '#f3efe7',
      colors: ['#d8cdbf', '#9a8f82', '#3a3f4a', '#10151d'] } },
]
