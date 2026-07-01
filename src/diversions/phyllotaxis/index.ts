import { Delaunay } from 'd3-delaunay'
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { sampleGradient } from '../../framework/gradient'
import { phyllotaxisSchema, type PhyllotaxisConfig } from './schema'
import { writeSitePositions, diskRadius, divergenceAt } from './phyllotaxis'
import { palettePresets } from './presets'

const LUT_SIZE = 512 // palette samples cached once per config so cell fills are a lookup

interface PhyllotaxisState {
  cfg: PhyllotaxisConfig
  coords: Float64Array // preallocated 2·count buffer, refilled each frame (positions sweep)
  lut: string[]        // rgba strings sampled across the palette
  t: number            // sweep clock (seconds, speed-scaled)
  shown: number        // florets accreted so far (float; grows during the intro)
  w: number
  h: number
}

function buildLUT(stops: string[]): string[] {
  const lut = new Array<string>(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) lut[i] = sampleGradient(stops, i / (LUT_SIZE - 1), false)
  return lut
}

function makeState(cfg: PhyllotaxisConfig, w: number, h: number): PhyllotaxisState {
  return {
    cfg,
    coords: new Float64Array(2 * cfg.count),
    lut: buildLUT(cfg.color.stops),
    t: 0,
    shown: cfg.growSeconds > 0 ? 0 : cfg.count,
    w,
    h,
  }
}

const presets: PresetGroup<PhyllotaxisConfig>[] = [
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const phyllotaxis = defineDiversion<typeof phyllotaxisSchema, PhyllotaxisState, '2d'>({
  id: 'phyllotaxis',
  title: 'Phyllotaxis',
  description: 'A golden-angle seed head tessellates into Fibonacci spirals, then shatters and re-forms.',
  kind: '2d',
  schema: phyllotaxisSchema,

  setup(ctx, config, size) {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return makeState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const { cfg, w, h } = state
    const dts = dt / 1000

    // Clocks: sweep is speed-scaled; the grow-in intro runs in fixed wall-clock
    // (its own slider owns its duration).
    state.t += dts * cfg.speed
    if (state.shown < cfg.count) {
      state.shown = cfg.growSeconds > 0
        ? Math.min(cfg.count, state.shown + (cfg.count / cfg.growSeconds) * dts)
        : cfg.count
    }
    const shown = Math.min(cfg.count, Math.floor(state.shown))

    // Repaint the whole background every frame — closed-form redraw, no trail buffer.
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
    if (shown < 3) return // Delaunay needs ≥3 sites

    const divergence = divergenceAt(cfg.divergence, cfg.sweepAmp, cfg.sweepPeriod, state.t)
    writeSitePositions(state.coords, shown, divergence, cfg.spacing, cfg.jitter, cfg.seed)

    const rGrow = diskRadius(cfg.spacing, shown)
    const bound = rGrow + cfg.spacing * 2
    const delaunay = new Delaunay(state.coords.subarray(0, 2 * shown))
    const voronoi = delaunay.voronoi([-bound, -bound, bound, bound])

    ctx.save()
    ctx.translate(w / 2, h / 2)
    // Clip to the current grown disk so outer (unbounded) cells don't balloon to the corners.
    ctx.beginPath()
    ctx.arc(0, 0, rGrow + cfg.spacing * 0.75, 0, Math.PI * 2)
    ctx.clip()

    const denom = cfg.colorBy === 'index' ? Math.max(1, cfg.count - 1) : cfg.count
    for (let i = 0; i < shown; i++) {
      const tCol = cfg.colorBy === 'index' ? i / denom : Math.sqrt(i / denom)
      ctx.fillStyle = state.lut[Math.min(LUT_SIZE - 1, (tCol * LUT_SIZE) | 0)]
      ctx.beginPath()
      voronoi.renderCell(i, ctx)
      ctx.fill()
    }

    if (cfg.strokeWidth > 0) {
      ctx.beginPath()
      voronoi.render(ctx) // all interior cell borders in one path
      ctx.strokeStyle = cfg.strokeColor
      ctx.lineWidth = cfg.strokeWidth
      ctx.lineJoin = 'round'
      ctx.stroke()
    }
    ctx.restore()
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // count resizes the coord buffer, seed re-rolls the jitter — cleanest via re-setup.
    if (config.count !== state.cfg.count || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.lut = buildLUT(config.color.stops)
    return true
  },

  presets,
})

export default phyllotaxis
