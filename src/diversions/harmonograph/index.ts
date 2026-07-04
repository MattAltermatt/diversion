// Harmonograph — a mechanical drawing toy rendered as an endless screensaver.
// Two-to-four decaying pendulums drive a pen in x and y; the framework owns the
// rAF loop and calls frame() each tick to extend a slow luminous stroke. When
// the damping envelope settles, the figure fades out and a fresh one seeds — an
// endless calm loop. GH issue #33.
import { defineDiversion } from '../../framework/types'
import { harmonographSchema, type HarmonographConfig } from './schema'
import {
  buildFigure, penPosition, envelope, makeRng, SETTLE_ENVELOPE, type Figure,
} from './harmonograph'
import { parseHex6, parseHex8, mix, rgba, hslToRgb, type RGB } from '../../framework/color'

type Phase = 'draw' | 'fade'

interface HarmonographState {
  cfg: HarmonographConfig
  w: number
  h: number
  rng: () => number
  fig: Figure
  t: number // harmonograph time units elapsed on the current figure
  phase: Phase
  fadeElapsed: number // ms spent fading the settled figure
  prevX: number
  prevY: number
  hasPrev: boolean
  baseHue: number // degrees, per-figure spectrum start
  bg: RGB
  palette: RGB[] // parsed palette for the current figure
}

// Time (in harmonograph units) between drawn sub-segments — small enough that
// the curve reads as a smooth line even at high speed.
const STEP_T = 0.006
// Hard cap on sub-segments per frame so a long stall / high speed can't spike.
const MAX_STEPS = 2000
// Amplitude ranges roughly −1..1; this fraction of the short side is its radius.
const RADIUS_FRAC = 0.42

function paintBackground(ctx: CanvasRenderingContext2D, state: HarmonographState): void {
  ctx.fillStyle = rgba(state.bg, 1)
  ctx.fillRect(0, 0, state.w, state.h)
}

function parsePalette(colors: string[]): RGB[] {
  return colors.map(parseHex8)
}

// Sample the palette (evenly spaced stops) at u in 0..1.
function samplePalette(pal: RGB[], u: number): RGB {
  if (pal.length === 1) return pal[0]
  const clamped = Math.min(1, Math.max(0, u))
  const scaled = clamped * (pal.length - 1)
  const i = Math.min(pal.length - 2, Math.floor(scaled))
  return mix(pal[i], pal[i + 1], scaled - i)
}

// Colour for progress u (0 at the outer start, 1 as the figure settles).
function strokeColor(state: HarmonographState, u: number): RGB {
  if (state.cfg.colorMode === 'palette') return samplePalette(state.palette, u)
  return hslToRgb(state.baseHue + u * state.cfg.hueSpread, 78, 63)
}

function reseed(ctx: CanvasRenderingContext2D, state: HarmonographState): void {
  state.fig = buildFigure(state.rng, state.cfg)
  state.t = 0
  state.hasPrev = false
  state.phase = 'draw'
  state.fadeElapsed = 0
  state.baseHue = state.rng() * 360
  state.palette = parsePalette(state.cfg.colors)
  paintBackground(ctx, state)
}

const harmonograph = defineDiversion<typeof harmonographSchema, HarmonographState, '2d'>({
  id: 'harmonograph',
  title: 'Harmonograph',
  description: 'A mechanical drawing toy: decaying pendulums swing a pen through delicate '
    + 'near-Lissajous rosettes that spiral inward, fade, and reseed — thin luminous threads on a dark ground.',
  kind: '2d',
  schema: harmonographSchema,

  setup(ctx, config, size) {
    const state: HarmonographState = {
      cfg: config,
      w: size.width,
      h: size.height,
      rng: makeRng(config.seed),
      fig: null as unknown as Figure,
      t: 0,
      phase: 'draw',
      fadeElapsed: 0,
      prevX: 0,
      prevY: 0,
      hasPrev: false,
      baseHue: 0,
      bg: parseHex6(config.background),
      palette: parsePalette(config.colors),
    }
    state.baseHue = state.rng() * 360
    state.fig = buildFigure(state.rng, config)
    paintBackground(ctx, state)
    return state
  },

  frame(state, ctx, _t, dt) {
    const { w, h } = state
    const cx = w / 2
    const cy = h / 2
    const radius = RADIUS_FRAC * Math.min(w, h)

    if (state.phase === 'fade') {
      state.fadeElapsed += dt
      const fadeMs = state.cfg.fadeTime * 1000
      // Gentle exponential fade of the whole figure toward the background.
      const a = Math.min(0.5, (dt / fadeMs) * 3)
      ctx.fillStyle = rgba(state.bg, a)
      ctx.fillRect(0, 0, w, h)
      if (state.fadeElapsed >= fadeMs) reseed(ctx, state)
      return
    }

    // draw phase — advance t across smooth sub-steps, extending the stroke.
    const advance = (dt / 1000) * state.cfg.speed
    if (advance <= 0) return
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(advance / STEP_T)))
    const dtStep = advance / steps

    const lw = state.cfg.lineWidth
    const glow = state.cfg.glow
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    for (let s = 0; s < steps; s++) {
      state.t += dtStep
      const env = envelope(state.fig, state.t)
      const p = penPosition(state.fig, state.t)
      const sx = cx + p.x * radius
      const sy = cy + p.y * radius

      if (state.hasPrev) {
        const u = Math.min(1, Math.max(0, 1 - env)) // 0 outer → 1 settled
        const col = strokeColor(state, u)
        // Soft halo first (low alpha, wide) …
        if (glow > 0) {
          ctx.strokeStyle = rgba(col, glow)
          ctx.lineWidth = lw * 4
          ctx.beginPath()
          ctx.moveTo(state.prevX, state.prevY)
          ctx.lineTo(sx, sy)
          ctx.stroke()
        }
        // … then the bright opaque core.
        ctx.strokeStyle = rgba(col, 0.95)
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.moveTo(state.prevX, state.prevY)
        ctx.lineTo(sx, sy)
        ctx.stroke()
      }

      state.prevX = sx
      state.prevY = sy
      state.hasPrev = true
    }

    if (envelope(state.fig, state.t) <= SETTLE_ENVELOPE) {
      state.phase = 'fade'
      state.fadeElapsed = 0
    }
  },

  resize(state, size) {
    // Viewport-independent figure: just track the new size and re-center. The
    // ResizeObserver fires on every fullscreen/drag reflow, so do NOT reseed —
    // the persistent canvas keeps whatever was already drawn.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    // Structural fields change the figure/ground and need a full re-setup;
    // purely visual fields apply live over the persistent canvas.
    const c = state.cfg
    const structural = config.pendulums !== c.pendulums
      || config.detune !== c.detune
      || config.damping !== c.damping
      || config.seed !== c.seed
      || config.background !== c.background
    if (structural) return false
    state.cfg = config
    state.palette = parsePalette(config.colors)
    return true
  },
})

export default harmonograph
