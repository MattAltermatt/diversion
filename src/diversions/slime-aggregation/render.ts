import { fieldIntensity } from './field'
import type { SlimeAggregationConfig } from './schema'
import type { SlimeAggregationState } from './slimeAggregation'

const LUT_N = 256
type RGB = [number, number, number]

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Bake a 256-entry rgb ramp from the palette stops, shaped by `contrast` (a
 *  gamma>1 thins the bright crest and darkens the recovering tail). */
export function buildLUT(cfg: SlimeAggregationConfig): Uint8Array {
  const stops = cfg.palette.map(hexRgb)
  const gamma = cfg.contrast
  const lut = new Uint8Array(LUT_N * 3)
  const segs = Math.max(1, stops.length - 1)
  for (let k = 0; k < LUT_N; k++) {
    const t = k / (LUT_N - 1)
    const shaped = Math.pow(t, gamma)
    const f = shaped * segs
    const idx = Math.min(segs - 1, Math.floor(f))
    const frac = f - idx
    const a = stops[idx]
    const b = stops[Math.min(stops.length - 1, idx + 1)]
    lut[k * 3] = Math.round(a[0] + (b[0] - a[0]) * frac)
    lut[k * 3 + 1] = Math.round(a[1] + (b[1] - a[1]) * frac)
    lut[k * 3 + 2] = Math.round(a[2] + (b[2] - a[2]) * frac)
  }
  return lut
}

// Trail-deposit compression: unbounded accumulated deposit -> 0..1 mix weight
// toward the stream color. Tuned so a handful of overlapping amoeba passes
// already reads as a visible glowing river, not hundreds.
const TRAIL_K = 2.5

/** Rebuild the field+trail pixel buffer (only when `state.dirty` — a step ran or
 *  colors/contrast changed) and blit it scaled to the canvas, then draw the
 *  streaming amoebae as bright motes on top (#273 dirty-gate pattern). */
export function renderField(state: SlimeAggregationState, ctx: CanvasRenderingContext2D): void {
  const { cfg, field, trail, lut, w, h } = state
  const { gw, gh } = field
  if (state.dirty) {
    const img = state.img
    const data = img.data
    const stream = hexRgb(cfg.streamColor)
    const n = gw * gh
    for (let i = 0; i < n; i++) {
      const inten = fieldIntensity(field.state[i], field.timer[i], cfg.waveWidth, cfg.recoveryTime)
      const k = (inten <= 0 ? 0 : inten >= 1 ? LUT_N - 1 : (inten * (LUT_N - 1)) | 0) * 3
      let r = lut[k], g = lut[k + 1], b = lut[k + 2]
      const tv = trail[i]
      if (tv > 0) {
        const tt = tv / (tv + TRAIL_K)
        r += (stream[0] - r) * tt
        g += (stream[1] - g) * tt
        b += (stream[2] - b) * tt
      }
      const o = i * 4
      data[o] = r | 0; data[o + 1] = g | 0; data[o + 2] = b | 0; data[o + 3] = 255
    }
    state.offCtx.putImageData(img, 0, 0)
    state.dirty = false
  }

  ctx.imageSmoothingEnabled = true // the soft dark→glow ramp reads as a liquid field, not blocky cells
  ctx.drawImage(state.off as unknown as CanvasImageSource, 0, 0, gw, gh, 0, 0, w, h)

  // Bright streaming motes on top — the "parts become whole" payoff: only agents
  // actively riding a pulse light up, so the streams read as flowing, not static.
  const { x, y, moving } = state.agents
  ctx.fillStyle = cfg.streamColor
  ctx.globalAlpha = 0.85
  for (let i = 0; i < x.length; i++) {
    if (!moving[i]) continue
    ctx.beginPath()
    ctx.arc(x[i] * w, y[i] * h, 1.3, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}
