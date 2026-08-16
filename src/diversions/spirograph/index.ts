// Spirograph — an animated pen traces a hypotrochoid / epitrochoid into a
// symmetric rosette, holds the finished bloom, fades, and reseeds a fresh one:
// an endless, zen bloom loop. The framework owns the rAF loop; frame() draws one
// tick. All randomness is seeded (see spiro.ts) so a seed replays the same blooms.
import { defineDiversion, type Size } from '../../framework/types'
import { spirographSchema, type SpirographConfig } from './schema'
import {
  mulberry32, pickRosette, sampleCurve, petalCount,
  type Rosette, type SampledCurve,
} from './spiro'
import { meta } from './meta'

const SAMPLES_PER_REV = 360
const FADE_MS = 850
const SPECTRUM_RUN = 24 // points per solid-hue run when drawing a spectrum sweep
const DRIFT_DEG_PER_SEC = 7 // base-hue rotation at colorDrift = 1

type Phase = 'trace' | 'hold' | 'fade'

interface SpiroState {
  cfg: SpirographConfig
  rng: () => number
  bloom: number // index of the current bloom (advances palette / RNG stream)
  ros: Rosette
  curve: SampledCurve
  theta: number // current traced angle
  phase: Phase
  timer: number // ms elapsed in the current hold/fade phase
  age: number // total ms — drives slow colour drift
  w: number
  h: number
}

function configRosette(cfg: SpirographConfig): Rosette {
  return { R: cfg.R, r: cfg.r, d: cfg.d, mode: cfg.mode }
}

// Fields that define the rosette geometry / RNG stream / bloom source. A change to
// any of these needs a fresh sampled curve, so update() re-setups (returns false).
// Everything else (colors, line width, glow, pen count, speed, hold, background) is
// read live from state.cfg every frame, so it applies without restarting the bloom.
function structuralKey(c: SpirographConfig): string {
  return `${c.R}|${c.r}|${c.d}|${c.mode}|${c.seed}|${c.randomizeEachBloom}`
}

function reseed(state: SpiroState): void {
  state.bloom++
  state.ros = state.cfg.randomizeEachBloom
    ? pickRosette(state.rng)
    : configRosette(state.cfg)
  state.curve = sampleCurve(state.ros, SAMPLES_PER_REV)
  state.theta = 0
  state.phase = 'trace'
  state.timer = 0
}

/** Stroke one pen's polyline up to `nPts` points, rotated by `phi`, fitted to the
 *  canvas. In spectrum mode the hue sweeps along the curve in short solid runs. */
function strokePen(
  ctx: CanvasRenderingContext2D,
  state: SpiroState,
  phi: number,
  penIndex: number,
  nPts: number,
  scale: number,
  baseHue: number,
): void {
  const { xs, ys, count } = state.curve
  const cfg = state.cfg
  const cx = state.w / 2
  const cy = state.h / 2
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const sx = (i: number) => cx + scale * (xs[i] * cos - ys[i] * sin)
  const sy = (i: number) => cy + scale * (xs[i] * sin + ys[i] * cos)
  const last = Math.max(1, nPts - 1)

  if (cfg.colorMode !== 'spectrum') {
    ctx.strokeStyle = cfg.colorMode === 'mono'
      ? cfg.fg
      : cfg.palette[(penIndex + state.bloom) % cfg.palette.length]
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(0))
    for (let i = 1; i <= last; i++) ctx.lineTo(sx(i), sy(i))
    ctx.stroke()
    return
  }

  // Spectrum: break the polyline into short runs, each a solid hue, so the whole
  // rosette reads as a rainbow sweep. Runs overlap by one point to stay seamless.
  const penHue = baseHue + penIndex * 47
  const denom = Math.max(1, count - 1)
  ctx.strokeStyle = `hsl(${penHue}, 85%, 62%)`
  ctx.beginPath()
  ctx.moveTo(sx(0), sy(0))
  for (let i = 1; i <= last; i++) {
    ctx.lineTo(sx(i), sy(i))
    if (i % SPECTRUM_RUN === 0 && i < last) {
      ctx.stroke()
      const hue = penHue + (i / denom) * cfg.hueRange
      ctx.strokeStyle = `hsl(${hue}, 85%, 62%)`
      ctx.beginPath()
      ctx.moveTo(sx(i), sy(i))
    }
  }
  ctx.stroke()
}

const spirograph = defineDiversion<typeof spirographSchema, SpiroState, '2d'>({
  ...meta,
  schema: spirographSchema,

  setup(ctx, cfg, size: Size) {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
    const ros = configRosette(cfg) // first bloom always honors the configured gears
    return {
      cfg,
      rng: mulberry32((cfg.seed >>> 0) || 1),
      bloom: 0,
      ros,
      curve: sampleCurve(ros, SAMPLES_PER_REV),
      theta: 0,
      phase: 'trace',
      timer: 0,
      age: 0,
      w: size.width,
      h: size.height,
    }
  },

  frame(state, ctx, _t, dt) {
    const cfg = state.cfg
    state.age += dt

    // Advance the bloom-loop state machine.
    if (state.phase === 'trace') {
      state.theta += cfg.traceSpeed * (dt / 1000)
      if (state.theta >= state.curve.thetaMax) {
        state.theta = state.curve.thetaMax
        state.phase = 'hold'
        state.timer = 0
      }
    } else if (state.phase === 'hold') {
      state.timer += dt
      if (state.timer >= cfg.holdSeconds * 1000) { state.phase = 'fade'; state.timer = 0 }
    } else {
      state.timer += dt
      if (state.timer >= FADE_MS) reseed(state)
    }

    // How much of the curve is drawn, and at what opacity.
    const frac = state.phase === 'trace'
      ? state.theta / state.curve.thetaMax
      : 1
    const nPts = Math.max(2, Math.floor(frac * (state.curve.count - 1)) + 1)
    const drawAlpha = state.phase === 'fade' ? 1 - state.timer / FADE_MS : 1

    // Clear to background every frame (crisp, live-editable, no accumulation).
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, state.w, state.h)

    const scale = (Math.min(state.w, state.h) * 0.42) / Math.max(0.001, state.curve.maxR)
    const petals = petalCount(state.ros.R, state.ros.r)
    const baseHue = (state.age / 1000) * DRIFT_DEG_PER_SEC * cfg.colorDrift
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (let k = 0; k < cfg.penCount; k++) {
      const phi = (k * (2 * Math.PI / petals)) / cfg.penCount // interleave petals
      if (cfg.glow > 0) {
        ctx.globalAlpha = drawAlpha * (0.10 + cfg.glow * 0.10)
        ctx.lineWidth = cfg.lineWidth + 2 + cfg.glow * 6
        strokePen(ctx, state, phi, k, nPts, scale, baseHue)
      }
      ctx.globalAlpha = drawAlpha
      ctx.lineWidth = cfg.lineWidth
      strokePen(ctx, state, phi, k, nPts, scale, baseHue)
    }
    ctx.globalAlpha = 1
  },

  update(state, config, size) {
    // Structural edit (geometry / seed / bloom source) → rebuild via a full setup.
    if (structuralKey(config) !== structuralKey(state.cfg)) return false
    // Cosmetic edit — everything the frame reads live from cfg. Swap and carry on;
    // no curve rebuild, no accumulation buffer to re-bake, so nothing pops.
    state.cfg = config
    state.w = size.width
    state.h = size.height
    return true
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },
})

export default spirograph
