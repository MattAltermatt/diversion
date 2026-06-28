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
