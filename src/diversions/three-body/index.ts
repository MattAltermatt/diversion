// Three-Body Choreographies — a catalogue of REAL periodic three-body orbits,
// integrated numerically, each tracing luminous trails, cycling one at a time
// forever. GH issue #252.
//
// The framework owns the rAF loop and calls frame() each tick; this diversion is
// a black box that draws. It integrates the planar equal-mass three-body problem
// (integrator.ts) for a curated catalogue of published periodic orbits
// (orbits.ts), fades between them, and loops endlessly.
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { threeBodySchema, type ThreeBodyConfig } from './schema'
import { featuredPresets, palettePresets } from './presets'
import { ORBITS, CYCLE_ALL, initialState, orbitIndexByName } from './orbits'
import { makeScratch, rk4Step, type RK4Scratch } from './integrator'
import { mulberry32 } from '../../framework/rng'
import { parseHex6, rgba, type RGBA } from '../../framework/color'

// ── Integration & pacing constants ──
// Absolute RK4 step (natural time units). Small enough that the curated orbits'
// close two-body approaches integrate stably (energy holds to < 1e-2 over a full
// period — verified in three-body.test.ts + an offline sweep). Independent of the
// orbit's period, so long orbits get proportionally more substeps. Orbits with
// deeper near-collisions than this step can hold are excluded in orbits.ts.
const DT = 3e-5
// Sim-time units advanced per real second at speed 1.
const SIM_RATE = 1.0
// Hard cap on substeps per frame so a stall / high speed can't spike the loop.
// Comfortably above the ~830 substeps a 60fps frame needs at the default speed.
const MAX_SUBSTEPS = 2500
// Fade-out duration (ms) between one choreography and the next.
const FADE_MS = 1400
// The whole orbit is fit into this fraction of the shorter viewport edge.
const FIT_FRAC = 0.8

type Phase = 'draw' | 'fade'

interface Fit {
  scale: number
  ox: number // screenX = ox + wx * scale
  oy: number // screenY = oy - wy * scale  (world-y up → screen-y down)
}

interface ThreeBodyState {
  cfg: ThreeBodyConfig
  w: number
  h: number
  y: Float64Array // live sim state (length 12)
  ic: Float64Array // current orbit's exact initial condition
  scratch: RK4Scratch
  order: number[] // cycle order (indices into ORBITS)
  cyclePos: number
  activeOrbit: number // index into ORBITS
  cycling: boolean
  orbitElapsed: number // sim time on the current orbit since enter (with period resets)
  periodsDone: number
  phase: Phase
  fadeElapsed: number
  fit: Fit
  bg: RGBA
  colors: RGBA[] // 3 parsed body colors
  // Per-frame polyline buffers (screen coords) for the 3 bodies — preallocated.
  pts: Float64Array[] // 3 × (2 * (MAX_SUBSTEPS + 4))
  ptCount: number[] // 3
}

// ── Cycle order ──
/** Deterministic cycle order for a seed. The iconic figure-eight (catalogue
 *  index 0) always leads; the rest are Fisher-Yates shuffled from the seed so a
 *  fresh (seedless) visit varies while a pinned ?seed=N reproduces exactly. */
export function cycleOrder(n: number, seed: number): number[] {
  const rest: number[] = []
  for (let i = 1; i < n; i++) rest.push(i)
  const rng = mulberry32(seed >>> 0)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = rest[i]
    rest[i] = rest[j]
    rest[j] = tmp
  }
  return [0, ...rest]
}

// ── Fit / bounding box ──
/** Derive a viewport-fit transform from the orbit's precomputed one-period
 *  bounding box (orbits.ts). No integration — instant, and never disturbs the
 *  live sim, so it is safe to call on every resize. */
