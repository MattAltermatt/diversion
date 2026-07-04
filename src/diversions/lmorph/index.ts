// lmorph — a single luminous closed curve that fluidly morphs between a seeded cycle
// of elegant parametric shapes (circle → star → flower → gear → superellipse → heart
// → polygon), holding briefly on each, colour cycling slowly, faint ghosts trailing
// behind. Every shape is a radial r(θ) sampled at the same angles, so the morph is a
// per-angle radius lerp (eased with smoothstep) — it never scrambles. The framework
// owns the rAF loop and calls frame() each tick. Clean-room take on xscreensaver
// `lmorph` (GH #64).
import { defineDiversion } from '../../framework/types'
import { lmorphSchema, type LmorphConfig } from './schema'
import {
  mulberry32, pickOrder, sampleShape, morphRadii, smoothstep, type Shape,
} from './lmorph'
import { parseHex6, mix, rgba, hslToRgb, type RGB } from '../../framework/color'

const DEG = Math.PI / 180
const FIT_FRAC = 0.4 // outline radius = this fraction of the short side
const RUN = 24 // points per solid-colour run when sweeping hue around the outline

type Phase = 'hold' | 'morph'

interface LmorphState {
  cfg: LmorphConfig
  w: number
  h: number
  n: number
  order: Shape[]
  pos: number // index in order of the shape we're resting on / morphing FROM
  rFrom: Float64Array
  rTo: Float64Array
  rNow: Float64Array // working buffer of interpolated radii
  cosT: Float64Array
  sinT: Float64Array
  xs: Float64Array
  ys: Float64Array
  phase: Phase
  morphT: number // 0..1 raw morph progress (eased at render time)
  holdTimer: number // ms rested on the current shape
  age: number // total ms — drives colour drift + spin
  spinAngle: number // radians
  palette: RGB[]
  bg: RGB
}

function buildTrig(n: number): { cosT: Float64Array; sinT: Float64Array } {
  const cosT = new Float64Array(n)
  const sinT = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    cosT[i] = Math.cos(a)
    sinT[i] = Math.sin(a)
  }
  return { cosT, sinT }
}

function makeState(cfg: LmorphConfig, w: number, h: number): LmorphState {
  const n = cfg.points
  const rng = mulberry32((cfg.seed >>> 0) || 1)
  const order = pickOrder(rng, cfg.shapes)
  const { cosT, sinT } = buildTrig(n)
  return {
    cfg, w, h, n, order,
    pos: 0,
    rFrom: sampleShape(order[0], n),
    rTo: sampleShape(order[1 % order.length], n),
    rNow: new Float64Array(n),
    cosT, sinT,
    xs: new Float64Array(n),
    ys: new Float64Array(n),
    phase: 'hold',
    morphT: 0,
    holdTimer: 0,
    age: 0,
    spinAngle: 0,
    palette: cfg.palette.map(parseHex6),
    bg: parseHex6(cfg.background),
  }
}

/** Colour of the outline at fractional position u (0..1 around the loop). */
function colorAt(state: LmorphState, u: number): string {
  const cfg = state.cfg
  const drift = (state.age / 1000) * cfg.colorCycleSpeed
  if (cfg.colorMode === 'palette') {
    const pal = state.palette
    if (pal.length === 1) return rgba(pal[0], 1)
    const pos = ((u + drift) % 1 + 1) % 1 * pal.length
    const i = Math.floor(pos) % pal.length
    const j = (i + 1) % pal.length
    return rgba(mix(pal[i], pal[j], pos - Math.floor(pos)), 1)
  }
  const baseHue = drift * 360
  return rgba(hslToRgb(baseHue + u * cfg.hueSpread, 82, 62), 1)
}

/** Stroke the closed outline once, in short solid-colour runs, at a given width/alpha. */
function strokeOutline(ctx: CanvasRenderingContext2D, state: LmorphState, width: number, alpha: number): void {
  const { xs, ys, n } = state
  ctx.globalAlpha = alpha
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(xs[0], ys[0])
  ctx.strokeStyle = colorAt(state, 0)
  for (let i = 1; i <= n; i++) {
    const k = i % n
    ctx.lineTo(xs[k], ys[k])
    if (i % RUN === 0 && i < n) {
      ctx.stroke()
      ctx.strokeStyle = colorAt(state, i / n)
      ctx.beginPath()
      ctx.moveTo(xs[k], ys[k])
    }
  }
  ctx.stroke()
}

const lmorph = defineDiversion<typeof lmorphSchema, LmorphState, '2d'>({
  id: 'lmorph',
  title: 'Lmorph',
  description: 'A single luminous closed curve fluidly morphs between elegant shapes — circle '
    + 'melts into star into flower into gear into heart — holding, cycling colour, forever.',
  kind: '2d',
  schema: lmorphSchema,

  setup(ctx, config, size) {
    const state = makeState(config, size.width, size.height)
    ctx.fillStyle = rgba(state.bg, 1)
    ctx.fillRect(0, 0, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    const cfg = state.cfg
    state.age += dt
    state.spinAngle += cfg.spin * DEG * (dt / 1000)

    // Advance the morph state machine.
    if (state.phase === 'hold') {
      state.holdTimer += dt
      if (state.holdTimer >= cfg.holdTime * 1000) { state.phase = 'morph'; state.morphT = 0 }
    } else {
      state.morphT += cfg.morphSpeed * (dt / 1000)
      if (state.morphT >= 1) {
        // Morph complete: the "to" shape becomes the new resting shape.
        state.morphT = 1
        state.pos = (state.pos + 1) % state.order.length
        // The old "to" is the new resting shape; sample the next shape to morph toward.
        state.rFrom = state.rTo
        state.rTo = sampleShape(state.order[(state.pos + 1) % state.order.length], state.n)
        state.phase = 'hold'
        state.holdTimer = 0
      }
    }

    // Current radii → outline points.
    const r = state.phase === 'morph'
      ? morphRadii(state.rFrom, state.rTo, smoothstep(state.morphT), state.rNow)
      : state.rFrom
    const { w, h, n, cosT, sinT, xs, ys } = state
    const scale = Math.min(w, h) * FIT_FRAC
    for (let i = 0; i < n; i++) {
      xs[i] = scale * r[i] * cosT[i]
      ys[i] = scale * r[i] * sinT[i]
    }

    // Background: full clear when no trails, else a low-alpha wash that leaves ghosts.
    const fade = 1 - cfg.ghostTrails * 0.94
    ctx.globalAlpha = 1
    ctx.fillStyle = rgba(state.bg, fade)
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(w / 2, h / 2)
    ctx.rotate(state.spinAngle)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    if (cfg.glow > 0) {
      strokeOutline(ctx, state, cfg.lineWidth + 2 + cfg.glow * 6, 0.1 + cfg.glow * 0.14)
    }
    strokeOutline(ctx, state, cfg.lineWidth, 0.96)

    ctx.restore()
    ctx.globalAlpha = 1
  },

  resize(state, size, ctx) {
    // Viewport-independent geometry: just track size + repaint the ground. Do NOT
    // rebuild the shape cycle (the ResizeObserver fires on every fullscreen/drag).
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = rgba(state.bg, 1)
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config, size) {
    // Structural fields change the sampled geometry / cycle and need a full re-setup;
    // purely visual fields apply live over the persistent state.
    const c = state.cfg
    const structural = config.points !== c.points
      || config.shapes !== c.shapes
      || config.seed !== c.seed
    if (structural) return false
    state.cfg = config
    state.palette = config.palette.map(parseHex6)
    state.bg = parseHex6(config.background)
    void size
    return true
  },
})

export default lmorph
