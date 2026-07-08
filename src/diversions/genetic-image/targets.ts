// Three tiny built-in "pictures" the genome evolves toward, each a pure
// per-pixel formula (no canvas, no randomness) so `buildTargetBuffer` is cheap,
// deterministic, and fully testable. The diversion cycles through all three,
// round-robin, whenever a picture resolves and holds (see geneticImage.ts
// `nextTarget`) — the schema's `target` field only picks the STARTING one.

import { createBuffer, type PixelBuffer } from './raster'

export const TARGET_KINDS = ['sunset', 'portrait', 'geometric'] as const
export type TargetKind = (typeof TARGET_KINDS)[number]

type RGB = readonly [number, number, number]

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function mixRgb(c1: RGB, c2: RGB, t: number): RGB {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return [lerp(c1[0], c2[0], k), lerp(c1[1], c2[1], k), lerp(c1[2], c2[2], k)]
}

// ─── Sunset: sky gradient + sun + two undulating hill silhouettes ───────────
const SKY_TOP: RGB = [27, 16, 53]
const SKY_HORIZON: RGB = [255, 140, 66]
const SUN: RGB = [255, 211, 92]
const HILL_FAR: RGB = [46, 30, 20]
const HILL_NEAR: RGB = [23, 15, 12]

function sunsetPixel(u: number, v: number): RGB {
  const horizon = 0.62
  const hillFar = horizon + 0.02 * Math.sin(u * Math.PI * 2.4 + 0.6)
  const hillNear = horizon + 0.06 + 0.03 * Math.sin(u * Math.PI * 3.7 + 2.1)
  if (v < hillFar) {
    const sunCx = 0.5
    const sunCy = horizon - 0.1
    if (Math.hypot(u - sunCx, v - sunCy) < 0.1) return SUN
    return mixRgb(SKY_TOP, SKY_HORIZON, v / horizon)
  }
  if (v < hillNear) return HILL_FAR
  return HILL_NEAR
}

// ─── Portrait: a simplified face — skin oval, hair cap, eyes, mouth ─────────
const PORTRAIT_BG: RGB = [46, 52, 64]
const HAIR: RGB = [30, 20, 16]
const EYE: RGB = [24, 18, 14]
const MOUTH: RGB = [150, 55, 55]
const SKIN: RGB = [232, 180, 140]

function portraitPixel(u: number, v: number): RGB {
  const faceCx = 0.5
  const faceCy = 0.56
  const faceRx = 0.22
  const faceRy = 0.29
  const dx = (u - faceCx) / faceRx
  const dy = (v - faceCy) / faceRy
  if (dx * dx + dy * dy > 1) return PORTRAIT_BG
  if (v < faceCy - faceRy * 0.35) return HAIR
  const eyeY = faceCy - faceRy * 0.15
  const eyeDx = faceRx * 0.42
  if (Math.hypot(u - (faceCx - eyeDx), v - eyeY) < 0.028) return EYE
  if (Math.hypot(u - (faceCx + eyeDx), v - eyeY) < 0.028) return EYE
  const mouthY = faceCy + faceRy * 0.5
  if (Math.abs(v - mouthY) < 0.02 && Math.abs(u - faceCx) < faceRx * 0.35) return MOUTH
  return SKIN
}

// ─── Geometric: overlapping saturated discs on a dark field ────────────────
const GEO_BG: RGB = [12, 12, 20]
const GEO_SHAPES: { cx: number; cy: number; r: number; color: RGB }[] = [
  { cx: 0.3, cy: 0.35, r: 0.28, color: [255, 92, 92] },
  { cx: 0.68, cy: 0.3, r: 0.22, color: [92, 180, 255] },
  { cx: 0.55, cy: 0.65, r: 0.26, color: [255, 214, 92] },
  { cx: 0.25, cy: 0.7, r: 0.18, color: [120, 230, 160] },
]

function geometricPixel(u: number, v: number): RGB {
  let color = GEO_BG
  for (const s of GEO_SHAPES) {
    if (Math.hypot(u - s.cx, v - s.cy) < s.r) color = s.color
  }
  return color
}

function pixelFor(kind: TargetKind, u: number, v: number): RGB {
  if (kind === 'sunset') return sunsetPixel(u, v)
  if (kind === 'portrait') return portraitPixel(u, v)
  return geometricPixel(u, v)
}

/** Render one built-in target to a fresh `width`x`height` pixel buffer. Pure
 *  function of (kind, size) — deterministic, no seed involved (the target set
 *  is fixed; only the mutation/evolution sequence is seeded). */
export function buildTargetBuffer(kind: TargetKind, width: number, height: number): PixelBuffer {
  const buf = createBuffer(width, height)
  const { data } = buf
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / height
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / width
      const [r, g, b] = pixelFor(kind, u, v)
      const idx = (y * width + x) * 3
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
    }
  }
  return buf
}
