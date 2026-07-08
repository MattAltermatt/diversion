import { defineDiversion, type PresetGroup } from '../../framework/types'
import { hexToRgba, trailFadeAlpha, toHex2, buildGradientLUT, gradientIndex } from '../../framework/gradient'
import { thornbirdSchema, type ThornbirdConfig } from './schema'
import {
  step, INITIAL_POINT, sampleFreqs, driftedParams, thornbirdColorT, screenScale,
  type ThornbirdPoint, type DriftFreqs,
} from './attractor'
import { shapePresets, colorPresets } from './presets'

interface ThornbirdState {
  cfg: ThornbirdConfig
  freqs: DriftFreqs  // wobble periods — seeded, drives the A/C breathing
  point: ThornbirdPoint // persistent orbit position (world space)
  driftTime: number  // morph clock; accumulates clamped dt so pause doesn't teleport
  styles: string[]   // precomputed rgba() per palette color
  gradientLUT: string[] // precomputed rgba() LUT for gradient mode ([] in palette mode)
  w: number
  h: number
}

/** Gradient-mode colour LUT (empty in palette mode). Rebuilt on config change. */
function gradientLUTFor(cfg: ThornbirdConfig): string[] {
  return cfg.color.mode === 'gradient' ? buildGradientLUT(cfg.color.stops, false) : []
}

const POINT_ALPHA = 0.16 // per-point additive opacity — low, so density builds up

function makeState(cfg: ThornbirdConfig, w: number, h: number): ThornbirdState {
  return {
    cfg,
    freqs: sampleFreqs(cfg.seed),
    point: { ...INITIAL_POINT },
    driftTime: 0,
    styles: cfg.color.colors.map(hexToRgba),
    gradientLUT: gradientLUTFor(cfg),
    w,
    h,
  }
}

// Two independent preset axes (mirrors Strange Attractors / Flow Field). Shape
// sets the map's two free coefficients + a signature seed; Palette patches
// background + blend + the whole color group.
const presets: PresetGroup<ThornbirdConfig>[] = [
  { label: 'Shape', options: shapePresets.map((p) => ({ name: p.name, patch: p.patch })) },
  {
    label: 'Palette',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]

const thornbird = defineDiversion<typeof thornbirdSchema, ThornbirdState, '2d'>({
  id: 'thornbird',
  title: 'Thornbird',
  description: 'A luminous thread-fractal — after xscreensaver’s Thornbird hack '
    + '(Tim Auckland) and Clifford Pickover’s "Bird in a Thornbush" iterated map.',
  kind: '2d',
  schema: thornbirdSchema,

  setup(ctx, config, size) {
    // Reset context state before the fill — the previous frame's leftover
    // globalCompositeOperation/globalAlpha (frame() leaves them on a blend mode
    // + POINT_ALPHA) would otherwise stop the background fill from actually
    // clearing the old point cloud when switching seed/shape.
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return makeState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const { cfg, w, h } = state

    // 1. fade for trails (low-alpha bg fill) or hard-clear
    ctx.globalCompositeOperation = 'source-over'
    const fadeAlpha = cfg.fadeTrails ? trailFadeAlpha(cfg.trailLength) : 1
    ctx.globalAlpha = 1
    ctx.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
    ctx.fillRect(0, 0, w, h)

    // 2. drifted (a, c) for this instant. Advance a morph clock from the
    // host's (dt-clamped) delta rather than absolute t, so a paused/hidden tab
    // doesn't teleport the drift phase on resume (matches the other
    // strange-attractor-family diversions' idiom).
    state.driftTime += dt
    const params = driftedParams(cfg.paramA, cfg.paramC, state.freqs, state.driftTime, cfg.drift)

    // 3. plot pointsPerFrame additive dots
    ctx.globalCompositeOperation = (
      cfg.blend === 'normal' ? 'source-over' : cfg.blend
    ) as GlobalCompositeOperation
    ctx.globalAlpha = POINT_ALPHA
    const scale = screenScale(w, h)
    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) / 2
    const dotSize = 1 // px; keeps points crisp
    const n = state.styles.length
    let p = state.point
    for (let i = 0; i < cfg.pointsPerFrame; i++) {
      p = step(p, params)
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        p = { ...INITIAL_POINT }
        continue
      }
      const sx = cx + p.x * scale
      const sy = cy + p.y * scale
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue // off-screen, skip draw
      const tCol = thornbirdColorT(cfg.color.source, sx, sy, cx, cy, maxR, w, h)
      ctx.fillStyle = cfg.color.mode === 'gradient'
        ? state.gradientLUT[gradientIndex(tCol)]
        : state.styles[Math.min(n - 1, Math.floor(tCol * n))]
      ctx.fillRect(sx, sy, dotSize, dotSize)
    }
    state.point = p
    ctx.globalAlpha = 1
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // Resizing the canvas wipes the backing store; repaint bg so it doesn't flash.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Every field applies live: paramA/paramC/drift/pointsPerFrame feed the
    // per-frame math directly from cfg, and even a seed change just rerolls
    // the wobble frequencies without needing to reset the orbit.
    if (config.seed !== state.cfg.seed) state.freqs = sampleFreqs(config.seed)
    state.cfg = config
    state.styles = config.color.colors.map(hexToRgba)
    state.gradientLUT = gradientLUTFor(config)
    return true
  },

  presets,
})

export default thornbird
