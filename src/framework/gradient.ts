// Shared gradient sampling + trail-fade helpers. Two gradient shapes coexist:
//   • `sampleGradient` returns a CSS `rgba(...)` string and can wrap (cyclic),
//     used by the flow-field-family diversions that stroke directly.
//   • `sampleGradientRGBA` / `sampleCyclic` return interpolated { r, g, b, a }
//     used by the pixel-buffer diversions (Substrate, Sand Stroke, Squiral).
// All were reimplemented per diversion; this is their canonical home.

import { parseHex8, type RGBA } from './color'

/** "#rrggbbaa" → "rgba(r, g, b, a)" (alpha rounded to 3 dp). */
export function hexToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = Math.round((parseInt(hex.slice(7, 9), 16) / 255) * 1000) / 1000
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// A drawn mark survives ~1/fadeAlpha frames before the per-frame background wash
// erases it, so *perceived* trail length is ~1/alpha — hyperbolic in alpha. A
// slider that's linear in alpha therefore crowds almost all the visible change
// into the top few percent (the 99->100 cliff). Instead map the slider LINEARLY
// in survival-frames so equal steps feel equal. Endpoints unchanged: 0 = hard
// wipe (1 frame), 100 = longest trail (50 frames -> alpha 0.02).
const TRAIL_MIN_FRAMES = 1
const TRAIL_MAX_FRAMES = 50
/** trailLength 0..100 -> per-frame fade alpha (perceptually even; higher = longer trail). */
export function trailFadeAlpha(trailLength: number): number {
  const t = Math.min(1, Math.max(0, trailLength / 100))
  const survivalFrames = TRAIL_MIN_FRAMES + t * (TRAIL_MAX_FRAMES - TRAIL_MIN_FRAMES)
  return 1 / survivalFrames
}

/** 0..1 alpha -> two-digit hex byte for hex-append (e.g. 0.1376 -> "23"). */
export function toHex2(alpha: number): string {
  return Math.round(alpha * 255).toString(16).padStart(2, '0')
}

/** Linear-interpolate rgba across evenly-spaced `stops` at t in [0,1].
 *  wrap=true treats the stops as cyclic (last blends back to first) — for the
 *  flow-angle source, which rolls over at 2π. Returns an rgba() string in the
 *  same format as hexToRgba. */
export function sampleGradient(stops: string[], t: number, wrap: boolean): string {
  const tc = Math.min(1, Math.max(0, t))
  const n = stops.length
  const fmt = (r: number, g: number, b: number, a: number) =>
    `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`
  if (n === 1) {
    const c = parseHex8(stops[0])
    return fmt(c.r, c.g, c.b, c.a)
  }
  const segments = wrap ? n : n - 1
  const scaled = tc * segments
  let i = Math.floor(scaled)
  if (i >= segments) i = segments - 1 // pull t===1 into the last segment
  const f = scaled - i
  const a = parseHex8(stops[i])
  const b = parseHex8(stops[wrap ? (i + 1) % n : i + 1])
  return fmt(
    Math.round(a.r + (b.r - a.r) * f),
    Math.round(a.g + (b.g - a.g) * f),
    Math.round(a.b + (b.b - a.b) * f),
    a.a + (b.a - a.a) * f,
  )
}

/** Linear-interpolate RGBA across evenly-spaced hex8 `stops` at t in [0,1].
 *  Returns interpolated channels (0-255, a 0..1) without rounding. */
export function sampleGradientRGBA(stops: string[], t: number): RGBA {
  const tc = Math.min(1, Math.max(0, t))
  const n = stops.length
  if (n === 1) return parseHex8(stops[0])
  const scaled = tc * (n - 1)
  let i = Math.floor(scaled)
  if (i >= n - 1) i = n - 2
  const f = scaled - i
  const a = parseHex8(stops[i])
  const b = parseHex8(stops[i + 1])
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
    a: a.a + (b.a - a.a) * f,
  }
}

/** Like sampleGradientRGBA but cyclic: stop[n-1] interpolates back to stop[0]. */
export function sampleCyclic(stops: string[], t: number): RGBA {
  return sampleGradientRGBA([...stops, stops[0]], ((t % 1) + 1) % 1)
}
