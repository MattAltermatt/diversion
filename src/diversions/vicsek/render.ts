// render.ts — heading-hue particles + the order-parameter readout. World→screen
// via a cover-fit transform (drawn in CSS pixels; the host DPR-scales the 2D ctx).
import type { Size } from '../../framework/types'
import { hexToRgb, parseHex6, mix } from '../../framework/color'
import type { Flock } from './sim'
import type { VicsekConfig } from './schema'

const LUT_SIZE = 256 // heading → colour, precomputed once (no per-particle string work)

/** Build a 256-entry heading→CSS-rgb lookup, interpolating cyclically through
 *  `palette` (wraps end→start, since heading itself wraps). Rebuilt whenever the
 *  palette changes (setup, or a live palette edit) — never in the per-frame loop. */
export function buildHueLUT(palette: string[]): string[] {
  const n = palette.length
  const lut = new Array<string>(LUT_SIZE)
  for (let k = 0; k < LUT_SIZE; k++) {
    const scaled = (k / LUT_SIZE) * n
    const i0 = Math.floor(scaled) % n
    const i1 = (i0 + 1) % n
    const frac = scaled - Math.floor(scaled)
    const c = mix(parseHex6(palette[i0]), parseHex6(palette[i1]), frac)
    lut[k] = `rgb(${c.r},${c.g},${c.b})`
  }
  return lut
}

function coverFit(size: Size, worldSize: number): { scale: number; ox: number; oy: number } {
  const scale = Math.max(size.width / worldSize, size.height / worldSize) // cover
  const ox = (size.width - worldSize * scale) / 2
  const oy = (size.height - worldSize * scale) / 2
  return { scale, ox, oy }
}

export function drawScene(
  ctx: CanvasRenderingContext2D, s: Flock, cfg: VicsekConfig, size: Size, lut: string[],
): void {
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)

  const { scale, ox, oy } = coverFit(size, s.worldSize)
  const len = Math.max(2, 3 * scale) // half-length of the heading streak, in screen px

  for (let i = 0; i < s.n; i++) {
    const th = s.theta[i]
    const hueIdx = Math.floor(((th + Math.PI) / (Math.PI * 2)) * LUT_SIZE) % LUT_SIZE
    const x = ox + s.px[i] * scale, y = oy + s.py[i] * scale
    const cs = Math.cos(th), sn = Math.sin(th)
    ctx.strokeStyle = lut[hueIdx]
    ctx.lineWidth = Math.max(1, 1.6 * scale)
    ctx.beginPath()
    ctx.moveTo(x - cs * len, y - sn * len)
    ctx.lineTo(x + cs * len, y + sn * len)
    ctx.stroke()
  }

  if (cfg.showOrderParameter) drawOrderReadout(ctx, s.orderParam, cfg.background)
}

/** HUD ink derived from the (user-editable) background luminance, so the readout
 *  keeps contrast whether the background is dark (default) or a light custom color. */
function hudInk(background: string): string {
  const [r, g, b] = hexToRgb(background) // normalized 0..1 channels
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55 ? '20,24,32' : '255,255,255'
}

function drawOrderReadout(ctx: CanvasRenderingContext2D, order: number, background: string): void {
  const ink = hudInk(background)
  const x = 14, y = 14, w = 120, h = 8
  ctx.save()
  ctx.fillStyle = `rgba(${ink},0.85)`
  ctx.font = 'bold 12px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`order  ${order.toFixed(2)}`, x, y + 22)
  ctx.fillStyle = `rgba(${ink},0.15)`
  ctx.fillRect(x, y + 30, w, h)
  ctx.fillStyle = `rgba(${ink},0.8)`
  ctx.fillRect(x, y + 30, w * Math.max(0, Math.min(1, order)), h)
  ctx.restore()
}
