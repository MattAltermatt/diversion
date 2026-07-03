import type { ExcitableMediaConfig } from './schema'

// Pattern presets set the hodgepodge regime (recovery ceiling + infection/
// contagion selectivity + climb speed). 🎚️ starting points, confirm at verify.
export const patternPresets: {
  name: string
  patch: Pick<ExcitableMediaConfig, 'states' | 'k1' | 'k2' | 'g'>
}[] = [
  { name: 'Spirals',       patch: { states: 100, k1: 3, k2: 3, g: 20 } }, // classic dense rotating waves
  { name: 'Broad Scrolls', patch: { states: 180, k1: 3, k2: 3, g: 12 } }, // wide, slow, calm arms
  { name: 'Fine Waves',    patch: { states: 60,  k1: 3, k2: 3, g: 26 } }, // tight, quick ripples
  { name: 'Targets',       patch: { states: 100, k1: 4, k2: 4, g: 18 } }, // sparser, more concentric rings
  { name: 'Fingerprints',  patch: { states: 70,  k1: 2, k2: 3, g: 24 } }, // fine dense concentric ridges
]

// Intensity→color ramps: resting background (dark) → wave crest (bright).
// 6-hex = opaque (no alpha slider). High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Pick<ExcitableMediaConfig, 'stops'> }[] = [
  { name: 'Ferroin',  patch: { stops: ['#060310', '#5c1250', '#e8481f', '#ffe6a0'] } },
  { name: 'Aurora',   patch: { stops: ['#04070f', '#123a6b', '#2ad0ff', '#eafcff'] } },
  { name: 'Poison',   patch: { stops: ['#05100a', '#0d5a2e', '#6ee23a', '#eaffc8'] } },
  { name: 'Amethyst', patch: { stops: ['#0a0512', '#3a1a6b', '#b96bff', '#ffe6ff'] } },
  { name: 'Ink',      patch: { stops: ['#08080c', '#4a4a58', '#f2f2f8'] } },
]
