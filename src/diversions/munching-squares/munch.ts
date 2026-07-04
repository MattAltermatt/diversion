// Munching Squares — HAKMEM item 146. On an N×N grid (N a power of two) light
// cell (x, y) when it satisfies the current XOR rule for step t, then step t
// (mod N). The lit set folds into the famous pulsing triangular XOR mosaic.
//
// This module is pure (no DOM): it decides which cells are lit and what palette
// index each takes. index.ts owns the canvas — it renders an N×N ImageData and
// nearest-neighbour scales it to the viewport, so the grid never re-allocates on
// resize (a stretched-square mapping).
import { mulberry32 } from '../../framework/rng'
import { hslToRgb } from '../../framework/color'
import type { ColorMode, MunchingSquaresConfig } from './schema'

/** A concrete munch rule (never 'auto' — that resolves to one of these). */
export type Variant = 'line' | 'fill' | 'shift'
const CONCRETE: Variant[] = ['line', 'fill', 'shift']

export interface DerivedParams {
  n: number // grid side, 2^gridPower
  variant: Variant // resolved rule (auto → seed pick)
  offset: number // shift-rule phase, 0..n-1 (seed-derived)
  seedPhase: number // starting color phase, 0..255 (seed-derived)
}

/** Resolve seed-driven params: the Auto rule variant, the Shift offset, and the
 *  starting color phase. Deterministic for a given seed — same seed, same look. */
export function deriveParams(cfg: MunchingSquaresConfig): DerivedParams {
  const n = 1 << cfg.gridPower
  const rng = mulberry32((cfg.seed >>> 0) || 1)
  const autoVariant = CONCRETE[Math.floor(rng() * CONCRETE.length)]
  const offset = Math.floor(rng() * n)
  const seedPhase = Math.floor(rng() * 256)
  const variant = cfg.rule === 'auto' ? autoVariant : (cfg.rule as Variant)
  return { n, variant, offset, seedPhase }
}

/** Is grid cell (x, y) lit at step t under `variant`? x, y, t all in 0..n-1. */
export function isLit(
  x: number, y: number, t: number, n: number, variant: Variant, offset: number,
): boolean {
  const mask = n - 1
  switch (variant) {
    case 'line':
      return y === (x ^ t)
    case 'fill':
      return y < (x ^ t)
    case 'shift':
      return y === (((x + offset) & mask) ^ t)
  }
}

/** Closed-form lit-cell count for a variant, independent of t. Line and Shift
 *  light exactly one y per x (a bijection over 0..n-1). Fill lights (x XOR t)
 *  cells per column, and x XOR t is a permutation of 0..n-1, so the total is the
 *  triangular number. Used by the headline probe test. */
export function expectedLitCount(variant: Variant, n: number): number {
  switch (variant) {
    case 'line':
    case 'shift':
      return n
    case 'fill':
      return (n * (n - 1)) / 2
  }
}

/** The palette index source for a lit cell, before the animated phase is added.
 *  Returns a value already scaled into 0..255. */
export function baseColorIndex(
  x: number, y: number, t: number, n: number, mode: ColorMode,
): number {
  switch (mode) {
    case 'xor':
      return ((x ^ y) * 256 / n) & 255
    case 'position':
      return ((x + y) * 256 / (2 * n)) & 255
    case 'time':
      return ((t * 256 / n) & 255)
  }
}

/** Full 0..255 palette index for a cell, folding in the animated color phase. */
export function cellColorIndex(
  x: number, y: number, t: number, n: number, mode: ColorMode, phase: number,
): number {
  return (baseColorIndex(x, y, t, n, mode) + phase) & 255
}

/** A 256-entry palette LUT as packed 0-255 channels. Sampled across the hue
 *  range so the animated phase can rotate through it for a smooth shimmer. */
export interface Lut {
  r: Uint8ClampedArray
  g: Uint8ClampedArray
  b: Uint8ClampedArray
}

export function buildLut(
  hueStart: number, hueSpan: number, saturation: number, lightness: number,
): Lut {
  const r = new Uint8ClampedArray(256)
  const g = new Uint8ClampedArray(256)
  const b = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) {
    const c = hslToRgb(hueStart + (hueSpan * i) / 256, saturation, lightness)
    r[i] = c.r; g[i] = c.g; b[i] = c.b
  }
  return { r, g, b }
}

/** Current integer step t in 0..n-1 from a (bounded) float accumulator. */
export function stepAt(stepAcc: number, n: number): number {
  return Math.floor(stepAcc) % n
}
