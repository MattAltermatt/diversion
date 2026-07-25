import type { ChimeConfig } from './schema'

// Two independent preset axes:
//   • Palette — the ramp the wavefronts are coloured along + the still ground.
//   • Rhythm  — the whole excitability regime (how many wells, how fast they fill,
//               how far they throw, how easily a passing wave tips them).
// Seed and the Look knobs (wake, width, glow, blend) stay independent of both.

type PaletteFields = Pick<ChimeConfig, 'colors' | 'background'>

export const palettePresets: { name: string; patch: PaletteFields }[] = [
  { name: 'Deep Water', patch: { colors: ['#2f6f9e', '#48b3cf', '#84e6e0', '#eafcff'], background: '#04070d' } },
  { name: 'Ember', patch: { colors: ['#8f3a12', '#d8631d', '#f5a83f', '#ffdc8c', '#fff6e0'], background: '#0a0503' } },
  { name: 'Aurora', patch: { colors: ['#2b6f7a', '#2fa877', '#68e39a', '#c2f9d2', '#eafff2'], background: '#03080a' } },
  { name: 'Sonar', patch: { colors: ['#2a7a45', '#3fb85e', '#72ea8c', '#e2ffe9'], background: '#020604' } },
  { name: 'Bruise', patch: { colors: ['#5b3aa0', '#8a4cc4', '#c76ad2', '#ff9fd8', '#ffe8f5'], background: '#06030c' } },
  { name: 'Ash', patch: { colors: ['#5c5c5c', '#8f8f8f', '#d8d8d8', '#ffffff'], background: '#050505' } },
  { name: 'Paper', patch: { colors: ['#c9c0ae', '#8a7f6b', '#4a4338', '#1d1a15'], background: '#efe9dc' } },
]

type RhythmFields = Pick<
  ChimeConfig,
  'nodeCount' | 'layout' | 'reach' | 'sizeSkew' | 'chargeSpeed' | 'rateSpread'
  | 'refractory' | 'waveSpeed' | 'sensitivity' | 'depthShield' | 'minCharge'
>

export const rhythmPresets: { name: string; patch: RhythmFields }[] = [
  // The landing regime — a slow breathing field, a screen-wide wash a minute or so.
  { name: 'Zen', patch: { nodeCount: 130, layout: 'even', reach: 1, sizeSkew: 0.55, chargeSpeed: 0.005,
      rateSpread: 0.45, refractory: 6, waveSpeed: 0.09, sensitivity: 0.5, depthShield: 0.85, minCharge: 0.3 } },
  // Twitchy medium — one release sets off a chain that walks across the field.
  { name: 'Cascade', patch: { nodeCount: 120, layout: 'even', reach: 0.7, sizeSkew: 0.35, chargeSpeed: 0.012,
      rateSpread: 0.5, refractory: 3, waveSpeed: 0.18, sensitivity: 0.12, depthShield: 0.3, minCharge: 0.08 } },
  // Long silences, then something enormous.
  { name: 'Rare Giants', patch: { nodeCount: 50, layout: 'even', reach: 1.35, sizeSkew: 0.9, chargeSpeed: 0.004,
      rateSpread: 0.35, refractory: 10, waveSpeed: 0.1, sensitivity: 0.6, depthShield: 1, minCharge: 0.3 } },
  // A busy shallow pond — lots of small taps, nothing travels far.
  { name: 'Chatter', patch: { nodeCount: 180, layout: 'scatter', reach: 0.3, sizeSkew: 0.5, chargeSpeed: 0.03,
      rateSpread: 0.6, refractory: 2, waveSpeed: 0.25, sensitivity: 0.25, depthShield: 0.4, minCharge: 0.1 } },
  // Lattice of wells — the rings meet in regular interference.
  { name: 'Standing Waves', patch: { nodeCount: 144, layout: 'grid', reach: 0.8, sizeSkew: 0.25, chargeSpeed: 0.014,
      rateSpread: 0.25, refractory: 5, waveSpeed: 0.12, sensitivity: 0.3, depthShield: 0.6, minCharge: 0.2 } },
  // Almost still: a handful of huge wells, minutes apart.
  { name: 'Tide', patch: { nodeCount: 26, layout: 'even', reach: 1.5, sizeSkew: 0.2, chargeSpeed: 0.003,
      rateSpread: 0.4, refractory: 12, waveSpeed: 0.08, sensitivity: 0.45, depthShield: 0.9, minCharge: 0.25 } },
]
