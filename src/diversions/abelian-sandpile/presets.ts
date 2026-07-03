import type { AbelianSandpileConfig } from './schema'

// Arrangement = how many rain sources (structural — reseeds the pile). One is the
// iconic perfectly-symmetric mandala; more collide into interacting fractals.
export const arrangementPresets: { name: string; patch: Pick<AbelianSandpileConfig, 'sources'> }[] = [
  { name: 'Mandala', patch: { sources: 1 } },
  { name: 'Twins',   patch: { sources: 2 } },
  { name: 'Trio',    patch: { sources: 3 } },
  { name: 'Cluster', patch: { sources: 5 } },
]

// Grain-count 0→3 ramps, dark background → bright dense core. High contrast.
export const colorPresets: { name: string; patch: Pick<AbelianSandpileConfig, 'stops'> }[] = [
  { name: 'Aurora', patch: { stops: ['#0b0a1e', '#4b2ea6', '#e0499a', '#ffd36e'] } },
  { name: 'Ember',  patch: { stops: ['#0a0603', '#7a1f0a', '#e8611a', '#ffd88a'] } },
  { name: 'Lagoon', patch: { stops: ['#04121a', '#0a6b7a', '#2ad0c0', '#eafff8'] } },
  { name: 'Copper', patch: { stops: ['#0a0806', '#5a3212', '#c8863c', '#ffe8c0'] } },
  { name: 'Mono',   patch: { stops: ['#0a0a0c', '#4a4a55', '#a8a8b5', '#f4f4fa'] } },
]
