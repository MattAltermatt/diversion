import { sampleGradientRGBA, sampleCyclic } from '../../framework/gradient'
import { curvatureAt, type GrowthNode, type GrowthState } from './growth'
import type { DifferentialGrowthConfig } from './schema'

// ─── Rendering ───────────────────────────────────────────────────────────────
// Smooth quadratic-through-midpoints curve, drawn under the sim's slow-lerped
// autofit transform. Colour is batched into a few dozen palette bins (never a
// per-segment stroke). History is one slider spanning clear → trail → accumulate.

const COLOR_BINS = 28
const AGE_WINDOW = 260 // sub-steps a freshly-grown node stays "young" (front glow)
const CURV_MAX = 3.0 // curvature that maps to the brightest end of the ramp
const GLOW_MAX = 16 // px shadowBlur at glow = 1
const HISTORY_MAX_FRAMES = 90 // trail length at history → 0 (near-accumulate)

/** Palette ramp: colours are 6-hex, interpolated in [0,1] (0 = oldest/[0]). */
function rampColor(colors: string[], u: number): string {
  const stops = colors.map((c) => c + 'ff')
  const c = sampleGradientRGBA(stops, u)
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}
function rampCyclic(colors: string[], u: number): string {
  const c = sampleCyclic(colors.map((c) => c + 'ff'), u)
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`
}

interface Bounds {
  cx: number
  cy: number
  radius: number
}
function bounds(nodes: GrowthNode[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of nodes) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const radius = Math.max(1, Math.hypot(maxX - minX, maxY - minY) / 2)
  return { cx, cy, radius }
}

/** Per-node position u in [0,1] along the active colour ramp. */
function nodeU(state: GrowthState, i: number, b: Bounds): number {
  const { cfg, nodes, step } = state
  switch (cfg.colorMode) {
    case 'age': {
      const age = step - nodes[i].born
      return Math.max(0, Math.min(1, 1 - age / AGE_WINDOW)) // young → 1 (front colour)
    }
    case 'sweep':
      return i / nodes.length
    case 'curvature':
      return Math.max(0, Math.min(1, curvatureAt(nodes, i) / CURV_MAX))
    case 'depth': {
      const d = Math.hypot(nodes[i].x - b.cx, nodes[i].y - b.cy)
      return Math.max(0, Math.min(1, d / b.radius))
    }
    default: // ink
      return 1
  }
}

/** Trace one closed smoothed curve over all nodes onto the current context path
 *  (drawn directly — no Path2D, which jsdom lacks). Caller then fills/strokes. */
function traceClosed(ctx: CanvasRenderingContext2D, nodes: GrowthNode[], smoothing: boolean): void {
  const n = nodes.length
  ctx.beginPath()
  if (n < 2) return
  if (!smoothing) {
    ctx.moveTo(nodes[0].x, nodes[0].y)
    for (let i = 1; i < n; i++) ctx.lineTo(nodes[i].x, nodes[i].y)
    ctx.closePath()
    return
  }
  ctx.moveTo((nodes[n - 1].x + nodes[0].x) / 2, (nodes[n - 1].y + nodes[0].y) / 2)
  for (let i = 0; i < n; i++) {
    const cur = nodes[i]
    const nxt = nodes[(i + 1) % n]
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2)
  }
  ctx.closePath()
}

/** Add node i's smoothed (or faceted) curve piece to the current context path. */
function tracePiece(ctx: CanvasRenderingContext2D, nodes: GrowthNode[], i: number, smoothing: boolean): void {
  const n = nodes.length
  const cur = nodes[i]
  const nxt = nodes[(i + 1) % n]
  if (smoothing) {
    const prev = nodes[(i - 1 + n) % n]
    ctx.moveTo((prev.x + cur.x) / 2, (prev.y + cur.y) / 2)
    ctx.quadraticCurveTo(cur.x, cur.y, (cur.x + nxt.x) / 2, (cur.y + nxt.y) / 2)
  } else {
    ctx.moveTo(cur.x, cur.y)
    ctx.lineTo(nxt.x, nxt.y)
  }
}

/** Stroke the ring as COLOR_BINS batched sub-paths, one colour per bin. */
function strokeColored(ctx: CanvasRenderingContext2D, state: GrowthState, b: Bounds): void {
  const { nodes, cfg } = state
  const n = nodes.length
  if (cfg.colorMode === 'ink') {
    traceClosed(ctx, nodes, cfg.smoothing)
    ctx.strokeStyle = rampColor(cfg.colors, 1)
    ctx.stroke()
    return
  }
  // bucket each node's curve piece into a colour bin, then one stroke per bin
  const bins: number[][] = Array.from({ length: COLOR_BINS }, () => [])
  for (let i = 0; i < n; i++) {
    const u = nodeU(state, i, b)
    const bin = Math.min(COLOR_BINS - 1, Math.max(0, Math.round(u * (COLOR_BINS - 1))))
    bins[bin].push(i)
  }
  for (let bin = 0; bin < COLOR_BINS; bin++) {
    if (bins[bin].length === 0) continue
    ctx.beginPath()
    for (const i of bins[bin]) tracePiece(ctx, nodes, i, cfg.smoothing)
    const u = bin / (COLOR_BINS - 1)
    ctx.strokeStyle = cfg.colorMode === 'sweep' ? rampCyclic(cfg.colors, u) : rampColor(cfg.colors, u)
    ctx.stroke()
  }
}

/** Paint the persistence wash (clear / trail / accumulate) in base coords. */
function persistenceWash(ctx: CanvasRenderingContext2D, cfg: DifferentialGrowthConfig, w: number, h: number): void {
  ctx.globalCompositeOperation = 'source-over'
  if (cfg.history <= 0.001) return // accumulate: never wash
  if (cfg.history >= 0.999) {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
    return
  }
  const survivalFrames = 1 + (1 - cfg.history) * HISTORY_MAX_FRAMES
  const alpha = 1 / survivalFrames
  ctx.fillStyle = cfg.background + Math.round(alpha * 255).toString(16).padStart(2, '0')
  ctx.fillRect(0, 0, w, h)
}

export function renderGrowth(state: GrowthState, ctx: CanvasRenderingContext2D): void {
  const { nodes, cfg, w, h, view } = state
  persistenceWash(ctx, cfg, w, h)
  if (nodes.length < 3) return
  const b = bounds(nodes)

  ctx.save()
  // autofit transform: map the lerped view centre to canvas centre at view.scale
  ctx.translate(w / 2, h / 2)
  ctx.scale(view.scale, view.scale)
  ctx.translate(-view.cx, -view.cy)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.lineWidth = cfg.lineWidth / view.scale // keep constant apparent thickness

  // glow — soft shadow bloom (device px, unaffected by scale). Prefer over
  // additive blend, which whites out instantly on a dense folded ring.
  if (cfg.glow > 0) {
    ctx.shadowBlur = cfg.glow * GLOW_MAX
    ctx.shadowColor = rampColor(cfg.colors, 1)
  }

  if (cfg.renderStyle === 'line') {
    strokeColored(ctx, state, b)
  } else {
    ctx.shadowBlur = 0 // no shadow behind a solid fill (reads as a drop shadow)
    traceClosed(ctx, nodes, cfg.smoothing) // current path is reused by fill + stroke
    if (cfg.renderStyle === 'membrane') {
      const g = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, b.radius)
      g.addColorStop(0, rampColor(cfg.colors, 0.9))
      g.addColorStop(1, rampColor(cfg.colors, 0.15))
      ctx.fillStyle = g
    } else {
      ctx.fillStyle = rampColor(cfg.colors, cfg.renderStyle === 'fillEdge' ? 0.4 : 0.6)
    }
    ctx.fill()
    if (cfg.renderStyle === 'fillEdge' || cfg.renderStyle === 'membrane') {
      if (cfg.glow > 0) {
        ctx.shadowBlur = cfg.glow * GLOW_MAX
        ctx.shadowColor = rampColor(cfg.colors, 1)
      }
      ctx.strokeStyle = rampColor(cfg.colors, 1)
      ctx.stroke()
    }
  }

  ctx.restore()
  ctx.shadowBlur = 0
}
