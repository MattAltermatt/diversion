import { defineDiversion, type PresetGroup } from '../../framework/types'
import { mandalaSchema, type MandalaConfig } from './schema'
import {
  buildLut, buildMandala, drawRing, ringReveal, revealAlpha, revealScale,
  REVEAL_SPAN, type Mandala, type Rgb,
} from './mandala'
import { palettePresets, motifPresets } from './presets'

const MARGIN = 0.94 // fraction of the half-min-dimension the outer ring reaches

interface MandalaState {
  cfg: MandalaConfig
  w: number
  h: number
  dpr: number
  m: Mandala
  lut: Rgb[]
  t: number // seconds
  buffer: HTMLCanvasElement | null
  bctx: CanvasRenderingContext2D | null
  bakedCount: number // rings already baked into the accumulation buffer
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

function makeBuffer(size: { width: number; height: number }, dpr: number) {
  // The accumulation buffer holds fully-revealed rings baked once at full res, so
  // per frame we only redraw the handful of rings still blooming (perf) while the
  // BACKGROUND is composited live (so bg / palette edits always apply).
  const buffer = document.createElement('canvas')
  buffer.width = Math.max(1, Math.round(size.width * dpr))
  buffer.height = Math.max(1, Math.round(size.height * dpr))
  const bctx = buffer.getContext('2d')
  if (bctx) bctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw the buffer in CSS px too
  return { buffer, bctx }
}

function resetBuffer(s: MandalaState) {
  if (s.bctx && s.buffer) {
    s.bctx.save()
    s.bctx.setTransform(1, 0, 0, 1, 0, 0)
    s.bctx.clearRect(0, 0, s.buffer.width, s.buffer.height)
    s.bctx.restore()
  }
  s.bakedCount = 0
}

const mandala = defineDiversion<typeof mandalaSchema, MandalaState, '2d'>({
  id: 'mandala',
  title: 'Mandala',
  description: 'A jewel-toned kaleidoscopic mandala blooms itself into being — ring by ring of '
    + 'petals, lotus points and dots repeated in perfect N-fold symmetry — then holds, fades, '
    + 'and reseeds a fresh one, endlessly.',
  kind: '2d',
  schema: mandalaSchema,

  setup(ctx, config, size) {
    const dpr = ctx.canvas.width / Math.max(1, size.width)
    const { buffer, bctx } = makeBuffer(size, dpr)
    return {
      cfg: config, w: size.width, h: size.height, dpr,
      m: buildMandala(config), lut: buildLut(config.palette),
      t: 0, buffer, bctx, bakedCount: 0,
    }
  },

  frame(state, ctx, _t, dt) {
    const s = state
    s.t += dt / 1000
    const cfg = s.cfg
    const cx = s.w / 2, cy = s.h / 2
    const maxR = 0.5 * Math.min(s.w, s.h) * MARGIN
    const g = s.t * cfg.growthSpeed // growth clock in ring-units

    // Fade phase: after the mandala is built + held, dissolve to background.
    const holdEnd = s.m.doneTime + cfg.holdSeconds
    const fade = s.t <= holdEnd ? 1 : clamp01(1 - (s.t - holdEnd) / cfg.fadeSeconds)

    // 1) Background, live every frame.
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, s.w, s.h)

    // 2) Bake any rings that have just finished revealing into the buffer (once each).
    const fullCount = Math.max(0, Math.min(s.m.rings.length, Math.floor(g - REVEAL_SPAN) + 1))
    if (s.bctx) {
      while (s.bakedCount < fullCount) {
        drawRing(s.bctx, s.m.rings[s.bakedCount], cx, cy, maxR, s.lut, cfg.mirror, cfg.lineWidth, 1, 1)
        s.bakedCount++
      }
    }

    // 3) Composite the baked rings, faded as a whole.
    if (s.buffer && fade > 0 && s.bakedCount > 0) {
      ctx.globalAlpha = fade
      ctx.drawImage(s.buffer, 0, 0, s.w, s.h)
      ctx.globalAlpha = 1
    }

    // 4) Draw the still-blooming frontier rings live (not yet baked).
    if (fade > 0) {
      ctx.globalAlpha = fade
      const liveMax = Math.min(s.m.rings.length, Math.floor(g) + 1)
      for (let i = fullCount; i < liveMax; i++) {
        const a = ringReveal(i, g)
        if (a <= 0) continue
        drawRing(ctx, s.m.rings[i], cx, cy, maxR, s.lut, cfg.mirror, cfg.lineWidth,
          revealAlpha(a), revealScale(a))
      }
      ctx.globalAlpha = 1
    }
  },

  // Endless screensaver loop: reseed once the fade has fully dissolved the mandala.
  shouldRestart(state) {
    const holdEnd = state.m.doneTime + state.cfg.holdSeconds
    return state.t > holdEnd + state.cfg.fadeSeconds
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    state.dpr = ctx.canvas.width / Math.max(1, size.width)
    const { buffer, bctx } = makeBuffer(size, state.dpr)
    state.buffer = buffer
    state.bctx = bctx
    state.bakedCount = 0 // geometry is normalized; re-bake at the new scale
  },

  update(state, config) {
    const s = state
    const prev = s.cfg
    const newMandala = config.symmetry !== prev.symmetry || config.ringCount !== prev.ringCount
      || config.motifStyle !== prev.motifStyle || config.seed !== prev.seed
    const geomRebuild = newMandala || config.sizeScale !== prev.sizeScale
      || config.growthSpeed !== prev.growthSpeed
    const paletteChanged = config.palette.join() !== prev.palette.join()
    s.cfg = config
    s.lut = buildLut(config.palette)
    if (geomRebuild) s.m = buildMandala(config)
    if (geomRebuild || paletteChanged) resetBuffer(s) // recolor / rescale → re-bake
    if (newMandala) s.t = 0 // a fresh mandala re-blooms from the centre
    return true
  },

  teardown(state) {
    state.buffer = null
    state.bctx = null
  },

  presets: [
    { label: 'Palette', options: palettePresets },
    { label: 'Motifs', options: motifPresets },
  ] as PresetGroup<MandalaConfig>[],
})

export default mandala
