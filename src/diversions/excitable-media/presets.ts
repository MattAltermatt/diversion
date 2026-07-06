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

// Intensity→color ramps: resting background (dark) → wave crest (bright), each a
// 16-stop perceptual gradient with even luminance steps (no muddy midtones), so the
// smoothed intensity field reads as a rich continuous sweep. 6-hex = opaque (no alpha
// slider). High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Pick<ExcitableMediaConfig, 'stops'> }[] = [
  { name: 'Ferroin',  patch: { stops: [ // violet → magenta → red-orange → warm cream
    '#080410', '#140820', '#211033', '#2f1442', '#431650', '#5b1854', '#771a50', '#941e45',
    '#b02838', '#c73a28', '#db4f1c', '#e86518', '#f27d1f', '#f89a3f', '#fbbd74', '#ffe6a0',
  ] } },
  { name: 'Aurora',   patch: { stops: [ // deep navy → blue → cyan → icy white
    '#04070f', '#061530', '#08214a', '#0a2f63', '#0c3d7d', '#0e4d93', '#105ea8', '#1372bb',
    '#1787cc', '#1e9dd8', '#2ab3e2', '#3fc7ea', '#63d6f0', '#93e4f5', '#c3f2fa', '#eafcff',
  ] } },
  { name: 'Poison',   patch: { stops: [ // near-black green → deep green → lime → pale
    '#05100a', '#072016', '#093021', '#0b3f24', '#0d5028', '#12602b', '#1a722e', '#268230',
    '#379434', '#4ca636', '#64b838', '#80c93c', '#9fd845', '#bfe45f', '#dcf089', '#eaffc8',
  ] } },
  { name: 'Amethyst', patch: { stops: [ // near-black violet → purple → orchid → white
    '#0a0512', '#150a24', '#211036', '#2e1649', '#3c1c5e', '#4b2373', '#5c2a89', '#6f339e',
    '#8340b0', '#9850c0', '#ad63ce', '#c07adb', '#d194e6', '#e0b1ef', '#efd3f7', '#ffe6ff',
  ] } },
  { name: 'Ink',      patch: { stops: [ // near-black → cool grey → white
    '#08080c', '#141419', '#1f1f26', '#2b2b33', '#383841', '#45454f', '#53535d', '#61616c',
    '#70707b', '#7f7f8a', '#8f8f99', '#a0a0a9', '#b2b2ba', '#c6c6cc', '#dcdce0', '#f2f2f8',
  ] } },
]
