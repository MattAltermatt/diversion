import { defineDiversion } from '../../framework/types'
import { mix, parseHex6 } from '../../framework/color'
import { chimeSchema, type ChimeConfig } from './schema'
import { palettePresets, rhythmPresets } from './presets'
import {
  createChimeState, stepChime, rippleAmplitude, rippleTone, type ChimeState,
} from './chime'

// A ripple is drawn analytically, not as a persistence trail: an annulus filled
// with a radial gradient that runs from transparent at the inner edge to bright
// at the leading edge, plus a hairline stroke ON the leading edge. That's the
// "defined outer edge with a wake dissolving behind it" read, and unlike a
// fade-buffer it leaves NO residue — a decaying buffer stalls at 8-bit rounding
// (a mark stops losing alpha once the per-frame decrement rounds below 1/255),
// so an unattended screensaver silently accumulates a permanent haze, and a front
// that advances further per frame than its own line width lays down separated
// rings instead of a continuous wake. Costs one gradient per ripple per frame,
// which is nothing at the handful of fronts this piece keeps in flight.
const LUT_SIZE = 128

/** Palette → LUT of [r,g,b] triples. Alpha varies per ripple per frame, so the
 *  strings can't be cached; the parse of the palette itself is what we hoist. */
function ensureLut(state: ChimeState): number[][] {
  const key = state.cfg.colors.join('|')
  if (key === state.lutKey && state.lut.length) return state.lut
  const stops = state.cfg.colors.map(parseHex6)
  const lut = new Array<number[]>(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const scaled = (i / (LUT_SIZE - 1)) * (stops.length - 1)
    let s = Math.floor(scaled)
    if (s >= stops.length - 1) s = stops.length - 2
    const c = mix(stops[s], stops[s + 1], scaled - s)
    lut[i] = [c.r, c.g, c.b]
  }
  state.lutKey = key
  state.lut = lut
  return lut
}

const toneIndex = (t: number): number => {
  const i = (t * (LUT_SIZE - 1) + 0.5) | 0
  return i < 0 ? 0 : i > LUT_SIZE - 1 ? LUT_SIZE - 1 : i
}

// Fields baked into the field at setup time — a change to any of them can't be
// applied to a live run (capacities, tempos and positions are all dealt once).
function structuralKey(c: ChimeConfig): string {
  return `${c.nodeCount}|${c.seed}|${c.layout}|${c.sizeSkew}|${c.chargeSpeed}|${c.rateSpread}`
}

const chime = defineDiversion<typeof chimeSchema, ChimeState, '2d'>({
  id: 'chime',
  title: 'Chime',
  description: 'A still field of wells, each filling with energy at its own pace. A full well '
    + 'rings out — a wavefront that expands exactly as far as the energy it released, tipping '
    + 'every charged well it sweeps over into ringing too. Chains, silences and standing '
    + 'interference emerge from nothing but filling and spilling.',
  kind: '2d',
  schema: chimeSchema,
  presets: [
    { label: 'Palette', options: palettePresets },
    { label: 'Rhythm', options: rhythmPresets },
  ],

  setup(ctx, config, size) {
    const state = createChimeState(config, size.width, size.height)
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepChime(state, Math.min(Math.max(dt / 1000, 0), 0.05))

    const { cfg, w, h, n } = state
    const diag = Math.hypot(w, h) || 1
    const lut = ensureLut(state)

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)

    // How far behind the front the water is still disturbed: `wake` seconds of
    // travel at the current wave speed.
    const wakeLen = Math.max(2, cfg.wake * cfg.waveSpeed * diag)
    ctx.globalCompositeOperation = cfg.blend === 'add' ? 'lighter' : 'source-over'

    for (let k = 0; k < state.rn; k++) {
      const amp = rippleAmplitude(state, k)
      if (amp <= 0) continue
      const x = state.rx[k] * w
      const y = state.ry[k] * h
      const r = state.rr[k] * diag
      if (r < 1) continue
      // Shape the falloff. A front should stay READABLE for most of its travel
      // and then vanish over the last stretch — a steeper (amp²·√amp) curve looks
      // right on paper but spends the majority of every ripple's life below the
      // visible floor, which reads as a near-empty field.
      const a = Math.pow(amp, 0.75)
      const [cr, cg, cb] = lut[toneIndex(rippleTone(state, k))]
      const rgb = `${cr},${cg},${cb}`
      const inner = Math.max(0, r - wakeLen)

      const grad = ctx.createRadialGradient(x, y, inner, x, y, r)
      grad.addColorStop(0, `rgba(${rgb},0)`)
      grad.addColorStop(0.6, `rgba(${rgb},${(a * 0.14).toFixed(4)})`)
      grad.addColorStop(1, `rgba(${rgb},${(a * 0.55).toFixed(4)})`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      if (inner > 0) ctx.arc(x, y, inner, 0, Math.PI * 2, true)
      ctx.fill()

      ctx.strokeStyle = `rgba(${rgb},1)`
      if (cfg.glow > 0) {
        // A soft bloom riding the front, wider than the front itself.
        ctx.globalAlpha = a * 0.16 * cfg.glow
        ctx.lineWidth = cfg.frontWidth + 20 * cfg.glow
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.stroke()
      }
      // The crisp outer edge — this is what makes it read as a wave front.
      ctx.globalAlpha = a
      ctx.lineWidth = cfg.frontWidth
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'

    if (cfg.nodeSize > 0) {
      // One unit-radius halo reused for every release flare this frame (scaled by
      // transform, brightness by globalAlpha) instead of a gradient per flare.
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
      halo.addColorStop(0, 'rgba(255,255,255,1)')
      halo.addColorStop(0.35, 'rgba(255,255,255,0.32)')
      halo.addColorStop(1, 'rgba(255,255,255,0)')

      const byWell = cfg.colorBy === 'well'
      for (let i = 0; i < n; i++) {
        const x = state.nx[i] * w
        const y = state.ny[i] * h
        const cap = state.cap[i]
        const fill = state.energy[i] / cap
        const flare = state.flare[i]
        // Marker size tracks capacity, so the giants are visible as giants long
        // before one of them goes off.
        const size = cfg.nodeSize * (0.55 + cap)
        const [cr, cg, cb] = lut[toneIndex(byWell ? state.tint[i] : cap)]

        ctx.fillStyle = `rgb(${cr},${cg},${cb})`
        ctx.globalAlpha = 0.14 + 0.66 * fill
        ctx.beginPath()
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill()

        if (flare > 0.02) {
          const hr = size * (3 + 9 * flare)
          ctx.save()
          ctx.translate(x, y)
          ctx.scale(hr, hr)
          ctx.globalAlpha = 0.5 * flare
          ctx.fillStyle = halo
          ctx.beginPath()
          ctx.arc(0, 0, 1, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
          ctx.globalAlpha = 0.9 * flare
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(x, y, size * (0.8 + 0.9 * flare), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
    }
  },

  resize(state, size, ctx) {
    // Wells and radii are viewport-independent (normalized / diagonal fractions),
    // so nothing regenerates — only the drawing size changes.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    // Everything except the dealt field (count, seed, layout, capacities, tempos)
    // is read live off state.cfg each frame — reach, thresholds, speed, and the
    // whole look apply without disturbing a run in progress.
    if (structuralKey(config) !== structuralKey(state.cfg)) return false
    state.cfg = config
    return true
  },
})

export default chime
