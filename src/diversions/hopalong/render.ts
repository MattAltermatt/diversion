// Density → color for the hit-count accumulation buffer. Hopalong is
// space-filling (not filamentary like the sin/cos strange attractors), so a
// naive low-alpha additive plot reads as a flat wash. Instead every screen
// pixel keeps its own hit COUNT, and color is derived from a log tone curve
// of that count against the running peak — so both the fine, sparsely-hit
// orbit structure and the bright, densely-hit caustic edges stay visible in
// the same frame.
//
// The LUT is three parallel Uint8Array channels (not an array of {r,g,b}
// objects) and the hot per-point loop in index.ts reads straight out of them
// — no per-point object allocation, which matters at tens of thousands of
// points/frame.
import { parseHex6 } from '../../framework/color'

export const LUT_SIZE = 256

// The tone curve normalizes against a FIXED density reference, not the running
// peak. A running peak is unstable for this piece: with drift on, the orbit is
// exploratory and the peak sits low (~15-25), so any fraction of it is reached
// by nearly every cell and the whole field clips to white; a full-peak divisor
// swings the other way and crushes the structure into the palette's dark floor.
// A fixed reference maps the density range the eye actually sees — a single-hit
// cell to the palette start, a cell at DENSITY_REF to its bright end — so the
// gradient reads the same regardless of seed/drift, and rare dense cusps simply
// clip to white. A tiny FLOOR trims only true background (log1p is nonzero at
// count 1, so without it a never-hit cell and a once-hit cell would tie).
const DENSITY_REF = 24
const TONE_DENOM = Math.log1p(DENSITY_REF)
const TONE_FLOOR = 0.02

/** count -> 0..1 brightness against a fixed density reference (maxCount unused,
 *  kept for call-site symmetry with the accumulation buffer). */
export function toneOf(count: number, _maxCount: number): number {
  if (count <= 0) return 0
  const raw = Math.log1p(count) / TONE_DENOM
  if (raw <= TONE_FLOOR) return 0
  const t = (raw - TONE_FLOOR) / (1 - TONE_FLOOR)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** t in [0,1] -> nearest LUT index. */
export function lutIndex(t: number): number {
  const i = (t * (LUT_SIZE - 1) + 0.5) | 0
  return i < 0 ? 0 : i > LUT_SIZE - 1 ? LUT_SIZE - 1 : i
}

export interface PaletteLUT { r: Uint8Array; g: Uint8Array; b: Uint8Array }

/** Evenly-spaced linear interpolation across hex6 `stops` at t in [0,1]
 *  (non-cyclic — the palette is a brightness ramp, not a wheel). */
function paletteChannelsAt(stops: { r: number; g: number; b: number }[], t: number) {
  const n = stops.length
  if (n === 1) return stops[0]
  const scaled = t * (n - 1)
  let i = Math.floor(scaled)
  if (i >= n - 1) i = n - 2
  const f = scaled - i
  const a = stops[i], b = stops[i + 1]
  return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f }
}

/** Precompute a LUT_SIZE-entry RGB ramp from the palette's hex6 stops so the
 *  per-point hot loop indexes typed arrays instead of re-parsing hex + lerping. */
export function buildPaletteLUT(hexColors: string[]): PaletteLUT {
  const stops = hexColors.map(parseHex6)
  const r = new Uint8Array(LUT_SIZE), g = new Uint8Array(LUT_SIZE), b = new Uint8Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = paletteChannelsAt(stops, i / (LUT_SIZE - 1))
    r[i] = c.r; g[i] = c.g; b[i] = c.b
  }
  return { r, g, b }
}
