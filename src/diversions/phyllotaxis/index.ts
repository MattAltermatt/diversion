import { Delaunay } from 'd3-delaunay'
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { sampleGradient } from '../../framework/gradient'
import { phyllotaxisSchema, type PhyllotaxisConfig } from './schema'
import { writeSitePositions, writeFlowPositions, diskRadius, divergenceAt } from './phyllotaxis'
import { formPresets, palettePresets } from './presets'

const LUT_SIZE = 512 // palette samples cached once per config so fills are a lookup

interface PhyllotaxisState {
  cfg: PhyllotaxisConfig
  coords: Float64Array // preallocated 2·count buffer, refilled each frame
  lut: string[]        // rgba strings sampled across the palette
  t: number            // sweep clock (seconds, speed-scaled)
  shown: number        // florets accreted so far (sweep/still grow-in)
  spawn: number        // florets emitted so far (flow motion)
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
    spawn: cfg.count, // start pre-populated so Flow has no empty startup
    w,
    h,
  }
}

const presets: PresetGroup<PhyllotaxisConfig>[] = [
  { label: 'Form', options: formPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

const phyllotaxis = defineDiversion<typeof phyllotaxisSchema, PhyllotaxisState, '2d'>({
  id: 'phyllotaxis',
  title: 'Phyllotaxis',
  description: 'A golden-angle fountain: shapes are born at the centre and stream outward forever.',
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
    state.t += dts * cfg.speed

    // Repaint the whole background — closed-form redraw, no trail buffer.
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)

    const flow = cfg.motion === 'flow'
    let drawN: number
    let n = 0
    let refR: number   // radius at which a leaf reaches full size / palette end
    let cullR = Infinity

    if (flow) {
      // Screen-fit spacing: the `count` youngest florets always span centre→just
      // off-corner, so the fountain fills the frame and streams off-screen at any
      // density (count = density, not extent). Emission advances `spawn`.
      const reach = (Math.hypot(w, h) * 0.5 * 1.12) / cfg.zoom
      const flowSpacing = reach / Math.sqrt(cfg.count)
      state.spawn += cfg.emitRate * dts * cfg.speed
      const res = writeFlowPositions(state.coords, cfg.count, state.spawn, cfg.divergence, flowSpacing, cfg.jitter, cfg.seed)
      n = res.n
      drawN = cfg.count
      refR = reach * 0.6
      cullR = reach + Math.max(cfg.leafLength, cfg.leafWidth)
    } else {
      if (state.shown < cfg.count) {
        state.shown = cfg.growSeconds > 0
          ? Math.min(cfg.count, state.shown + (cfg.count / cfg.growSeconds) * dts)
          : cfg.count
      }
      drawN = Math.min(cfg.count, Math.floor(state.shown))
      const divergence = cfg.motion === 'sweep'
        ? divergenceAt(cfg.divergence, cfg.sweepAmp, cfg.sweepPeriod, state.t)
        : cfg.divergence
      writeSitePositions(state.coords, drawN, divergence, cfg.spacing, cfg.jitter, cfg.seed)
      refR = diskRadius(cfg.spacing, cfg.count) * 0.6
    }
    if (drawN < 3) return

    const denomIdx = Math.max(1, cfg.count - 1)
    // Colour param for floret j: in flow, index cycles by birth-id so colours stream
    // outward and repeat; otherwise it's the static growth-order / radius ramp.
    const colorT = (j: number, r: number): number => {
      if (cfg.colorBy === 'radius') return Math.min(1, r / refR)
      return flow ? mod(n - j, cfg.count) / cfg.count : j / denomIdx
    }
    const colorStr = (tc: number): string => state.lut[Math.min(LUT_SIZE - 1, (tc * LUT_SIZE) | 0)]

    ctx.save()
    ctx.translate(w / 2, h / 2)
    if (cfg.zoom !== 1) ctx.scale(cfg.zoom, cfg.zoom)

    if (cfg.renderMode === 'mesh') {
      const rMax = flow ? cullR : diskRadius(cfg.spacing, drawN)
      const bound = rMax + cfg.spacing * 2
      const delaunay = new Delaunay(state.coords.subarray(0, 2 * drawN))
      const voronoi = delaunay.voronoi([-bound, -bound, bound, bound])
      ctx.save()
      ctx.beginPath()
      ctx.arc(0, 0, flow ? cullR : rMax + cfg.spacing * 0.75, 0, Math.PI * 2)
      ctx.clip()
      for (let i = 0; i < drawN; i++) {
        const r = Math.hypot(state.coords[2 * i], state.coords[2 * i + 1])
        ctx.fillStyle = colorStr(colorT(i, r))
        ctx.beginPath()
        voronoi.renderCell(i, ctx)
        ctx.fill()
      }
      if (cfg.strokeWidth > 0) {
        ctx.beginPath()
        voronoi.render(ctx)
        ctx.strokeStyle = cfg.strokeColor
        ctx.lineWidth = cfg.strokeWidth
        ctx.lineJoin = 'round'
        ctx.stroke()
      }
      ctx.restore()
    } else {
      // Leaf mode: each floret is a radial rounded rectangle streaming from the centre.
      const baseL = cfg.leafLength, baseW = cfg.leafWidth
      const shade = cfg.leafShade * 0.6
      ctx.globalAlpha = cfg.leafAlpha
      ctx.lineJoin = 'round'
      for (let j = 0; j < drawN; j++) {
        const x = state.coords[2 * j], y = state.coords[2 * j + 1]
        const r = Math.hypot(x, y)
        if (r > cullR) continue // flowed off-screen
        const s = (1 - cfg.sizeGrow) + cfg.sizeGrow * Math.min(1, r / refR)
        const L = baseL * s, W = baseW * s
        const hl = L * 0.5, hw = W * 0.5
        const round = Math.min(cfg.leafRound * hw, hw, hl)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(Math.atan2(y, x))
        ctx.fillStyle = colorStr(colorT(j, r))
        ctx.beginPath()
        ctx.roundRect(-hl, -hw, L, W, round)
        ctx.fill()
        if (shade > 0) {
          ctx.fillStyle = `rgba(0,0,0,${shade})`
          ctx.beginPath(); ctx.moveTo(-hl, -hw); ctx.lineTo(hl, hw); ctx.lineTo(-hl, hw); ctx.closePath(); ctx.fill()
          ctx.fillStyle = `rgba(255,255,255,${shade * 0.5})`
          ctx.beginPath(); ctx.moveTo(-hl, -hw); ctx.lineTo(hl, -hw); ctx.lineTo(hl, hw); ctx.closePath(); ctx.fill()
        }
        ctx.restore()
      }
      ctx.globalAlpha = 1
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
    if (config.count !== state.cfg.count || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.lut = buildLUT(config.color.stops)
    return true
  },

  presets,
})

export default phyllotaxis
