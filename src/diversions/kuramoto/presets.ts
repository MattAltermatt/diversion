import type { KuramotoConfig } from './schema'

// Regime = coupling × frequency-spread, the balance that sets the character.
export const regimePresets: { name: string; patch: Pick<KuramotoConfig, 'coupling' | 'spread'> }[] = [
  { name: 'Spirals',     patch: { coupling: 1.0, spread: 0.45 } }, // rotating phase defects
  { name: 'Domains',     patch: { coupling: 1.8, spread: 0.3 } },  // big locked colour fields
  { name: 'Turbulent',   patch: { coupling: 0.6, spread: 0.9 } },  // restless churn
  { name: 'Crystallize', patch: { coupling: 2.6, spread: 0.15 } }, // sweeps toward global sync
  { name: 'Shimmer',     patch: { coupling: 0.9, spread: 0.2 } },  // gentle drifting waves
]

// Cyclic phase wheels (they wrap end→start). Vivid, high contrast.
export const colorPresets: { name: string; patch: Pick<KuramotoConfig, 'stops'> }[] = [
  { name: 'Spectrum', patch: { stops: ['#ff2d6b', '#ffb000', '#37e05a', '#00c2ff', '#7a4dff'] } },
  { name: 'Aurora',   patch: { stops: ['#0affc0', '#12a0ff', '#7a4dff', '#12a0ff'] } },
  { name: 'Fire',     patch: { stops: ['#2a0600', '#ff3a1e', '#ffd24a', '#ff3a1e'] } },
  { name: 'Ocean',    patch: { stops: ['#02121f', '#0a6fae', '#3ad8ff', '#0a6fae'] } },
  { name: 'Pastel',   patch: { stops: ['#ff9ecb', '#a0e0ff', '#c8ffb0', '#ffe6a0'] } },
]
