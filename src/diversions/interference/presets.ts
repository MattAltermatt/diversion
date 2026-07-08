import type { InterferenceConfig } from './schema'

// Flow = how busy and fast the interference field reads, from a slow calm
// breathing pond up to a churning storm.
export const flowPresets: {
  name: string
  patch: Pick<InterferenceConfig, 'sourceCount' | 'frequency' | 'speed' | 'driftSpeed' | 'radius' | 'bands'>
}[] = [
  { name: 'Calm',       patch: { sourceCount: 3, frequency: 12, speed: 0.6, driftSpeed: 0.12, radius: 2.4, bands: 0.7 } },
  { name: 'Ripples',    patch: { sourceCount: 4, frequency: 20, speed: 1, driftSpeed: 0.25, radius: 1.8, bands: 1.1 } },
  { name: 'Turbulent',  patch: { sourceCount: 6, frequency: 32, speed: 1.6, driftSpeed: 0.5, radius: 1.3, bands: 1.8 } },
  { name: 'Storm',      patch: { sourceCount: 8, frequency: 44, speed: 2.2, driftSpeed: 0.8, radius: 1, bands: 2.4 } },
]

// Palette = the colour cycle the summed wave height sweeps through (wraps end-to-start).
export const colorPresets: { name: string; patch: Pick<InterferenceConfig, 'palette'> }[] = [
  { name: 'Pond',    patch: { palette: ['#03101f', '#0c5c78', '#2dd4bf', '#eafff8'] } },
  { name: 'Ember',   patch: { palette: ['#0d0402', '#7a1e0a', '#f2790a', '#ffe29a'] } },
  { name: 'Neon',    patch: { palette: ['#0a0014', '#5b0ea6', '#ff2fd0', '#4dffe0'] } },
  { name: 'Orchid',  patch: { palette: ['#0d0420', '#4a0d5e', '#c02a9a', '#ff9fe6'] } },
  { name: 'Mono',    patch: { palette: ['#050505', '#4a4a4a', '#c9c9c9', '#ffffff'] } },
]
