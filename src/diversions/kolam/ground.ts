// ─────────────────────────────────────────────────────────────────────────────
// GROUND — the courtyard floor. One `background` colour drives everything:
// `derivedGround` lifts/drops its OKLab L to make the warm highlight and the
// dark shadow of the gradient wash, and `paintGround` lays that gradient plus
// the anisotropic flow-field grain (`noise.ts`'s `warpedBands`, built for
// exactly this) at half resolution and upscales it.
//
// ⚠️ `parseHex6` (0-255), NEVER `hexToRgb` (0-1 floats), paired with
// `srgbToOklab` — `srgbToOklab` expects 0-255 channels (it runs each one
// through `toLinear(c) = (c/255...)`). Handing it 0-1 floats divides by 255
// again and collapses the whole sRGB cube into L in [0, 0.067]. Nothing in
// this file's own test suite catches that swap; see the mutation note below.
// ─────────────────────────────────────────────────────────────────────────────

import { parseHex6, srgbToOklab, oklabToHex, type Lab } from '../../framework/color'
import { makeFbm, warpedBands } from './noise'

type Canvas2D = OffscreenCanvas | HTMLCanvasElement

function makeCanvas(w: number, h: number): Canvas2D {
  return typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(w, h)
    : (() => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c })()
}

function ctx2dOf(c: Canvas2D) {
  return (c as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
}

/** How far the warm highlight lifts and the dark shadow drops, in OKLab L.
 *  `L_FLOOR`/`L_CEIL` are the clamp — kept well inside [0, 1] so a background
 *  already sitting AT an end (`#000000`, `#ffffff`) still has room on the far
 *  side to produce a stop distinct from `base`. `base` itself is always the
 *  input colour, unclamped — it's what "the background" means.
 *
 *  ⚠️ The floor/ceiling can't sit near 0/1 themselves: sRGB's 8-bit encoding
 *  has a toe near black where several hundredths of L round to the SAME
 *  channel value (`L=0.05` on a neutral still rounds to `#000000`, identical
 *  to the pure-black base). Measured against `oklabToHex` directly — 0.10/0.90
 *  is the first floor/ceiling pair that clears it with margin on both ends. */
const LIFT = 0.18
const DROP = 0.17
const L_FLOOR = 0.10
const L_CEIL = 0.90

function withL(lab: Lab, L: number): Lab {
  return { L, a: lab.a, b: lab.b }
}

/** Derive the gradient's warm/base/dark stops from one background colour.
 *  Same hue and chroma throughout (only `L` moves) — a lift/drop in OKLab L
 *  reads as "this ground caught more/less light", not as a colour swap. */
export function derivedGround(background: string): { base: string; warm: string; dark: string } {
  const { r, g, b } = parseHex6(background)
  const lab = srgbToOklab(r, g, b)
  const warmL = Math.min(L_CEIL, lab.L + LIFT)
  const darkL = Math.max(L_FLOOR, lab.L - DROP)
  return {
    base: background,
    warm: oklabToHex(withL(lab, warmL)),
    dark: oklabToHex(withL(lab, darkL)),
  }
}

/** The one resolved ground, cached by `resolveKey`. A module-level cache
 *  (mirrors the probe's `groundLayer`/`groundKey` globals) rather than a
 *  per-call rebuild — the flow-field pass is the expensive part, and repeated
 *  `frame()` calls at unchanged size/colour/seed must not repay it every tick. */
let cache: { key: string; canvas: Canvas2D } | null = null

function resolveKey(bg: string, grain: number, width: number, height: number, seed: number): string {
  // ⚠️ THE SEED IS PART OF THE KEY. Without it, a reseed (same bg/grain/size)
  // is a cache hit and every drawing sits on the identical floor — the piece
  // is meant to look freshly laid each time it reseeds, and the ground is
  // half of "freshly laid".
  return `${bg}|${grain}|${width}x${height}|${seed}`
}

function buildGround(width: number, height: number, bg: string, grain: number, seed: number): Canvas2D {
  const { base, warm, dark } = derivedGround(bg)
  const canvas = makeCanvas(width, height)
  const ctx = ctx2dOf(canvas)

  const grad = ctx.createLinearGradient(0, 0, width * 0.4, height)
  grad.addColorStop(0, warm)
  grad.addColorStop(0.55, base)
  grad.addColorStop(1, dark)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, width, height)

  // Flow-field wash, built at HALF resolution and upscaled — at 1440x900 dpr 2
  // the full-res store is 4.2 Mpx and a full-res pass costs ~200ms (plan Task 7).
  const hw = Math.max(2, width >> 1)
  const hh = Math.max(2, height >> 1)
  const small = makeCanvas(hw, hh)
  const sctx = ctx2dOf(small)
  const img = sctx.createImageData(hw, hh)
  const d = img.data

  // `warpedBands` already carries the anisotropy (`noise.ts`'s ANISO, baked
  // in) — feed it a common per-axis span (15 units, matched to the probe's
  // own SY) and it elongates x on its own. `tooth` is a second, unrelated
  // high-frequency field for grain so the wash doesn't read glassy.
  const bands = warpedBands(seed)
  const tooth = makeFbm(seed ^ 0x85ebca6b)
  const SPAN = 15

  let i = 0
  for (let py = 0; py < hh; py++) {
    const vy = (py / hh) * SPAN
    for (let px = 0; px < hw; px++) {
      const vx = (px / hw) * SPAN
      const soft = bands(vx, vy)
      const t = (tooth(vx * 9, vy * 9) - 0.5) * 0.45
      const v = (soft * 0.7 + t) * grain
      d[i] = d[i + 1] = d[i + 2] = 128 + v
      d[i + 3] = 74
      i += 4
    }
  }
  sctx.putImageData(img, 0, 0)

  ctx.globalCompositeOperation = 'overlay'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(small as CanvasImageSource, 0, 0, width, height)
  ctx.globalCompositeOperation = 'source-over'

  return canvas
}

/** Paint the courtyard ground into `target`, rebuilding only when the
 *  resolved key changes, and returning that key so a caller (and this
 *  module's own tests) can observe cache behaviour without reading pixels —
 *  `test-setup.ts` stubs `getImageData`/`getContext` to an all-zero buffer,
 *  so two differently-seeded grounds compare byte-identical there and a
 *  pixel assertion would be red forever. */
export function paintGround(
  target: CanvasRenderingContext2D,
  width: number,
  height: number,
  bg: string,
  grain: number,
  seed: number,
): string {
  const key = resolveKey(bg, grain, width, height, seed)
  if (!cache || cache.key !== key) {
    cache = { key, canvas: buildGround(width, height, bg, grain, seed) }
  }
  target.drawImage(cache.canvas as CanvasImageSource, 0, 0)
  return key
}
