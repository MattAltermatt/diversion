import type { HextrailConfig } from './schema'

// Two independent preset axes (mirrors differential-growth's Growth + Style):
//   • Palette — colour ramp + background + cyclic-vs-ramp
//   • Pace    — motion/density feel (seeds, speed, branchiness, hex size, fade)
// Seed is excluded from both so the 🎲 dice stays independent.

type PaletteFields = Pick<HextrailConfig, 'colors' | 'background' | 'colorWrap'>

export const palettePresets: { name: string; patch: PaletteFields }[] = [
  // Landing look — electric ice → violet → magenta on deep space black.
  { name: 'Neon', patch: { colorWrap: false, background: '#05060a',
      colors: ['#0b1e5c', '#3b46e0', '#8a3af0', '#e05ad6', '#ff9de8'] } },
  // Blackbody fire — deep ember → gold → pale white.
  { name: 'Ember', patch: { colorWrap: false, background: '#0a0604',
      colors: ['#3a0a06', '#a81f10', '#f0561a', '#ffab3d', '#ffe9b0'] } },
  // Northern lights — forest green → mint → cyan → violet crown.
  { name: 'Aurora', patch: { colorWrap: false, background: '#04080a',
      colors: ['#052b1a', '#0e9e5a', '#22e0a0', '#4fd0ff', '#b98cff'] } },
  // Endless cyclic hue drift (jwz-authentic 8-stop loop feel).
  { name: 'Prism', patch: { colorWrap: true, background: '#060608',
      colors: ['#f65b6b', '#f6a24a', '#dfd85a', '#5fd68a', '#4bbce6', '#8a7bf0'] } },
]

type PaceFields = Pick<HextrailConfig, 'seeds' | 'growthSpeed' | 'branchiness' | 'hexSize' | 'fadeSeconds' | 'holdSeconds'>

export const pacePresets: { name: string; patch: PaceFields }[] = [
  // One coherent bloom, slow creep, big legible cells — the calm default.
  { name: 'Zen', patch: { seeds: 1, growthSpeed: 10, branchiness: 0.28, hexSize: 34, fadeSeconds: 3.5, holdSeconds: 2 } },
  // A few colliding fronts, a touch bushier.
  { name: 'Bloom', patch: { seeds: 3, growthSpeed: 16, branchiness: 0.4, hexSize: 28, fadeSeconds: 3, holdSeconds: 1.5 } },
  // Many fast fronts racing across a fine lattice.
  { name: 'Cascade', patch: { seeds: 5, growthSpeed: 28, branchiness: 0.55, hexSize: 22, fadeSeconds: 2.5, holdSeconds: 1 } },
]
