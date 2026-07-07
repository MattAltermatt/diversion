// Pedal & Rose — a pen slowly traces a polar rhodonea rose r = cos((n/d)·θ), or the
// pedal curve of that same rose, resolving into a symmetric mandala. The bloom holds,
// fades, and reseeds a fresh k (and curve type): an endless, zen bloom loop. The
// framework owns the rAF loop; frame() draws one tick. All randomness is seeded
// (see pedal.ts) so a seed replays the same blooms. A clean-room take on xscreensaver
// `pedal` (GH #65).
import { defineDiversion, type Size } from '../../framework/types'
import { pedalRoseSchema, type PedalRoseConfig } from './schema'
import {
  mulberry32, pickCurve, sampleCurve, petalCount,
  type RoseCurve, type SampledCurve,
} from './pedal'

const SAMPLES_PER_REV = 720
const FADE_MS = 850
const SPECTRUM_RUN = 24 // points per solid-hue run when drawing a spectrum sweep
const DRIFT_DEG_PER_SEC = 7 // base-hue rotation at colorDrift = 1
const DEG = Math.PI / 180

type Phase = 'trace' | 'hold' | 'fade'

interface PedalState {
  cfg: PedalRoseConfig
  rng: () => number
  bloom: number // index of the current bloom (advances palette / RNG stream)
  curve: RoseCurve
  sampled: SampledCurve
  theta: number // current traced angle
  phase: Phase
  timer: number // ms elapsed in the current hold/fade phase
  age: number // total ms — drives slow colour drift
  w: number
  h: number
}

function configCurve(cfg: PedalRoseConfig): RoseCurve {
  return { type: cfg.curveType, n: cfg.n, d: cfg.d }
}

// Fields that define the curve geometry / RNG stream / bloom source. A change to any
// of these needs a fresh sampled curve, so update() re-setups (returns false).
// Everything else (colors, line width, glow, copies, rotation, speed, hold,
// background) is read live from state.cfg every frame, so it applies without
// restarting the bloom.
function structuralKey(c: PedalRoseConfig): string {
  return `${c.curveType}|${c.n}|${c.d}|${c.seed}|${c.randomizeEachBloom}`
}

function reseed(state: PedalState): void {
  state.bloom++
  state.curve = state.cfg.randomizeEachBloom
    ? pickCurve(state.rng)
    : configCurve(state.cfg)
  state.sampled = sampleCurve(state.curve, SAMPLES_PER_REV)
  state.theta = 0
  state.phase = 'trace'
  state.timer = 0
}

/** Stroke one copy's polyline up to `nPts` points, rotated by `phi`, fitted to the
 *  canvas. In spectrum mode the hue sweeps along the curve in short solid runs. */
function strokeCopy(
  ctx: CanvasRenderingContext2D,
  state: PedalState,
  phi: number,
  copyIndex: number,
  nPts: number,
  scale: number,
  baseHue: number,
): void {
  const { xs, ys, count } = state.sampled
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
      : cfg.palette[(copyIndex + state.bloom) % cfg.palette.length]
    ctx.beginPath()
    ctx.moveTo(sx(0), sy(0))
    for (let i = 1; i <= last; i++) ctx.lineTo(sx(i), sy(i))
    ctx.stroke()
    return
  }

  // Spectrum: break the polyline into short runs, each a solid hue, so the whole
  // bloom reads as a rainbow sweep. Runs overlap by one point to stay seamless.
  const copyHue = baseHue + copyIndex * 47
  const denom = Math.max(1, count - 1)
  ctx.strokeStyle = `hsl(${copyHue}, 85%, 62%)`
  ctx.beginPath()
  ctx.moveTo(sx(0), sy(0))
  for (let i = 1; i <= last; i++) {
    ctx.lineTo(sx(i), sy(i))
    if (i % SPECTRUM_RUN === 0 && i < last) {
      ctx.stroke()
      const hue = copyHue + (i / denom) * cfg.hueRange
      ctx.strokeStyle = `hsl(${hue}, 85%, 62%)`
      ctx.beginPath()
      ctx.moveTo(sx(i), sy(i))
    }
  }
  ctx.stroke()
}

const pedalRose = defineDiversion<typeof pedalRoseSchema, PedalState, '2d'>({
  id: 'pedal-rose',
  title: 'Pedal & Rose',
  description: 'A pen traces polar rose curves and their pedal curves — each symmetric '
    + 'bloom resolves, fades, and reseeds a fresh petal count in an endless loop.',
  kind: '2d',
  schema: pedalRoseSchema,

  setup(ctx, cfg, size: Size) {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
    const curve = configCurve(cfg) // first bloom always honors the configured curve
    return {
      cfg,
      rng: mulberry32((cfg.seed >>> 0) || 1),
      bloom: 0,
      curve,
      sampled: sampleCurve(curve, SAMPLES_PER_REV),
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
      if (state.theta >= state.sampled.thetaMax) {
        state.theta = state.sampled.thetaMax
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
      ? state.theta / state.sampled.thetaMax
      : 1
    const nPts = Math.max(2, Math.floor(frac * (state.sampled.count - 1)) + 1)
    const drawAlpha = state.phase === 'fade' ? 1 - state.timer / FADE_MS : 1

    // Clear to background every frame (crisp, live-editable, no accumulation).
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, state.w, state.h)

    const scale = (Math.min(state.w, state.h) * 0.42) / Math.max(0.001, state.sampled.maxR)
    const baseHue = (state.age / 1000) * DRIFT_DEG_PER_SEC * cfg.colorDrift
    const rotStep = cfg.rotationOffset * DEG
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'

    for (let c = 0; c < cfg.copies; c++) {
      const phi = c * rotStep
      if (cfg.glow > 0) {
        ctx.globalAlpha = drawAlpha * (0.10 + cfg.glow * 0.10)
        ctx.lineWidth = cfg.lineWidth + 2 + cfg.glow * 6
        strokeCopy(ctx, state, phi, c, nPts, scale, baseHue)
      }
      ctx.globalAlpha = drawAlpha
      ctx.lineWidth = cfg.lineWidth
      strokeCopy(ctx, state, phi, c, nPts, scale, baseHue)
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

// petalCount is part of the module's public surface (used by tests / potential
// future readouts); reference it so tree-shakers keep the named export honest.
export { petalCount }
export default pedalRose
