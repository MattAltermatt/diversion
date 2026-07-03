import type { DoyleConfig } from './schema'

// Three independent preset axes:
//   • Spiral — the (p,q) type = arm count & coil tightness
//   • Look   — style + palette (how the circles are drawn & coloured)
//   • Motion — flow + spin
// detail is excluded so the Detail slider stays independent of the Spiral axis.

type SpiralFields = Pick<DoyleConfig, 'p' | 'q'>
// All in the dense regime (q≥6) where the packing reads as a clean Doyle spiral.
export const spiralPresets: { name: string; patch: SpiralFields }[] = [
  { name: 'Golden', patch: { p: 8, q: 20 } }, // the classic dense coil (modA≈1.43)
  { name: 'Fine', patch: { p: 12, q: 28 } },
  { name: 'Coil', patch: { p: 5, q: 16 } },
  { name: 'Whirl', patch: { p: 16, q: 28 } },
  { name: 'Bloom', patch: { p: 6, q: 20 } },
  { name: 'Bold', patch: { p: 4, q: 10 } },
]

type LookFields = Pick<DoyleConfig, 'style' | 'colorBy' | 'lineWidth' | 'glow' | 'background' | 'colors'>
export const lookPresets: { name: string; patch: LookFields }[] = [
  // Landing look — golden discs flowing on deep plum.
  { name: 'Gold', patch: { style: 'filled', colorBy: 'radius', lineWidth: 1.2, glow: 0.3,
      background: '#07040c', colors: ['#3a1a5e', '#7a2f8f', '#c8781f', '#f0b24a', '#ffe6a8', '#fff7e6'] } },
  // Neon rings glowing in the dark, coloured by arm so the arms sweep.
  { name: 'Neon', patch: { style: 'rings', colorBy: 'arm', lineWidth: 1.6, glow: 0.6,
      background: '#03040a', colors: ['#0affef', '#31a6ff', '#7b5cff', '#ff5fce', '#fff29a'] } },
  // Ocean — cool filled discs, concentric bands.
  { name: 'Ocean', patch: { style: 'filled', colorBy: 'radius', lineWidth: 1.2, glow: 0.25,
      background: '#020814', colors: ['#04233f', '#0a5a8f', '#2ba6c9', '#8be0d6', '#eafcf5'] } },
  // Copperplate line-art etching, no bloom.
  { name: 'Etching', patch: { style: 'rings', colorBy: 'radius', lineWidth: 1, glow: 0,
      background: '#0b0a08', colors: ['#5a4a2e', '#8f7a4a', '#c3ad74', '#f3e9d0'] } },
  // Ink — dark silhouette on warm paper (the light preset).
  { name: 'Ink', patch: { style: 'ink', colorBy: 'radius', lineWidth: 1.2, glow: 0,
      background: '#f2ecdd', colors: ['#241f2e'] } },
]

type MotionFields = Pick<DoyleConfig, 'flowSpeed' | 'rotateSpeed'>
export const motionPresets: { name: string; patch: MotionFields }[] = [
  { name: 'Drift', patch: { flowSpeed: 0.06, rotateSpeed: 0.03 } },
  { name: 'Still', patch: { flowSpeed: 0, rotateSpeed: 0.02 } },
  { name: 'Swift', patch: { flowSpeed: 0.16, rotateSpeed: 0.05 } },
  { name: 'Reverse', patch: { flowSpeed: -0.08, rotateSpeed: -0.03 } },
]
