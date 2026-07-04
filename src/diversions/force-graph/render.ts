// render.ts — draws one frame of the force-directed graph in CSS pixels.
// No Path2D (jsdom lacks it): edges via moveTo/lineTo/stroke, nodes via ctx.arc.
// Glowing nodes = opaque core + low-alpha halo (no additive blend → no blowout).
import type { LayoutState } from './graph'

const LINK_RGB = [150, 178, 224] as const // soft cool link colour on dark

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Degree ramp: low degree → palette[0], high degree → palette[last]. */
function rampColor(palette: string[], t: number): [number, number, number] {
  const c0 = hexToRgb(palette[0])
  const c1 = hexToRgb(palette[palette.length - 1])
  return [
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
  ]
}

export function renderGraph(state: LayoutState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, nodes, edges, view, maxDegree } = state

  // background (opaque — high contrast, no ghosting)
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const cxs = w / 2, cys = h / 2
  const sx = (x: number) => cxs + (x - view.cx) * view.scale
  const sy = (y: number) => cys + (y - view.cy) * view.scale

  // edges — one batched path, single soft stroke (cheap, and keeps nodes the star)
  ctx.lineWidth = 1
  ctx.strokeStyle = `rgba(${LINK_RGB[0]},${LINK_RGB[1]},${LINK_RGB[2]},${cfg.edgeOpacity})`
  ctx.beginPath()
  for (let e = 0; e < edges.length; e++) {
    const a = nodes[edges[e][0]], b = nodes[edges[e][1]]
    ctx.moveTo(sx(a.x), sy(a.y))
    ctx.lineTo(sx(b.x), sy(b.y))
  }
  ctx.stroke()

  // pre-resolve community colours once
  const palette = cfg.palette
  const commRgb = palette.map(hexToRgb)

  // nodes — halo then opaque core
  for (let i = 0; i < nodes.length; i++) {
    const nd = nodes[i]
    const px = sx(nd.x), py = sy(nd.y)
    const degT = maxDegree > 1 ? nd.degree / maxDegree : 0
    const r = cfg.nodeSize * (0.6 + 0.7 * Math.sqrt(degT))

    let rgb: [number, number, number]
    if (cfg.colorBy === 'community') rgb = commRgb[nd.community % commRgb.length]
    else rgb = rampColor(palette, degT)
    const [cr, cg, cb] = rgb

    // soft halo
    ctx.fillStyle = `rgba(${cr},${cg},${cb},0.16)`
    ctx.beginPath()
    ctx.arc(px, py, r * 2.6, 0, Math.PI * 2)
    ctx.fill()

    // opaque core
    ctx.fillStyle = `rgb(${cr},${cg},${cb})`
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.fill()

    // bright inner highlight for a little pop
    ctx.fillStyle = `rgba(255,255,255,0.55)`
    ctx.beginPath()
    ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.35, 0, Math.PI * 2)
    ctx.fill()
  }
}
