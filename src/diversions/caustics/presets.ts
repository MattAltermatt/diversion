import type { CausticsConfig } from './schema'

/** Two independent axes. `matchPresets` requires an equal key-set per group, so
 *  the `Pick<>` is load-bearing — a group whose options name different fields
 *  reads "Custom" against everything.
 *
 *  Calm IS the shipped default and Pool IS the shipped palette, so both groups
 *  open on a NAME rather than "Custom" (#311). `presetSweep.test.ts` enforces it. */
export const waterPresets: {
  name: string
  patch: Pick<CausticsConfig, 'tempo' | 'ripple' | 'gust' | 'slosh' | 'depth' | 'tilt' | 'spread'>
}[] = [
  // Every value sits on its slider's step grid — `ripple` on (min 0.0015, step
  // 0.0002), which is why Breezy reads 0.0069 and not the mockup's 0.0070:
  // (0.0070 - 0.0015) / 0.0002 = 27.5, i.e. a value the slider cannot reach.
  { name: 'Calm', patch: { tempo: 0.001, ripple: 0.0035, gust: 0.22, slosh: 0.7, depth: 1, tilt: 1.78, spread: 0.28 } },
  { name: 'Open water', patch: { tempo: 0.001, ripple: 0.0035, gust: 0.22, slosh: 0, depth: 1, tilt: 1.78, spread: 0.28 } },
  { name: 'Breezy', patch: { tempo: 0.0022, ripple: 0.0069, gust: 0.7, slosh: 0.55, depth: 1.4, tilt: 1.86, spread: 0.45 } },
  { name: 'Deep end', patch: { tempo: 0.001, ripple: 0.0051, gust: 0.3, slosh: 0.8, depth: 2.6, tilt: 1.9, spread: 0.3 } },
]

export const palettePresets: {
  name: string
  patch: Pick<CausticsConfig, 'background' | 'light'>
}[] = [
  // BOTH columns are the sRGB of what the mockup renders. The mockup bakes LINEAR
  // triples into the shader and gamma-encodes on output, so these are
  // `pow(linear, 1/2.2)` and the renderer uploads them back as `pow(hex, 2.2)`.
  // A raw hex upload renders a different colour than the picker shows.
  { name: 'Pool', patch: { background: '#2f626b', light: '#fffef6' } },
  { name: 'Deep', patch: { background: '#274f61', light: '#e4f9ff' } },
  { name: 'Lagoon', patch: { background: '#356e6d', light: '#eefff7' } },
]
