import { defineDiversion } from '../../framework/types'
import { kaleidoscopeSchema, type KaleidoscopeConfig } from './schema'
import {
  buildShapes, shapePose, sectorMatrix, PALETTES, BASE_GLOBAL_SPIN, type Shape,
} from './kaleidoscope'
import { meta } from './meta'

const TAU = Math.PI * 2
const LEAD = 'rgba(4, 3, 10, 0.72)' // stained-glass leading

interface KState {
  cfg: KaleidoscopeConfig
  shapes: Shape[]
  w: number
  h: number
  t: number // seconds, accumulated from dt (so pause/tab-hidden truly stop it)
}

// Build one source primitive as a path in local coords (already translated +
// rotated to the shape's pose). Coordinates scale by `sizePx`; no ctx.scale, so
// the leading stroke stays a constant width regardless of shape size. No Path2D
// (jsdom lacks it) — plain ctx path ops.
function primPath(ctx: CanvasRenderingContext2D, s: Shape, sizePx: number): void {
  ctx.beginPath()
  switch (s.type) {
    case 'disc':
      ctx.arc(0, 0, sizePx, 0, TAU)
      return
    case 'ribbon':
      ctx.ellipse(0, 0, sizePx * 1.7, sizePx * 0.42, 0, 0, TAU)
      return
    case 'petal': {
      const L = sizePx * 1.35, W = sizePx * 0.55
      ctx.moveTo(-L, 0)
      ctx.quadraticCurveTo(0, -W, L, 0)
      ctx.quadraticCurveTo(0, W, -L, 0)
      ctx.closePath()
      return
    }
    case 'blob': {
      const n = s.verts.length
      const px: number[] = [], py: number[] = []
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU, rr = sizePx * s.verts[k]
        px.push(Math.cos(ang) * rr); py.push(Math.sin(ang) * rr)
      }
      // smooth closed curve through vertex midpoints (quadratic segments)
      const mx0 = (px[n - 1] + px[0]) / 2, my0 = (py[n - 1] + py[0]) / 2
      ctx.moveTo(mx0, my0)
      for (let k = 0; k < n; k++) {
        const nk = (k + 1) % n
        const mx = (px[k] + px[nk]) / 2, my = (py[k] + py[nk]) / 2
        ctx.quadraticCurveTo(px[k], py[k], mx, my)
      }
      ctx.closePath()
      return
    }
    default: { // 'shard' — angular jewel polygon
      const n = s.verts.length
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * TAU, rr = sizePx * s.verts[k]
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      return
    }
  }
}

const kaleidoscope = defineDiversion<typeof kaleidoscopeSchema, KState, '2d'>({
  ...meta,
  schema: kaleidoscopeSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return { cfg: config, shapes: buildShapes(config), w: size.width, h: size.height, t: 0 }
  },

  frame(state, ctx, _t, dt) {
    state.t += dt / 1000
    const { cfg, shapes, w, h, t } = state
    const cx = w / 2, cy = h / 2
    const cover = Math.hypot(w, h)        // clip radius: reaches every corner
    const discR = 0.6 * cover             // shapes fill past the corners
    const theta = Math.PI / cfg.symmetry
    const palette = PALETTES[cfg.palette]
    const nSectors = 2 * cfg.symmetry

    // Redraw fresh each frame — the source drifts, so no accumulation buffer.
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)

    // Live poses of every source shape (computed once, reused across sectors).
    const poses = shapes.map((s) =>
      shapePose(s, t, cfg.driftSpeed, cfg.tumbleSpeed, discR, BASE_GLOBAL_SPIN))

    ctx.lineJoin = 'round'
    for (let i = 0; i < nSectors; i++) {
      ctx.save()
      ctx.translate(cx, cy)
      const [a, b, c, d] = sectorMatrix(i, cfg.symmetry)
      ctx.transform(a, b, c, d, 0, 0) // composes ON TOP of the framework DPR transform

      // clip to the master wedge [0, theta]
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, cover, 0, theta)
      ctx.closePath()
      ctx.clip()

      for (let n = 0; n < shapes.length; n++) {
        const s = shapes[n], p = poses[n]
        const sizePx = cfg.shapeSize * discR * s.size
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        primPath(ctx, s, sizePx)
        ctx.fillStyle = palette[s.ci % palette.length]
        ctx.fill()
        if (cfg.outline) {
          ctx.lineWidth = 1.5
          ctx.strokeStyle = LEAD
          ctx.stroke()
        }
        ctx.restore()
      }
      ctx.restore()
    }
  },

  resize(state, size, ctx) {
    // Geometry is viewport-independent (polar fractions), so DON'T rebuild the
    // source on resize (a ResizeObserver fires on every fullscreen/drag). Just
    // track the new size and repaint the ground the wiped backing store lost.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    const s = state.cfg
    // Structural changes need a fresh source layout → re-setup.
    if (config.symmetry !== s.symmetry
        || config.sourceShapes !== s.sourceShapes
        || config.seed !== s.seed
        || config.shapeStyle !== s.shapeStyle) {
      return false
    }
    // Everything else (size, speeds, palette, background, leading) applies live.
    state.cfg = config
    return true
  },
})

export default kaleidoscope