function computeFit(orbitIdx: number, w: number, h: number): Fit {
  const [minX, minY, maxX, maxY] = ORBITS[orbitIdx].bbox
  const bw = Math.max(1e-3, maxX - minX)
  const bh = Math.max(1e-3, maxY - minY)
  const scale = (FIT_FRAC * Math.min(w, h)) / Math.max(bw, bh)
  const bcx = (minX + maxX) / 2
  const bcy = (minY + maxY) / 2
  return {
    scale,
    ox: w / 2 - bcx * scale,
    oy: h / 2 + bcy * scale,
  }
}

// ── Colors ──
function parseColors(hexes: string[]): RGBA[] {
  return hexes.map(parseHex6)
}

// ── Orbit lifecycle ──
function enterOrbit(state: ThreeBodyState, ctx: CanvasRenderingContext2D): void {
  const o = ORBITS[state.activeOrbit]
  state.ic = initialState(o)
  state.y.set(state.ic)
  state.orbitElapsed = 0
  state.periodsDone = 0
  state.phase = 'draw'
  state.fadeElapsed = 0
  state.fit = computeFit(state.activeOrbit, state.w, state.h)
  // Paint a clean dark ground (the fade transition has nearly cleared it already).
  ctx.globalAlpha = 1
  ctx.fillStyle = rgba(state.bg, 1)
  ctx.fillRect(0, 0, state.w, state.h)
}

function advanceOrbit(state: ThreeBodyState, ctx: CanvasRenderingContext2D): void {
  if (state.cycling) {
    state.cyclePos = (state.cyclePos + 1) % state.order.length
    state.activeOrbit = state.order[state.cyclePos]
  }
  // (non-cycling simply re-enters the same orbit — a repeating draw/fade loop)
  enterOrbit(state, ctx)
}

const sx = (fit: Fit, wx: number) => fit.ox + wx * fit.scale
const sy = (fit: Fit, wy: number) => fit.oy - wy * fit.scale

/** Stroke one body's accumulated polyline for the frame: a soft wide halo, then
 *  a bright thin core (two-layer glow avoids additive white-out). */
function strokePolyline(
  ctx: CanvasRenderingContext2D,
  buf: Float64Array,
  count: number,
  col: RGBA,
  lw: number,
  glow: number,
): void {
  if (count < 2) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Luminous light-painting look: additive ('lighter') bloom passes over black
  // make the trail GLOW in its own colour; a crisp opaque core on top keeps the
  // hue saturated (two-layer glow → no additive white-out, per the gallery memory).
  if (glow > 0) {
    ctx.globalCompositeOperation = 'lighter'
    // wide soft halo
    ctx.strokeStyle = rgba(col, glow)
    ctx.lineWidth = lw * 3.6
    tracePath(ctx, buf, count)
    // brighter narrow inner glow — the luminous colored thread
    ctx.strokeStyle = rgba(col, Math.min(0.6, glow * 2.6))
    ctx.lineWidth = lw * 1.7
    tracePath(ctx, buf, count)
    ctx.globalCompositeOperation = 'source-over'
  }
  // crisp opaque core, full colour
  ctx.strokeStyle = rgba(col, 1)
  ctx.lineWidth = lw
  tracePath(ctx, buf, count)
}

/** Build + stroke the polyline path from a screen-coord buffer. */
function tracePath(ctx: CanvasRenderingContext2D, buf: Float64Array, count: number): void {
  ctx.beginPath()
  ctx.moveTo(buf[0], buf[1])
  for (let i = 1; i < count; i++) ctx.lineTo(buf[2 * i], buf[2 * i + 1])
  ctx.stroke()
}

function flushPolylines(state: ThreeBodyState, ctx: CanvasRenderingContext2D): void {
  const lw = state.cfg.lineWidth
  const glow = state.cfg.glow
  for (let b = 0; b < 3; b++) {
    strokePolyline(ctx, state.pts[b], state.ptCount[b], state.colors[b], lw, glow)
  }
}

/** Seed each body's polyline with its current screen position (the head of the
 *  new frame's stroke). */
