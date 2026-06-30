import type { LeniaConfig } from './schema'

// Each pattern is a soup-viable growth/kernel regime (🎚️ starting points, confirmed
// to sustain at verify). μ/σ morph the field live; kernelRadius/kernel are structural.
export const patternPresets: {
  name: string
  patch: Pick<LeniaConfig, 'mu' | 'sigma' | 'kernelRadius' | 'kernel'>
}[] = [
  { name: 'Coral', patch: { mu: 0.150, sigma: 0.017, kernelRadius: 14, kernel: 'Smooth' } },
  { name: 'Cells', patch: { mu: 0.150, sigma: 0.030, kernelRadius: 14, kernel: 'Smooth' } },
  { name: 'Veins', patch: { mu: 0.200, sigma: 0.026, kernelRadius: 14, kernel: 'Smooth' } },
  { name: 'Rings', patch: { mu: 0.260, sigma: 0.042, kernelRadius: 11, kernel: 'Layered' } },
]

// Field value → color ramps, dark background (empty) → bright glowing core. 6-hex =
// opaque (no alpha slider). High contrast (UX invariant #5).
export const colorPresets: { name: string; patch: Pick<LeniaConfig, 'stops'> }[] = [
  { name: 'Bioluminescence', patch: { stops: ['#040a1a', '#0a6e7a', '#eafcff'] } },
  { name: 'Ember',           patch: { stops: ['#0a0400', '#b21d0a', '#ffd24a'] } },
  { name: 'Jade',            patch: { stops: ['#03130c', '#147a3e', '#d6ffe6'] } },
  { name: 'Spectral',        patch: { stops: ['#1a0a3a', '#0aa6c2', '#f5e84a', '#e84ab2'] } },
]
