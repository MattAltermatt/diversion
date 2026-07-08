import type { CloudLifeConfig } from './schema'

// Clouds = how fast the field churns and how long a clump survives before its
// age-weight starts exploding it.
export const cloudPresets: { name: string; patch: Pick<CloudLifeConfig, 'maxAge' | 'speed'> }[] = [
  { name: 'Slow Drift', patch: { maxAge: 96, speed: 10 } },
  { name: 'Balanced', patch: { maxAge: 64, speed: 22 } },
  { name: 'Turbulent', patch: { maxAge: 32, speed: 40 } },
]

// Palette = the young→old age ramp + the resting background. High contrast.
export const colorPresets: { name: string; patch: Pick<CloudLifeConfig, 'palette' | 'background'> }[] = [
  { name: 'Cirrus', patch: { palette: ['#eef7ff', '#a9d4f5', '#6f96d8', '#3c4a8f'], background: '#05070d' } },
  { name: 'Ember', patch: { palette: ['#fff6d8', '#ffcf6b', '#ff8a3d', '#8a2a1c'], background: '#0a0503' } },
  { name: 'Storm', patch: { palette: ['#e8e4f2', '#b6a8d6', '#7a5fa8', '#382056'], background: '#050308' } },
  { name: 'Bioluminescent', patch: { palette: ['#e4fff4', '#7dffd0', '#2ba887', '#123a52'], background: '#020a0c' } },
]
