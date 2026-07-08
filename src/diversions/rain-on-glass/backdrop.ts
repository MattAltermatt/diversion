// The blurred bokeh backdrop — soft glowing light blooms behind the glass. Baked
// once (setup, per seed) at a FIXED low resolution independent of the viewport,
// then stretched up at draw time — so a resize never needs a rebake (mirrors
// asteroids' nebula bake / the viewport-independent-geometry-resize gotcha).

import { mulberry32 } from '../../framework/rng'
import { parseHex6, parseHex8, type RGB, type RGBA } from '../../framework/color'
import type { RainOnGlassConfig } from './schema'

export const BACKDROP_W = 160
export const BACKDROP_H = 100

export interface Bloom {
  u: number // 0..1 horizontal position
  v: number // 0..1 vertical position
  r: number // 0..1 radius (fraction of backdrop size)
  color: RGBA // alpha doubles as glow intensity
}

/** Deterministic backdrop light blooms — depend only on seed + numLights +
 *  palette, so the same seed always produces the same city-lights layout. */
export function buildBlooms(cfg: RainOnGlassConfig): Bloom[] {
  const rng = mulberry32((cfg.seed ^ 0x51ed270b) >>> 0)
  const palette = cfg.palette.map(parseHex8)
  return Array.from({ length: cfg.numLights }, () => ({
    u: rng(),
    v: 0.12 + rng() * 0.76, // keep blooms off the very top/bottom edge
    r: 0.14 + rng() * 0.24,
    color: palette[Math.floor(rng() * palette.length) % palette.length],
  }))
}

/** Pure low-res pixel bake (deterministic, unit-testable): a dark background
 *  with overlapping soft radial blooms blended additively toward each light's
 *  color, falloff-weighted by distance and the light's own alpha/intensity. */
export function buildBackdropData(
  cfg: RainOnGlassConfig,
  w = BACKDROP_W,
  h = BACKDROP_H,
): Uint8ClampedArray {
  const blooms = buildBlooms(cfg)
  const bg: RGB = parseHex6(cfg.background)
  const data = new Uint8ClampedArray(w * h * 4)
  for (let j = 0; j < h; j++) {
    const v = j / h
    for (let i = 0; i < w; i++) {
      const u = i / w
      let r = bg.r, g = bg.g, b = bg.b
      for (const bloom of blooms) {
        const dx = u - bloom.u, dy = v - bloom.v
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d >= bloom.r) continue
        const falloff = 1 - d / bloom.r
        const glow = falloff * falloff * bloom.color.a // soft gaussian-ish, alpha = intensity
        r += (bloom.color.r - r) * glow
        g += (bloom.color.g - g) * glow
        b += (bloom.color.b - b) * glow
      }
      const o = (j * w + i) * 4
      data[o] = Math.min(255, r)
      data[o + 1] = Math.min(255, g)
      data[o + 2] = Math.min(255, b)
      data[o + 3] = 255
    }
  }
  return data
}