function resetPolylines(state: ThreeBodyState): void {
  const { fit } = state
  for (let b = 0; b < 3; b++) {
    state.pts[b][0] = sx(fit, state.y[2 * b])
    state.pts[b][1] = sy(fit, state.y[2 * b + 1])
    state.ptCount[b] = 1
  }
}

function pushPoints(state: ThreeBodyState): void {
  const { fit } = state
  for (let b = 0; b < 3; b++) {
    const c = state.ptCount[b]
    state.pts[b][2 * c] = sx(fit, state.y[2 * b])
    state.pts[b][2 * c + 1] = sy(fit, state.y[2 * b + 1])
    state.ptCount[b] = c + 1
  }
}

/** Bright glowing heads at each body's current position — the 3 points chasing
 *  around the curve. Additive halo for bloom, opaque core + white-hot pip. */
function drawBodies(state: ThreeBodyState, ctx: CanvasRenderingContext2D): void {
  const { fit } = state
  const core = Math.max(3, state.cfg.lineWidth * 2.2)
  const glow = state.cfg.glow
  for (let b = 0; b < 3; b++) {
    const cx = sx(fit, state.y[2 * b])
    const cy = sy(fit, state.y[2 * b + 1])
    const col = state.colors[b]
    // additive bloom (wide soft + brighter mid) so the head really glows
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = rgba(col, Math.min(0.55, 0.18 + glow * 1.6))
    ctx.beginPath()
    ctx.arc(cx, cy, core * 3.4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rgba(col, 0.7)
    ctx.beginPath()
    ctx.arc(cx, cy, core * 1.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    // opaque saturated core
    ctx.fillStyle = rgba(col, 1)
    ctx.beginPath()
    ctx.arc(cx, cy, core, 0, Math.PI * 2)
    ctx.fill()
    // white-hot centre pip for a sparkle
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.beginPath()
    ctx.arc(cx, cy, core * 0.45, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawLabel(state: ThreeBodyState, ctx: CanvasRenderingContext2D): void {
  const name = ORBITS[state.activeOrbit].name
  ctx.font = '500 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.fillText(name, 16, state.h - 16)
}

/** trailFade (0..1) → exponential-decay time constant (seconds) for the draw-phase
 *  wash. Long by design: the whole current choreography should stay lit as glowing
 *  ribbons (a period is only a few seconds), so even the default keeps ~1.5–2
 *  periods bright. The transition uses its own much stronger wash to clear. */
function trailTau(trailFade: number): number {
  return 1.5 + trailFade * 8.0
}

const presets: PresetGroup<ThreeBodyConfig>[] = [
  { label: 'Featured', options: featuredPresets },
  { label: 'Palette', options: palettePresets },
]

function makeOrder(cfg: ThreeBodyConfig): { order: number[]; cycling: boolean; active: number } {
  if (cfg.orbit === CYCLE_ALL) {
    const order = cycleOrder(ORBITS.length, cfg.seed)
    return { order, cycling: true, active: order[0] }
  }
  const idx = Math.max(0, orbitIndexByName(cfg.orbit))
  return { order: [idx], cycling: false, active: idx }
}

const threeBody = defineDiversion<typeof threeBodySchema, ThreeBodyState, '2d'>({
  id: 'three-body',
  title: 'Three-Body Choreographies',
  description: 'A catalogue of real periodic three-body orbits — Šuvakov–Dmitrašinović, Simó’s '
    + 'figure-eight and more — integrated numerically. Three bodies chase each other around a fixed '
    + 'closed choreography, each leaving a glowing trail, cycling one at a time forever.',
  kind: '2d',
  schema: threeBodySchema,
  presets,

  setup(ctx, config, size: Size) {
    const { order, cycling, active } = makeOrder(config)
    const cap = 2 * (MAX_SUBSTEPS + 4)
    const state: ThreeBodyState = {
      cfg: config,
      w: size.width,
      h: size.height,
      y: new Float64Array(12),
      ic: new Float64Array(12),
      scratch: makeScratch(),
      order,
      cyclePos: 0,
      activeOrbit: active,
      cycling,
      orbitElapsed: 0,
      periodsDone: 0,
      phase: 'draw',
      fadeElapsed: 0,
      fit: { scale: 1, ox: size.width / 2, oy: size.height / 2 },
      bg: parseHex6(config.background),
      colors: parseColors(config.colors),
      pts: [new Float64Array(cap), new Float64Array(cap), new Float64Array(cap)],
      ptCount: [0, 0, 0],
    }
    enterOrbit(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    const { w, h } = state
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    if (state.phase === 'fade') {
      state.fadeElapsed += dt
      // Strong exponential wash toward the background so trails clear cleanly.
      const a = 1 - Math.exp(-(dt / 1000) / 0.32)
      ctx.globalAlpha = 1
      ctx.fillStyle = rgba(state.bg, Math.min(0.8, a))
      ctx.fillRect(0, 0, w, h)
      if (state.cfg.showLabel) drawLabel(state, ctx)
      if (state.fadeElapsed >= FADE_MS) advanceOrbit(state, ctx)
      return
    }

    // ── draw phase ──
    const dtS = dt / 1000
    if (dtS <= 0) return

    // 1. Fade the whole canvas slightly so trails decay (frame-rate-independent).
    const tau = trailTau(state.cfg.trailFade)
    const fadeA = 1 - Math.exp(-dtS / tau)
    ctx.globalAlpha = 1
    ctx.fillStyle = rgba(state.bg, fadeA)
    ctx.fillRect(0, 0, w, h)

    // 2. Integrate + accumulate trail polylines.
    const o = ORBITS[state.activeOrbit]
    const advance = SIM_RATE * state.cfg.speed * dtS
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(advance / DT)))
    const dtStep = advance / steps
    const periodsTarget = state.cfg.periodsPerOrbit

    resetPolylines(state)
    let reachedEnd = false

    for (let s = 0; s < steps; s++) {
      rk4Step(state.y, dtStep, state.scratch)
      state.orbitElapsed += dtStep
      pushPoints(state)

      // Completed a full period? Hard-reset to the exact IC to kill any tiny
      // drift (the trajectory returns to IC at t=T, so this snap is invisible).
      if (state.orbitElapsed >= (state.periodsDone + 1) * o.T) {
        state.periodsDone++
        flushPolylines(state, ctx) // draw what we have before the snap
        state.y.set(state.ic)
        resetPolylines(state) // restart the polyline at the IC head (no teleport line)
        if (state.periodsDone >= periodsTarget) {
          reachedEnd = true
          break
        }
      }
    }
    flushPolylines(state, ctx)

    // 3. Bright body heads on top.
    drawBodies(state, ctx)

    // 4. Subtle label.
    if (state.cfg.showLabel) drawLabel(state, ctx)

    if (reachedEnd) {
      state.phase = 'fade'
      state.fadeElapsed = 0
    }
  },

  resize(state, size) {
    // Orbit geometry is viewport-independent: just track the new size and refit.
    // The ResizeObserver fires on every fullscreen/drag reflow, so do NOT restart
    // the sim — the persistent canvas keeps whatever was already drawn.
    state.w = size.width
    state.h = size.height
    state.fit = computeFit(state.activeOrbit, size.width, size.height)
  },

  update(state, config) {
    // Structural changes (which orbit, or the cycle-shuffle seed) need a full
    // re-setup; everything else applies live over the persistent canvas.
    const c = state.cfg
    if (config.orbit !== c.orbit || config.seed !== c.seed) return false
    state.cfg = config
    state.bg = parseHex6(config.background)
    state.colors = parseColors(config.colors)
    return true
  },
})

export default threeBody
