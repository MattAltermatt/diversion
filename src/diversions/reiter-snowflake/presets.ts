import type { ReiterSnowflakeConfig } from './schema'

// Morphology = a spread/humidity/sharpness triple that grows a distinct crystal
// habit. 🎚️ starting points — confirm at verify (the look lives on these knobs).
export const morphologyPresets: {
  name: string
  patch: Pick<ReiterSnowflakeConfig, 'spread' | 'humidity' | 'sharpness'>
}[] = [
  { name: 'Stellar',  patch: { spread: 1.0, humidity: 0.5,  sharpness: 0.0012 } }, // branchy star
  { name: 'Fern',     patch: { spread: 1.3, humidity: 0.42, sharpness: 0.0006 } }, // feathery dendrites
  { name: 'Plate',    patch: { spread: 0.8, humidity: 0.75, sharpness: 0.006 } },  // solid hex plate
  { name: 'Needle',   patch: { spread: 0.7, humidity: 0.4,  sharpness: 0.002 } },  // thin spikes
  { name: 'Sectored', patch: { spread: 1.5, humidity: 0.6,  sharpness: 0.001 } },  // broad arms
]

// Crystal ramps: dark background → thin ice → bright core. High contrast.
export const colorPresets: { name: string; patch: Pick<ReiterSnowflakeConfig, 'stops'> }[] = [
  { name: 'Frost',   patch: { stops: ['#05070f', '#123a63', '#4fb3e8', '#eafcff'] } },
  { name: 'Gold',    patch: { stops: ['#0a0803', '#5a3a10', '#e0a83a', '#fff4d0'] } },
  { name: 'Rose',    patch: { stops: ['#0e050a', '#6b1f45', '#ff6ea8', '#ffe6f2'] } },
  { name: 'Emerald', patch: { stops: ['#03100a', '#0d5a3a', '#3ad88a', '#eafff2'] } },
  { name: 'Mono',    patch: { stops: ['#08080a', '#3a3a44', '#a8a8b4', '#ffffff'] } },
]
