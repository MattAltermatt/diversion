import type { FoamConfig } from './schema'

// Two independent preset axes. Foam patches cell size + pace (cellScale/simSpeed);
// Palette patches the cell colors + wall color. Seed and the wall-shape knobs stay
// user-controlled, outside both. 🎚️ starting points — confirm at verify.
export const foamPresets: { name: string; patch: Pick<FoamConfig, 'cellScale' | 'simSpeed'> }[] = [
  { name: 'Fine Bubbles', patch: { cellScale: 0.8, simSpeed: 2.5 } }, // delicate froth, many cells
  { name: 'Medium Foam',  patch: { cellScale: 1.5, simSpeed: 2.0 } }, // the default balance
  { name: 'Large Cells',  patch: { cellScale: 2.8, simSpeed: 1.4 } }, // bold, chunky bubbles
]

// Cell-color ramps + matching wall color. 6-hex = opaque (no alpha slider). High
// contrast between cells and walls (UX invariant #5).
export const palettePresets: { name: string; patch: Pick<FoamConfig, 'stops' | 'wallColor'> }[] = [
  { name: 'Soap Film',     patch: { stops: ['#7fe9ff', '#a99bff', '#ffd28a', '#8affc7'], wallColor: '#0a0d1a' } },
  { name: 'Stained Glass', patch: { stops: ['#d81e5b', '#f0a202', '#1b998b', '#3a86ff', '#8338ec'], wallColor: '#08060a' } },
  { name: 'Mono Ink',      patch: { stops: ['#e8e8ee', '#9aa0ad', '#4a4f5a'], wallColor: '#08080c' } },
]
