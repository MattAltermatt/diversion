import type { AuroraConfig } from './schema'

// Activity = how energetic the display is — from a slow calm arc to a full substorm.
// All options patch the SAME key-set (matchPresets' equal-key-set assumption).
export const activityPresets: { name: string; patch: Pick<AuroraConfig, 'speed' | 'brightness' | 'raySharpness' | 'curtainScale'> }[] = [
  { name: 'Calm ribbons', patch: { speed: 0.18, brightness: 1.0, raySharpness: 0.4, curtainScale: 1.6 } },
  { name: 'Active dance', patch: { speed: 0.4, brightness: 1.3, raySharpness: 0.65, curtainScale: 2.2 } },
  { name: 'Substorm',     patch: { speed: 0.75, brightness: 1.7, raySharpness: 0.85, curtainScale: 3.0 } },
]

// Palette = the base → tip colour ramp along each curtain (green base up to the tips).
export const palettePresets: { name: string; patch: Pick<AuroraConfig, 'paletteStops'> }[] = [
  { name: 'Classic Green', patch: { paletteStops: ['#25ff86', '#1fe6c0', '#7d5cff', '#ff45c8'] } },
  { name: 'Emerald',       patch: { paletteStops: ['#06d94a', '#25ff86', '#7dffc0', '#e8fff2'] } },
  { name: 'Purple Rain',   patch: { paletteStops: ['#2affc8', '#6a8cff', '#b45cff', '#ff6ad6'] } },
  { name: 'Solar Red',     patch: { paletteStops: ['#37ff8a', '#c8e64a', '#ff7a3a', '#ff2d55'] } },
]
