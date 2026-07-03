import type { ApollonianConfig } from './schema'

// Two independent preset axes:
//   • Look   — style + palette (how the packing is rendered & coloured)
//   • Motion — how it draws in / spins
// Seed and detail are excluded so the 🎲 dice and Detail slider stay independent.

type LookFields = Pick<ApollonianConfig, 'style' | 'colorBy' | 'boundary' | 'glow' | 'lineWidth' | 'background' | 'colors'>

export const lookPresets: { name: string; patch: LookFields }[] = [
  // Landing look — stained-glass jewels on deep indigo.
  { name: 'Stained Glass', patch: { style: 'filled', colorBy: 'depth', boundary: true, glow: 0.25, lineWidth: 1.4,
      background: '#05060c', colors: ['#4c2a95', '#8b39c0', '#d43f9a', '#ff6f5e', '#ffc84d', '#f5eeff'] } },
  // Neon foam — luminous rings glowing in the dark.
  { name: 'Neon Foam', patch: { style: 'rings', colorBy: 'size', boundary: true, glow: 0.6, lineWidth: 1.6,
      background: '#03040a', colors: ['#0affef', '#31a6ff', '#7b5cff', '#ff5fce', '#fff29a'] } },
  // Copperplate — fine line-art etching, no bloom.
  { name: 'Etching', patch: { style: 'rings', colorBy: 'depth', boundary: true, glow: 0, lineWidth: 1,
      background: '#0b0a08', colors: ['#5a4a2e', '#8f7a4a', '#c3ad74', '#f3e9d0'] } },
  // Molten — warm filled discs, ember gradient by size.
  { name: 'Molten', patch: { style: 'filled', colorBy: 'size', boundary: false, glow: 0.35, lineWidth: 1.4,
      background: '#0b0402', colors: ['#3a0d04', '#a83216', '#f0872b', '#ffd97a', '#fff4d6'] } },
  // Ivory relief — dark silhouette on warm paper (the light preset).
  { name: 'Relief', patch: { style: 'ink', colorBy: 'depth', boundary: true, glow: 0, lineWidth: 1.2,
      background: '#f2ecdd', colors: ['#2a2622', '#3d372f'] } },
]

type MotionFields = Pick<ApollonianConfig, 'growthSpeed' | 'rotateSpeed'>

export const motionPresets: { name: string; patch: MotionFields }[] = [
  { name: 'Unfurl', patch: { growthSpeed: 1, rotateSpeed: 0.05 } },
  { name: 'Instant', patch: { growthSpeed: 0, rotateSpeed: 0.04 } },
  { name: 'Still', patch: { growthSpeed: 1, rotateSpeed: 0 } },
  { name: 'Slow Spin', patch: { growthSpeed: 0.6, rotateSpeed: 0.16 } },
]
