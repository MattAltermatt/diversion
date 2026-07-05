import type { PaperMarblingConfig } from './schema'

// Two independent preset axes (mirrors dla):
//   • Pattern — recipe + rake tuning (what shape the sheet takes)
//   • Palette — inks + paper (how it's coloured)
// Seed is excluded from both so the 🎲 dice stays independent.

type PatternFields = Pick<
  PaperMarblingConfig,
  'pattern' | 'dropCount' | 'dropSize' | 'combSpacing' | 'combStrength' | 'sharpness' | 'mixChance' | 'speed'
>

export const patternPresets: { name: string; patch: PatternFields }[] = [
  // Matches the schema defaults so the Pattern dropdown reads "Concentric Rings" on first load.
  { name: 'Concentric Rings', patch: { pattern: 'concentric', dropCount: 140, dropSize: 0.078,
      combSpacing: 0.08, combStrength: 0.14, sharpness: 0.4, mixChance: 0.06, speed: 0.1 } },
  { name: 'Drift', patch: { pattern: 'drift', dropCount: 160, dropSize: 0.075,
      combSpacing: 0.1, combStrength: 0.14, sharpness: 0.4, mixChance: 0.06, speed: 0.1 } },
  { name: 'Whirlpool', patch: { pattern: 'whirlpool', dropCount: 120, dropSize: 0.078,
      combSpacing: 0.1, combStrength: 0.14, sharpness: 0.4, mixChance: 0.06, speed: 0.1 } },
  { name: 'Stylus', patch: { pattern: 'stylus', dropCount: 120, dropSize: 0.078,
      combSpacing: 0.09, combStrength: 0.12, sharpness: 0.45, mixChance: 0.06, speed: 0.1 } },
  { name: 'Nonpareil', patch: { pattern: 'nonpareil', dropCount: 130, dropSize: 0.072,
      combSpacing: 0.08, combStrength: 0.14, sharpness: 0.4, mixChance: 0.06, speed: 0.1 } },
  { name: 'Peacock Feather', patch: { pattern: 'feather', dropCount: 140, dropSize: 0.068,
      combSpacing: 0.09, combStrength: 0.16, sharpness: 0.5, mixChance: 0.06, speed: 0.1 } },
  { name: 'Bouquet', patch: { pattern: 'bouquet', dropCount: 110, dropSize: 0.088,
      combSpacing: 0.12, combStrength: 0.18, sharpness: 0.35, mixChance: 0.06, speed: 0.1 } },
  { name: 'Stone', patch: { pattern: 'stone', dropCount: 170, dropSize: 0.078,
      combSpacing: 0.08, combStrength: 0.14, sharpness: 0.4, mixChance: 0.06, speed: 0.1 } },
  { name: 'Get-gel', patch: { pattern: 'getgel', dropCount: 7, dropSize: 0.09,
      combSpacing: 0.16, combStrength: 0.12, sharpness: 0.3, mixChance: 0.06, speed: 0.1 } },
]

type PaletteFields = Pick<PaperMarblingConfig, 'colors' | 'background' | 'paperGrain'>

export const palettePresets: { name: string; patch: PaletteFields }[] = [
  // Turkish Ebru — indigo, madder, ochre, teal, sage, plum, terracotta on cream.
  { name: 'Turkish Ebru', patch: {
      colors: ['#14213d', '#9b1d20', '#e0a458', '#3b7080', '#5c8a72', '#8c4a6b', '#d97642',
               '#2a9d8f', '#e9c46a', '#f2e8cf'],
      background: '#f2ead6', paperGrain: 0.35 } },
  // Suminagashi — sumi black & indigo tones on soft rice paper.
  { name: 'Suminagashi', patch: {
      colors: ['#161616', '#22314f', '#2b3a67', '#4a5a80', '#6d7b9c', '#9aa6bf', '#c9ccd6', '#e6e3d8'],
      background: '#efeae0', paperGrain: 0.25 } },
  // Venetian — carmine, imperial purple, gilt, bronze on antique parchment.
  { name: 'Venetian', patch: {
      colors: ['#5a1a2b', '#7b2d5e', '#9c3b52', '#b8863b', '#c9a24b', '#8a6d3b', '#e8d9a8', '#2c1f2b'],
      background: '#e9dcbf', paperGrain: 0.45 } },
  // Full spectrum — a wide rainbow of inks for concentric rainbow rings.
  { name: 'Full Spectrum', patch: {
      colors: ['#e63946', '#f3722c', '#f8961e', '#f9c74f', '#90be6d', '#43aa8b', '#4d908e',
               '#277da1', '#577590', '#9b5de5', '#c34a9d', '#e56b6f', '#fff3b0'],
      background: '#faf5ea', paperGrain: 0.25 } },
  // Modern bold — saturated poster inks on warm white.
  { name: 'Modern Bold', patch: {
      colors: ['#0d3b66', '#ee6c4d', '#f4d35e', '#08a045', '#c1121f', '#5a189a', '#00a5cf', '#ff8fab'],
      background: '#faf6ee', paperGrain: 0.2 } },
  // Nightfall — luminous inks on deep slate (high-contrast, gallery-dark).
  { name: 'Nightfall', patch: {
      colors: ['#00b4d8', '#e0aaff', '#ffd60a', '#ff477e', '#80ffdb', '#c77dff', '#ff9e00', '#f8f9fa'],
      background: '#10141c', paperGrain: 0.3 } },
]
