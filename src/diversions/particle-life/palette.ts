// palette.ts — species colors are DERIVED (preset name + species count), never
// stored per-species, so the URL snapshot stays clean. Colors are generated in
// OKLCH (see oklch.ts): each preset fixes a perceptual lightness L and chroma C and
// sweeps a hue range, so every species reads at the SAME brightness and the hue
// steps are perceptually even — unlike the old HSL sweep, where yellows glowed hot
// and blues went muddy at equal "L". Maximum, balanced contrast on black
// (UX invariants #1 readability, #5 contrast).
import { oklchToHex } from './oklch'

export type PaletteName = 'Mariners' | 'Spectrum' | 'Neon' | 'Pastel' | 'Ice' | 'Fire'

export const PALETTE_NAMES: PaletteName[] = ['Mariners', 'Spectrum', 'Neon', 'Pastel', 'Ice', 'Fire']

// A palette is either a HUE-SWEEP (constant L+C, sweep hue → N evenly-spaced species)
// or an ANCHOR RAMP (a fixed list of OKLCH stops sampled for N species). Sweeps give
// maximum even contrast across the wheel; anchor ramps let a specific brand identity
// (e.g. Mariners royal-blue + gold) drive the colors while staying legible per-species.
type SweepSpec = { kind: 'sweep'; lo: number; hi: number; L: number; C: number }
type AnchorSpec = { kind: 'anchors'; stops: Array<[L: number, C: number, H: number]> }
type PaletteSpec = SweepSpec | AnchorSpec

// OKLCH hue landmarks: red≈29 · orange≈70 · yellow≈110 · green≈145 · cyan≈195 ·
// blue≈264 · purple≈310 · magenta≈350.
const SPECS: Record<PaletteName, PaletteSpec> = {
  // Old-school Seattle Mariners (1977–86 trident era): royal blue → gold. Ordered
  // dark-blue → light-neutral → gold so interpolation for non-6 species counts passes
  // through the near-neutral silver. The shortest-path hue does cross the green band
  // between silver and cream, but at near-zero chroma there — so it reads as a pale
  // neutral, never as a vivid off-brand green.
  Mariners: {
    kind: 'anchors',
    stops: [
      [0.40, 0.11, 258], // navy
      [0.55, 0.15, 256], // royal blue
      [0.78, 0.09, 240], // sky / powder blue
      [0.90, 0.015, 250], // silver (kept off pure white so additive glow doesn't blow out)
      [0.88, 0.06, 92], // cream / pale gold
      [0.80, 0.145, 85], // Mariners gold
    ],
  },
  Spectrum: { kind: 'sweep', lo: 0, hi: 360, L: 0.72, C: 0.15 }, // full wheel, vivid + even brightness
  Neon: { kind: 'sweep', lo: 0, hi: 360, L: 0.80, C: 0.21 }, // brighter + pushed to the gamut edge → punchy
  Pastel: { kind: 'sweep', lo: 0, hi: 360, L: 0.82, C: 0.07 }, // light, low-chroma (kept off near-white so additive glow doesn't blow out)
  Ice: { kind: 'sweep', lo: 200, hi: 285, L: 0.75, C: 0.13 }, // cyan → blue family
  Fire: { kind: 'sweep', lo: 25, hi: 100, L: 0.70, C: 0.15 }, // red → orange → yellow family
}

/** Shortest-path hue interpolation (degrees) so a ramp never takes the long way round. */
function lerpHue(a: number, b: number, t: number): number {
  const d = ((((b - a) % 360) + 540) % 360) - 180
  return a + d * t
}

/** Sample `count` colors evenly along the piecewise-linear OKLCH ramp. count=1 → the
 *  first stop; otherwise t=i/(count-1) mapped across the segments (so count=stops.length
 *  returns the stops exactly). */
function anchorColors(stops: Array<[number, number, number]>, count: number): string[] {
  if (count === 1) return [oklchToHex(stops[0][0], stops[0][1], stops[0][2])]
  const segs = stops.length - 1
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const p = (i / (count - 1)) * segs
    const lo = Math.min(Math.floor(p), segs - 1)
    const f = p - lo
    const [l0, c0, h0] = stops[lo]
    const [l1, c1, h1] = stops[lo + 1]
    out.push(oklchToHex(l0 + (l1 - l0) * f, c0 + (c1 - c0) * f, lerpHue(h0, h1, f)))
  }
  return out
}

/** `n` distinct hex colors for the named palette. Sweeps space hues by i/n across the
 *  range (i/n, not i/(n-1), so a full-circle sweep never duplicates the first hue at the
 *  end); anchor ramps sample the stops. Falls back to Spectrum for an unknown name. */
export function paletteColors(name: PaletteName, n: number): string[] {
  const spec = SPECS[name] ?? SPECS.Spectrum
  const count = Math.max(1, n)
  if (spec.kind === 'anchors') return anchorColors(spec.stops, count)
  const span = spec.hi - spec.lo
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const h = spec.lo + (span * i) / count
    out.push(oklchToHex(spec.L, spec.C, h))
  }
  return out
}
