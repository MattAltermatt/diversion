import { defineDiversion, type PresetGroup } from '../../framework/types'
import { hexToRgba, trailFadeAlpha, toHex2, buildGradientLUT, gradientIndex } from '../../framework/gradient'
import { strangeAttractorsSchema, type StrangeAttractorsConfig } from './schema'
import {
  MAPS, sampleCoeffs, driftedCoeffs, attractorColorT, screenScale, type Coeffs,
} from './attractors'
import { attractorPresets, colorPresets } from './presets'
import { meta } from './meta'

interface AttractorState {
  cfg: StrangeAttractorsConfig
  base: Coeffs      // sampled from (attractor, seed) — drift wobbles around this
  x: number         // persistent orbit position (world space)
  y: number
  driftTime: number // morph clock; accumulates clamped dt so pause doesn't teleport
  styles: string[]  // precomputed rgba() per palette color
  gradientLUT: string[] // precomputed rgba() LUT for gradient mode ([] in palette mode)
  w: number
  h: number
}

/** Gradient-mode colour LUT (empty in palette mode). The attractor colour source
 *  is always non-cyclic → wrap=false. Rebuilt on config change. */
function gradientLUTFor(cfg: StrangeAttractorsConfig): string[] {
  return cfg.color.mode === 'gradient' ? buildGradientLUT(cfg.color.stops, false) : []
}

const POINT_ALPHA = 0.16 // per-point additive opacity — low, so density builds up

function makeState(cfg: StrangeAttractorsConfig, w: number, h: number): AttractorState {
  return {
    cfg,
    base: sampleCoeffs(cfg.attractor, cfg.seed),
    x: 0.1,
    y: 0.1,
    driftTime: 0,
    styles: cfg.color.colors.map(hexToRgba),
    gradientLUT: gradientLUTFor(cfg),
    w,
    h,
  }
}

// Two independent preset axes (mirrors Flow Field). The Attractor axis sets the
// map + a signature seed; the Color axis patches background + blend + the whole
// color group. Seed stays independent of Color so the 🎲 dice still surprises.
const presets: PresetGroup<StrangeAttractorsConfig>[] = [
  { label: 'Attractor', options: attractorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  {
    label: 'Palette',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]

const strangeAttractors = defineDiversion<typeof strangeAttractorsSchema, AttractorState, '2d'>({
  ...meta,
  schema: strangeAttractorsSchema,

  setup(ctx, config, size) {
    // Reset context state before the fill — the previous frame's leftover
    // globalCompositeOperation/globalAlpha (frame() leaves them on a blend mode
    // + POINT_ALPHA) would otherwise stop the background fill from actually
    // clearing the old point cloud when switching attractor/seed.
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

    // 2. drifted coefficients for this instant. Advance a morph clock from the
    // host's (dt-clamped) delta rather than absolute t, so a paused/hidden tab
    // doesn't teleport the drift phase on resume (matches Flow Field's idiom).
    state.driftTime += dt
    const c = driftedCoeffs(state.base, state.driftTime, cfg.drift)

    // 3. plot pointsPerFrame additive dots
    ctx.globalCompositeOperation = (
      cfg.blend === 'normal' ? 'source-over' : cfg.blend
    ) as GlobalCompositeOperation
    ctx.globalAlpha = POINT_ALPHA
    const scale = screenScale(cfg.attractor, w, h)
    const cx = w / 2, cy = h / 2
    const maxR = Math.min(w, h) / 2
    const dotSize = 1 // px; keeps points crisp
    const step = MAPS[cfg.attractor]
    const n = state.styles.length
    let { x, y } = state
    for (let i = 0; i < cfg.pointsPerFrame; i++) {
      const next = step(x, y, c); x = next.x; y = next.y
      if (!Number.isFinite(x) || !Number.isFinite(y)) { x = 0.1; y = 0.1; continue }
      const sx = cx + x * scale
      const sy = cy + y * scale
      if (sx < 0 || sx >= w || sy < 0 || sy >= h) continue // off-screen, skip draw
      const tCol = attractorColorT(cfg.color.source, sx, sy, cx, cy, maxR, w, h)
      ctx.fillStyle = cfg.color.mode === 'gradient'
        ? state.gradientLUT[gradientIndex(tCol)]
        : state.styles[Math.min(n - 1, Math.floor(tCol * n))]
      ctx.fillRect(sx, sy, dotSize, dotSize)
    }
    state.x = x
    state.y = y
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
    // Structural changes need a fresh orbit / fresh coefficients.
    if (config.attractor !== state.cfg.attractor || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.styles = config.color.colors.map(hexToRgba)
    state.gradientLUT = gradientLUTFor(config)
    return true
  },

  presets,
})

export default strangeAttractors
