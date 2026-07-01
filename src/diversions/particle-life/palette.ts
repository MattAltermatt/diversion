// palette.ts — species colors are DERIVED (preset name + species count), never
// stored per-species, so the URL snapshot stays clean. Colors are generated in
// OKLCH (see oklch.ts): each preset fixes a perceptual lightness L and chroma C and
// sweeps a hue range, so every species reads at the SAME brightness and the hue
// steps are perceptually even — unlike the old HSL sweep, where yellows glowed hot
// and blues went muddy at equal "L". Maximum, balanced contrast on black
// (UX invariants #1 readability, #5 contrast).
import { oklchToHex } from './oklch'

export type PaletteName = 'Spectrum' | 'Neon' | 'Pastel' | 'Ice' | 'Fire'

export const PALETTE_NAMES: PaletteName[] = ['Spectrum', 'Neon', 'Pastel', 'Ice', 'Fire']

interface PaletteSpec {
  lo: number // start hue (OKLCH degrees)
  hi: number // end hue
  L: number // perceptual lightness 0..1 (constant across the sweep)
  C: number // target chroma (gamut-mapped down per hue where sRGB can't reach it)
}

// OKLCH hue landmarks: red≈29 · orange≈70 · yellow≈110 · green≈145 · cyan≈195 ·
// blue≈264 · purple≈310 · magenta≈350.
const SPECS: Record<PaletteName, PaletteSpec> = {
  Spectrum: { lo: 0, hi: 360, L: 0.72, C: 0.15 }, // full wheel, vivid + even brightness
  Neon: { lo: 0, hi: 360, L: 0.80, C: 0.21 }, // brighter + pushed to the gamut edge → punchy
  Pastel: { lo: 0, hi: 360, L: 0.82, C: 0.07 }, // light, low-chroma (kept off near-white so additive glow doesn't blow out)
  Ice: { lo: 200, hi: 285, L: 0.75, C: 0.13 }, // cyan → blue family
  Fire: { lo: 25, hi: 100, L: 0.70, C: 0.15 }, // red → orange → yellow family
}

/** `n` distinct hex colors for the named palette. Hues are spaced by i/n across the
 *  preset's range (i/n, not i/(n-1), so a full-circle sweep never duplicates the
 *  first hue at the end). Falls back to Spectrum for an unknown name. */
export function paletteColors(name: PaletteName, n: number): string[] {
  const spec = SPECS[name] ?? SPECS.Spectrum
  const span = spec.hi - spec.lo
  const out: string[] = []
  const count = Math.max(1, n)
  for (let i = 0; i < count; i++) {
    const h = spec.lo + (span * i) / count
    out.push(oklchToHex(spec.L, spec.C, h))
  }
  return out
}
