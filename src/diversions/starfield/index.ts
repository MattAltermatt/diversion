import { defineDiversion } from '../../framework/types'
import { toHex2 } from '../../framework/gradient'
import { rgba } from '../../framework/color'
import { starfieldSchema } from './schema'
import { createStarfieldState, stepFrame, type StarfieldState } from './starfield'
import { meta } from './meta'

const starfield = defineDiversion<typeof starfieldSchema, StarfieldState, '2d'>({
  ...meta,
  schema: starfieldSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createStarfieldState(config, size.width, size.height)
  },

  update(state, config, size) {
    // structural changes (star count, seed) → full re-setup
    if (config.starCount !== state.cfg.starCount || config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.w = size.width
    state.h = size.height
    return true
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // resizing the canvas wipes the backing store — repaint the bg so it doesn't
    // flash the page colour before the trail buffer rebuilds.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    const { cfg, w, h } = state

    // 1. persistence wash: fade the previous frame toward the background. Low
    //    trailFade wipes near-clean (crisp dots); high leaves long smeared streaks.
    ctx.globalCompositeOperation = 'source-over'
    const fadeAlpha = Math.max(0.04, 1 - cfg.trailFade)
    ctx.fillStyle = `${cfg.background}${toHex2(fadeAlpha)}`
    ctx.fillRect(0, 0, w, h)

    // 2. advance the sim (fly forward, respawn, reproject)
    stepFrame(state, dt)

    // 3. draw each star as a streak from its previous head to its current head.
    //    A round-cap line is a dot at drift speed and a stretched trail at warp.
    ctx.lineCap = 'round'
    const glow = cfg.glow
    for (const s of state.stars) {
      const a = s.bright
      if (a <= 0.01) continue
      if (glow) {
        // opaque-free soft halo (source-over, low alpha) — no additive blow-out
        ctx.fillStyle = rgba(s.col, (a * 0.14).toFixed(3))
        ctx.beginPath()
        ctx.arc(s.sx, s.sy, s.r * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.strokeStyle = rgba(s.col, a.toFixed(3))
      ctx.lineWidth = s.r
      ctx.beginPath()
      ctx.moveTo(s.px, s.py)
      ctx.lineTo(s.sx, s.sy)
      ctx.stroke()
    }
  },
})

export default starfield
