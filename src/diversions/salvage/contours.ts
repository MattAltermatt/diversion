// The Contours source: Ablation's generated topographic map, handed to the colony as
// if it were a pixel image. It returns the same shape `quantize()` returns for a
// sprite — a band-index grid, a dark-to-light palette, a coverage mask — so the
// chunker, the crews and the mound never learn where the picture came from. The
// noise and the quantile banding are Ablation's own `buildField`, so the maps share
// one character — the same generator, at Salvage's box size and its own seed mix.
import { buildField } from '../ablation/field'
import { contrastFloor, contrastCeiling, type Quantized } from '../ablation/quantize'
import { srgbToOklab, oklabToHex, type Lab } from '../../framework/color'

export interface ContourOptions {
  seed: number
  /** Which picture this is in the run; each one gets a fresh map. */
  generation: number
  bw: number
  bh: number
  /** Band count — the `Colors` slider. The palette is resampled to this many stops. */
  colors: number
  /** The ramp, dark to light, as authored (any length ≥ 2). */
  palette: string[]
  featureSize: number
  roughness: number
  /** The ground the map sits on; the ramp is kept clear of it (see `groundPalette`). */
  background: string
}

/** One noise seed per (visit seed, generation): the second picture must not be the
 *  first one again. Two multiplicative mixes so consecutive generations land far
 *  apart in the noise's own seed space rather than one lattice step over. */
export function contourSeed(seed: number, generation: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(generation + 1, 0x85ebca77)) >>> 0
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  return h >>> 0
}

function hexToLab(hex: string): Lab {
  const v = parseInt(hex.slice(1, 7), 16)
  return srgbToOklab((v >> 16) & 255, (v >> 8) & 255, v & 255)
}

/** Resample a ramp to `n` stops by linear interpolation in OKLab, so a six-stop
 *  Bathymetric read at twelve bands is the same ramp with the steps halved, and at
 *  three it is the same ramp with every other tone dropped. The two end stops are
 *  returned verbatim — the darkest and lightest tones are the ones the ramp's
 *  author floored against the ground, and a round trip through OKLab would move
 *  them by a rounding step. `n === stops.length` returns the stops themselves. */
export function resamplePalette(stops: string[], n: number): string[] {
  const m = stops.length
  if (m === 0) return []
  if (n <= 1 || m === 1) return [stops[0]]
  if (n === m) return stops.slice()
  const labs = stops.map(hexToLab)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(stops[0]); continue }
    if (i === n - 1) { out.push(stops[m - 1]); continue }
    const p = (i / (n - 1)) * (m - 1)
    const lo = Math.floor(p), hi = Math.min(m - 1, lo + 1), t = p - lo
    const a = labs[lo], b = labs[hi]
    out.push(oklabToHex({ L: a.L + (b.L - a.L) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t }))
  }
  return out
}

/** The ramp at `n` stops, kept clear of the ground. A hand-authored ramp already stops
 *  short of the dark ground it was designed for, and is returned VERBATIM when it
 *  clears this one — the same rule Ablation applies. Only when an end stop would sink
 *  below `contrastFloor` or rise past `contrastCeiling` (a light Background under a
 *  ramp authored for black) is OKLab lightness remapped linearly so both ends clear,
 *  which keeps the ramp's spacing and hue and moves as little as possible. Without
 *  this the lightest band — one-sixth of every map by quantile — vanishes against a
 *  pale ground, drones and trails with it (UX invariant 5). */
export function groundPalette(stops: string[], n: number, background: string): string[] {
  const ramp = resamplePalette(stops, n)
  if (ramp.length < 2) return ramp
  const labs = ramp.map(hexToLab)
  let lMin = Infinity, lMax = -Infinity
  for (const l of labs) { if (l.L < lMin) lMin = l.L; if (l.L > lMax) lMax = l.L }
  const floor = contrastFloor(background), ceiling = contrastCeiling(background)
  if (lMin >= floor && lMax <= ceiling) return ramp
  let lo = Math.max(lMin, floor), hi = Math.min(lMax, ceiling)
  if (hi - lo < 0.05) { lo = floor; hi = ceiling }
  const span = lMax - lMin || 1
  return labs.map((l) => oklabToHex({ L: lo + ((l.L - lMin) / span) * (hi - lo), a: l.a, b: l.b }))
}

export function buildContours(o: ContourOptions): Quantized {
  const bands = Math.max(1, Math.min(o.colors, 255))
  const f = buildField({
    seed: contourSeed(o.seed, o.generation), cols: o.bw, rows: o.bh, bands,
    featureSize: o.featureSize, roughness: o.roughness,
  })
  return { idx: f.idx, palette: groundPalette(o.palette, bands, o.background), coverage: new Uint8Array(o.bw * o.bh).fill(1) }
}
