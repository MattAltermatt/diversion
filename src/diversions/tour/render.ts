// render.ts — draws one frame of the Tour: a glowing polyline through the city
// dots, over an opaque dark ground. Cities live in [0,1]² and are mapped to a
// centred square (letterboxed) so the on-screen aspect stays 1:1 with the space
// the solver optimises in — a resize just repaints, never restarts. No Path2D
// (jsdom lacks it): the loop is drawn with moveTo/lineTo, cities with arc.

import type { TourState } from './tour'

// Rainbow-by-position hue (a spectral sweep along the loop). Returns an rgb string.
function positionColor(t: number): string {
  return `hsl(${Math.round(t * 320)}, 85%, 62%)`
}

export function render(state: TourState, ctx: CanvasRenderingContext2D): void {
  const { w, h, cfg, tour, cx, cy, n, edgeFlash } = state

  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  // Centred square viewport with an inner margin → screen coords are a uniform
  // scale of [0,1]², so geometry reads faithfully at any aspect ratio.
  const side = Math.min(w, h)
  const margin = side * 0.07
  const draw = side - margin * 2
  const ox = (w - side) / 2 + margin
  const oy = (h - side) / 2 + margin
  const px = (i: number) => ox + cx[i] * draw
  const py = (i: number) => oy + cy[i] * draw

  const solid = cfg.pathColor.mode === 'solid'
  const lineW = Math.max(1, side / 900)

  // Soft glow halo underneath (source-over, low alpha, wide stroke) — reads as a
  // glowing line without the additive blow-out that whites out at crossings.
  if (cfg.pathColor.glow) {
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.globalAlpha = 0.16
    ctx.lineWidth = lineW * 5
    ctx.strokeStyle = solid ? cfg.pathColor.color : '#5ec8ff'
    ctx.beginPath()
    ctx.moveTo(px(tour[0]), py(tour[0]))
    for (let p = 1; p < n; p++) ctx.lineTo(px(tour[p]), py(tour[p]))
    ctx.lineTo(px(tour[0]), py(tour[0]))
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // Bright core. Solid mode is one path; position mode strokes each edge in its
  // own hue so the route can be traced end to end.
  ctx.lineWidth = lineW * 1.6
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (solid) {
    ctx.strokeStyle = cfg.pathColor.color
    ctx.beginPath()
    ctx.moveTo(px(tour[0]), py(tour[0]))
    for (let p = 1; p < n; p++) ctx.lineTo(px(tour[p]), py(tour[p]))
    ctx.lineTo(px(tour[0]), py(tour[0]))
    ctx.stroke()
  } else {
    for (let p = 0; p < n; p++) {
      const a = tour[p]
      const b = tour[(p + 1) % n]
      ctx.strokeStyle = positionColor(p / n)
      ctx.beginPath()
      ctx.moveTo(px(a), py(a))
      ctx.lineTo(px(b), py(b))
      ctx.stroke()
    }
  }

  // Flash freshly-rewired edges brighter (a shimmer that traces the local search).
  if (cfg.flashImprovements) {
    ctx.lineWidth = lineW * 2.2
    ctx.strokeStyle = '#ffffff'
    for (let p = 0; p < n; p++) {
      const f = edgeFlash[p]
      if (f < 0.02) continue
      const a = tour[p]
      const b = tour[(p + 1) % n]
      ctx.globalAlpha = Math.min(1, f) * 0.85
      ctx.beginPath()
      ctx.moveTo(px(a), py(a))
      ctx.lineTo(px(b), py(b))
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  // City dots (opaque cores) last so they sit atop the loop.
  if (cfg.nodeSize > 0) {
    const r = cfg.nodeSize * (side / 800)
    ctx.fillStyle = '#f4f9ff'
    for (let i = 0; i < n; i++) {
      ctx.beginPath()
      ctx.arc(px(i), py(i), r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}
