import { sampleGradientRGBA } from '../../framework/gradient'
import { COLOR_BINS, fadeAlpha, type VineState } from './vines'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Redraw every frame (background composited live so palette/bg edits update
// instantly — no accumulation buffer). Strokes are batched by [depth][colorBin]:
// one lineWidth per depth (stem thick → twigs thin), one colour per bin (base →
// tip gradient). The reveal front clips each straddling segment to a partial line.
// Drawn directly on the ctx (no Path2D — jsdom lacks it).

const GLOW_MAX = 10 // px shadowBlur at glow = 1
const MAX_SWAY = 0.035 // rad — breeze amplitude at sway = 1
const SWAY_OMEGA = 0.0009 // rad/ms — ~7s sway period
const TAU = Math.PI * 2

function rampColor(colors: string[], u: number): string {
  const c = sampleGradientRGBA(colors.map((x) => x + 'ff'), u)
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}

export function renderVines(state: VineState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, view, geo, buckets, tips, front } = state

  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const alpha = fadeAlpha(state)
  if (alpha <= 0 || geo.segments.length === 0) return

  ctx.save()
  ctx.globalAlpha = alpha

  // breeze — gentle sway of the whole clump about its base
  if (cfg.sway > 0) {
    const a = cfg.sway * MAX_SWAY * Math.sin(state.t * SWAY_OMEGA)
    ctx.translate(view.anchorX, view.anchorY)
    ctx.rotate(a)
    ctx.translate(-view.anchorX, -view.anchorY)
  }

  // fit transform: world → screen (static; reveal happens in world coords)
  ctx.translate(view.offsetX, view.offsetY)
  ctx.scale(view.scale, view.scale)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (cfg.glow > 0) {
    ctx.shadowBlur = cfg.glow * GLOW_MAX
    ctx.shadowColor = rampColor(cfg.colors, 0.8)
  }

  for (let depth = 0; depth < buckets.length; depth++) {
    ctx.lineWidth = Math.max(0.5, cfg.lineWidth * Math.pow(cfg.taper, depth)) / view.scale
    const byBin = buckets[depth]
    for (let bin = 0; bin < COLOR_BINS; bin++) {
      const segs = byBin[bin]
      if (segs.length === 0) continue
      let drew = false
      ctx.beginPath()
      for (const s of segs) {
        if (s.dStart >= front) continue
        ctx.moveTo(s.x0, s.y0)
        if (s.dEnd <= front) {
          ctx.lineTo(s.x1, s.y1)
        } else {
          const f = (front - s.dStart) / Math.max(1e-6, s.dEnd - s.dStart)
          ctx.lineTo(s.x0 + (s.x1 - s.x0) * f, s.y0 + (s.y1 - s.y0) * f)
        }
        drew = true
      }
      if (drew) {
        ctx.strokeStyle = rampColor(cfg.colors, COLOR_BINS > 1 ? bin / (COLOR_BINS - 1) : 1)
        ctx.stroke()
      }
    }
  }

  // buds — a soft dot at each finished branch tip
  if (cfg.buds) {
    ctx.shadowBlur = cfg.glow > 0 ? cfg.glow * GLOW_MAX : 0
    ctx.fillStyle = rampColor(cfg.colors, 1)
    const r = cfg.budSize / view.scale
    ctx.beginPath()
    for (const t of tips) {
      if (t.dEnd > front) continue
      ctx.moveTo(t.x1 + r, t.y1)
      ctx.arc(t.x1, t.y1, r, 0, TAU)
    }
    ctx.fill()
  }

  ctx.restore()
  ctx.globalAlpha = 1
  ctx.shadowBlur = 0
}
