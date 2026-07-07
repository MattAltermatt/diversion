import type { SwirlingMagicConfig } from './schema'

type Patch = { name: string; patch: Partial<SwirlingMagicConfig> }

// Two independent axes. Style sets the generator + symmetry feel; Palette swaps
// the colour ramp + background together. Motion/trail knobs stay user-controlled.

// matchPresets requires every option in a group to patch the SAME key-set, so
// each Style option sets all cross-generator knobs (the inactive generator's
// values just fall back to schema defaults).
export const stylePresets: Patch[] = [
  {
    name: 'Vortex Ribbons',
    patch: { generator: 'Vortex', symmetry: 6, mirror: true, spin: 0.03,
             ribbons: 4, swirl: 1.2, breathe: 35, webPoints: 120, weave: 5, morph: 0.06 },
  },
  {
    name: 'Tight Whirl',
    patch: { generator: 'Vortex', symmetry: 8, mirror: true, spin: 0.05,
             ribbons: 6, swirl: 2.0, breathe: 24, webPoints: 120, weave: 5, morph: 0.06 },
  },
  {
    name: 'Faithful Web',
    patch: { generator: 'Web', symmetry: 6, mirror: true, spin: 0.03,
             ribbons: 4, swirl: 1.2, breathe: 35, webPoints: 120, weave: 5, morph: 0.06 },
  },
  {
    name: 'Dense Mandala',
    patch: { generator: 'Web', symmetry: 12, mirror: true, spin: 0.02,
             ribbons: 4, swirl: 1.2, breathe: 35, webPoints: 184, weave: 7, morph: 0.045 },
  },
]

export const palettePresets: Patch[] = [
  {
    name: 'Spectrum',
    patch: {
      palette: ['#ff4d6d', '#ff9e4d', '#ffe14d', '#7bff8a', '#4de1ff', '#4d7bff', '#b14dff', '#ff4de1'],
      background: '#05060a',
    },
  },
  {
    name: 'Aurora',
    patch: {
      palette: ['#0b1e3a', '#157f8f', '#52e0b8', '#c8f5b8', '#52e0b8', '#157f8f'],
      background: '#04101c',
    },
  },
  {
    name: 'Ember',
    patch: {
      palette: ['#2a0a05', '#7a1020', '#ff6a2a', '#ffe9c2', '#ff6a2a', '#7a1020'],
      background: '#0a0402',
    },
  },
  {
    name: 'Ultraviolet',
    patch: {
      palette: ['#1a0533', '#6a0dad', '#ff2bd6', '#38e6ff', '#ff2bd6', '#6a0dad'],
      background: '#05010f',
    },
  },
]
