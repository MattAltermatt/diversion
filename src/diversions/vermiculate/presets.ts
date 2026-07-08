import type { VermiculateConfig } from './schema'

export interface VermiculatePreset { name: string; patch: Partial<VermiculateConfig> }

// All four share one key-set (worms/stepSize/speed/wander/curlLimit) so the
// Motion group stays a clean independent axis — see matchPresets' equal-key-set
// assumption in framework/presets.ts. The default config (12 worms, speed 60) sits
// between Calm and Meander; these offer the fuller range on demand.
export const motionPresets: VermiculatePreset[] = [
  { name: 'Calm', patch: { worms: 6, stepSize: 2.5, speed: 30, wander: 3, curlLimit: 25 } },
  { name: 'Meander', patch: { worms: 12, stepSize: 3, speed: 60, wander: 6, curlLimit: 40 } },
  { name: 'Coiling', patch: { worms: 10, stepSize: 2.5, speed: 55, wander: 10, curlLimit: 75 } },
  { name: 'Erratic', patch: { worms: 20, stepSize: 3.5, speed: 110, wander: 15, curlLimit: 70 } },
]

// All five share one key-set (background/colors) so the Palette group stays a
// clean independent axis. Bark & Ivory is the schema default — worm galleries
// carved pale into dark wood.
export const palettePresets: VermiculatePreset[] = [
  { name: 'Bark & Ivory', patch: { background: '#1c140c', colors: ['#1c140c', '#6b4a2f', '#c99a5b', '#f1e3c6'] } },
  { name: 'Chalkboard', patch: { background: '#12181a', colors: ['#12181a', '#2f4d52', '#79b7bd', '#eaf6f6'] } },
  { name: 'Ink on Ivory', patch: { background: '#f4efe1', colors: ['#f4efe1', '#c9b48a', '#7a5230', '#2a1a10'] } },
  { name: 'Neon Trace', patch: { background: '#06060a', colors: ['#06060a', '#3a1f6b', '#ff2bd1', '#2bffe0'] } },
  { name: 'Copper Verdigris', patch: { background: '#0d1a16', colors: ['#0d1a16', '#2f6b52', '#7fbf9e', '#e0c98a'] } },
]
