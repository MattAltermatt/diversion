import type { DLAConfig } from './schema'

// Two independent preset axes:
//   • Growth — seed geometry + walk feel (what shape assembles)
//   • Look   — render treatment + palette (how it's coloured)
// Seed is excluded from both so the 🎲 dice stays independent.

type GrowthFields = Pick<DLAConfig, 'seedType' | 'stickProb' | 'driftBias' | 'speed'>

export const growthPresets: { name: string; patch: GrowthFields }[] = [
  { name: 'Frost Star', patch: { seedType: 'point', stickProb: 1, driftBias: 0, speed: 360 } },
  { name: 'Dense Coral', patch: { seedType: 'point', stickProb: 0.28, driftBias: 0, speed: 300 } },
  { name: 'Snowflake', patch: { seedType: 'ring', stickProb: 1, driftBias: 0, speed: 420 } },
  { name: 'Wind-swept', patch: { seedType: 'point', stickProb: 1, driftBias: 0.6, speed: 380 } },
  { name: 'Spires', patch: { seedType: 'line', stickProb: 1, driftBias: 0.45, speed: 440 } },
]

type LookFields = Pick<DLAConfig, 'particleSize' | 'glow' | 'colorByAge' | 'bands' | 'background' | 'colors'>

export const lookPresets: { name: string; patch: LookFields }[] = [
  // Landing look — icy blue frost glowing on deep midnight.
  { name: 'Frost', patch: { particleSize: 1.15, glow: 0.35, colorByAge: true, bands: 5,
      background: '#04060d', colors: ['#0a2f52', '#1f7fc0', '#57d6f2', '#eafcff'] } },
  // Fire coral — molten arrival rings.
  { name: 'Ember', patch: { particleSize: 1.3, glow: 0.45, colorByAge: true, bands: 6,
      background: '#0b0503', colors: ['#4a1005', '#c0431a', '#f39229', '#ffe6b0'] } },
  // Living lichen — verdant, matte, no bloom.
  { name: 'Lichen', patch: { particleSize: 1.4, glow: 0.08, colorByAge: true, bands: 4,
      background: '#070c07', colors: ['#123016', '#3f8f3a', '#9bd15a', '#f0ffd8'] } },
  // Mineral etching — single ink colour, crisp.
  { name: 'Silver', patch: { particleSize: 1.05, glow: 0, colorByAge: false, bands: 5,
      background: '#0a0b0e', colors: ['#3a3f47', '#7f8794', '#c3ccd6', '#f4f8ff'] } },
  // Gilded — warm gold rings on ivory (the light preset).
  { name: 'Gilt', patch: { particleSize: 1.2, glow: 0.15, colorByAge: true, bands: 7,
      background: '#f4efe4', colors: ['#7a5a1e', '#b98a2c', '#e0b551', '#3a2c10'] } },
]
