// Shared colour parsing + mixing. Two numeric conventions coexist on purpose:
//   • Canvas diversions want 0-255 channels as { r, g, b, a } (`parseHex8` /
//     `parseHex6`) so they can interpolate and build `rgba(...)` strings.
//   • WebGL diversions want 0-1 floats as `[r, g, b]` (`hexToRgb`) to feed
//     straight into uniforms.
// Both forms used to be reimplemented per diversion; this is their canonical home.

export interface RGB { r: number; g: number; b: number }
export interface RGBA extends RGB { a: number }

/** "#rrggbbaa" → { r, g, b (0-255), a (0..1) }. */
export function parseHex8(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: parseInt(hex.slice(7, 9), 16) / 255,
  }
}

/** "#rrggbb" → opaque { r, g, b (0-255), a: 1 }. */
export function parseHex6(hex: string): RGBA {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: 1,
  }
}

/** "#rrggbb" → [r, g, b] as 0-1 floats — the WebGL-uniform form. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Linear-blend two RGB colours (0-255), rounding to integer channels. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  }
}

/** Build a CSS `rgba(...)` string from 0-255 channels (rounded) + an alpha
 *  (number or pre-formatted string). */
export function rgba(c: RGB, a: number | string): string {
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a})`
}

/** HSL (h in degrees, wrapped; s/l in 0–100) → integer 0–255 RGB. */
export function hslToRgb(h: number, s: number, l: number): RGB {
  h = ((h % 360) + 360) % 360
  const sn = s / 100, ln = l / 100
  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

// OKLab: a perceptually uniform space. Clustering photo pixels in sRGB groups by
// voltage rather than by appearance — two colours a viewer calls "the same green"
// can sit further apart in sRGB than one of them sits from a grey.
export interface Lab { L: number; a: number; b: number }

function toLinear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function fromLinear(v: number): number {
  const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055
  return Math.max(0, Math.min(255, Math.round(s * 255)))
}

/** 0-255 sRGB channels → OKLab (Ottosson's matrices). L lands in 0..1. */
export function srgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
}

/** OKLab → "#rrggbb". Out-of-gamut input clamps per channel, never NaN. */
export function oklabToHex({ L, a, b }: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
  const r = fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  const g = fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  const bb = fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
  return `#${((r << 16) | (g << 8) | bb).toString(16).padStart(6, '0')}`
}
