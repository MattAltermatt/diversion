// Epicycle — a chain of nested rotating arms (Ptolemaic / Fourier epicycles) whose
// pen traces a closed roulette curve. The framework owns the rAF loop and calls
// frame() each tick: the whole scene is redrawn every frame (background → curve →
// construction arms, all LIVE — nothing is baked), so every control edits live and
// there is no accumulation buffer to bleed. When the curve closes it holds, fades,
// and reseeds a fresh set of arms — an endless, calm loop. GH issue #61.
import { defineDiversion, type Size } from '../../framework/types'
import { epicycleSchema, type EpicycleConfig } from './schema'
import { buildArms, sampleCurve, makeRng, type Arm, type SampledCurve } from './epicycle'
import { parseHex8, mix, rgba, hslToRgb, type RGB } from '../../framework/color'

const TAU = Math.PI * 2
// Samples along one closed curve — dense enough that even freqSpread=8 reads smooth.
const SAMPLES = 2400
// Points per solid-colour run when sweeping a spectrum/palette along the curve.
const RUN = 20
// Fraction of the short side the curve is fitted to.
const FIT_FRAC = 0.44

type Phase = 'trace' | 'hold' | 'fade'

interface EpicycleState {
  cfg: EpicycleConfig
  w: number
  h: number
  rng: () => number
  arms: Arm[]
  curve: SampledCurve
  theta: number // current parameter; advances continuously, arms keep turning on hold
  phase: Phase
  timer: number // ms elapsed in the current hold/fade phase
  baseHue: number // per-curve spectrum start (degrees)
  palette: RGB[] // parsed palette colours for the current curve
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

function strokeColor(state: EpicycleState, u: number): RGB {
  if (state.cfg.colorMode === 'palette') return samplePalette(state.palette, u)
  return hslToRgb(state.baseHue + u * state.cfg.hueSpread, 82, 63)
}

function reseed(state: EpicycleState): void {
  state.arms = buildArms(state.rng, state.cfg)
  state.curve = sampleCurve(state.arms, SAMPLES)
  state.theta = 0
  state.phase = 'trace'
  state.timer = 0
  state.baseHue = state.rng() * 360
}

/** Stroke the traced curve up to nPts points, colour sweeping along it in short solid
 *  runs. Glow draws a wide low-alpha halo under each run, then an opaque bright core —
 *  the two-layer trick that keeps colour from blowing out at crossings. */
function strokeCurve(
  ctx: CanvasRenderingContext2D,
  state: EpicycleState,
  cx: number,
  cy: number,
  scale: number,
  nPts: number,
): void {
  const { xs, ys, count } = state.curve
  const lw = state.cfg.lineWidth
  const glow = state.cfg.glow
  const last = Math.min(count - 1, Math.max(1, nPts - 1))
  const denom = Math.max(1, count - 1)
  const sx = (i: number) => cx + scale * xs[i]
  const sy = (i: number) => cy + scale * ys[i]

  let i = 0
  while (i < last) {
    const j = Math.min(last, i + RUN)
    const col = strokeColor(state, i / denom)
    if (glow > 0) {
      ctx.strokeStyle = rgba(col, glow * 0.5)
      ctx.lineWidth = lw * 4
      ctx.beginPath()
      ctx.moveTo(sx(i), sy(i))
      for (let k = i + 1; k <= j; k++) ctx.lineTo(sx(k), sy(k))
      ctx.stroke()
    }
    ctx.strokeStyle = rgba(col, 0.95)
    ctx.lineWidth = lw
    ctx.beginPath()
    ctx.moveTo(sx(i), sy(i))
    for (let k = i + 1; k <= j; k++) ctx.lineTo(sx(k), sy(k))
    ctx.stroke()
    i = j
  }
}

/** Draw the faint rotating construction: a circle per arm centred on the previous
 *  tip, the arm segment, joint dots, and a bright pen dot at the final tip. */
function drawArms(
  ctx: CanvasRenderingContext2D,
  arms: Arm[],
  theta: number,
  cx: number,
  cy: number,
  scale: number,
  alpha: number,
): void {
  let x = cx, y = cy
  ctx.lineWidth = 1
  for (const arm of arms) {
    const r = arm.radius * scale
    ctx.strokeStyle = `rgba(190,208,255,${0.10 * alpha})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, TAU)
    ctx.stroke()

    const ang = arm.freq * theta + arm.phase
    const nx = x + r * Math.cos(ang)
    const ny = y + r * Math.sin(ang)
    ctx.strokeStyle = `rgba(220,232,255,${0.28 * alpha})`
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(nx, ny)
    ctx.stroke()

    ctx.fillStyle = `rgba(200,216,255,${0.34 * alpha})`
    ctx.beginPath()
    ctx.arc(x, y, 1.6, 0, TAU)
    ctx.fill()

    x = nx; y = ny
  }
  // Pen tip.
  ctx.fillStyle = `rgba(255,255,255,${0.9 * alpha})`
  ctx.beginPath()
  ctx.arc(x, y, 2.6, 0, TAU)
  ctx.fill()
}

const epicycle = defineDiversion<typeof epicycleSchema, EpicycleState, '2d'>({
  id: 'epicycle',
  title: 'Epicycle',
  description: 'Nested rotating arms — Ptolemaic epicycles — swing a pen through glowing '
    + 'closed roulette curves, holding, fading, and reseeding fresh arms in an endless loop.',
  kind: '2d',
  schema: epicycleSchema,

  setup(ctx, config, size: Size) {
    const rng = makeRng(config.seed)
    const arms = buildArms(rng, config)
    const state: EpicycleState = {
      cfg: config,
      w: size.width,
      h: size.height,
      rng,
      arms,
      curve: sampleCurve(arms, SAMPLES),
      theta: 0,
      phase: 'trace',
      timer: 0,
      baseHue: rng() * 360,
      palette: parsePalette(config.colors),
    }
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    const cfg = state.cfg

    // Advance the parameter continuously (arms keep turning even while holding/fading).
    state.theta += cfg.traceSpeed * TAU * (dt / 1000)

    if (state.phase === 'trace') {
      if (state.theta >= TAU) { state.phase = 'hold'; state.timer = 0 }
    } else if (state.phase === 'hold') {
      state.timer += dt
      if (state.timer >= cfg.holdSeconds * 1000) { state.phase = 'fade'; state.timer = 0 }
    } else {
      state.timer += dt
      if (state.timer >= cfg.fadeTime * 1000) reseed(state)
    }

    const frac = state.phase === 'trace' ? Math.min(1, state.theta / TAU) : 1
    const alpha = state.phase === 'fade'
      ? Math.max(0, 1 - state.timer / (cfg.fadeTime * 1000))
      : 1

    // Background painted LIVE every frame (opaque) — crisp, live-editable, no bleed.
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, state.w, state.h)

    const cx = state.w / 2
    const cy = state.h / 2
    const scale = (Math.min(state.w, state.h) * FIT_FRAC) / Math.max(1e-6, state.curve.maxR)
    const nPts = Math.max(2, Math.floor(frac * (state.curve.count - 1)) + 1)

    ctx.globalAlpha = alpha
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    strokeCurve(ctx, state, cx, cy, scale, nPts)
    if (cfg.showArms) drawArms(ctx, state.arms, state.theta, cx, cy, scale, alpha * 0.9)
    ctx.globalAlpha = 1
  },

  resize(state, size, ctx) {
    // Viewport-independent geometry: just track the new size (do NOT reseed — the
    // ResizeObserver fires on every fullscreen/drag reflow). Repaint the ground.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Structural fields change the arm chain and need a fresh curve; purely visual
    // fields apply live over the redraw-every-frame scene.
    const c = state.cfg
    const structural = config.armCount !== c.armCount
      || config.freqSpread !== c.freqSpread
      || config.radiusDecay !== c.radiusDecay
      || config.seed !== c.seed
    if (structural) return false
    state.cfg = config
    state.palette = parsePalette(config.colors)
    return true
  },
})

export default epicycle
