import type { RaymarcherConfig } from './schema'

// Form = the sculpture's composition: how many primitives, how fused, how fast it
// reshapes. All options patch the SAME key-set (matchPresets' equal-key-set assumption).
export const formPresets: { name: string; patch: Pick<RaymarcherConfig, 'primitives' | 'blend' | 'morphSpeed'> }[] = [
  { name: 'Molten Core', patch: { primitives: 3, blend: 1.2, morphSpeed: 0.15 } },
  { name: 'Cluster', patch: { primitives: 5, blend: 0.35, morphSpeed: 0.3 } },
  { name: 'Twin Orbit', patch: { primitives: 2, blend: 0.8, morphSpeed: 0.4 } },
]

// Palette = the surface color ramp + the backdrop it's set against.
export const palettePresets: { name: string; patch: Pick<RaymarcherConfig, 'palette' | 'skyHorizon' | 'skyZenith'> }[] = [
  { name: 'Nebula', patch: { palette: ['#00e6ff', '#7b2ff7', '#ff2e93', '#ffcc33'], skyHorizon: '#05060f', skyZenith: '#161c3c' } },
  { name: 'Magma', patch: { palette: ['#ffd23f', '#ff9f1c', '#e8492c', '#3a0d0d'], skyHorizon: '#0a0503', skyZenith: '#2a0f08' } },
  { name: 'Glacier', patch: { palette: ['#e8fbff', '#7fdcff', '#2e8fd6', '#0e2a6b'], skyHorizon: '#040810', skyZenith: '#0d1f3d' } },
]
