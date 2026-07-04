// Wander — clean-room take on xscreensaver's "wander" (GH #79). Correlated random
// walkers weave luminous, slowly hue-shifting ribbons across the dark, growing an
// ever-larger tapestry that gently fades and reseeds. The permanent trail lives in
// its own accumulation buffer (only new segments are stamped); the background is
// composited LIVE each frame, so background/palette edits apply without losing the
// woven paths. Pure walk logic + LUT live in wander.ts (unit-tested).
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { wanderSchema, type WanderConfig } from './schema'
import {
  createWanderState, resizeWanderState, reseed, runSteps,
  buildLut, type WanderState, type Segment,
} from './wander'
import { palettePresets, motionPresets } from './presets'

interface State {
  sim: WanderState
  trail: HTMLCanvasElement       // accumulation buffer, device-pixel sized
  tctx: CanvasRenderingContext2D
  dpr: number
}

const presets: PresetGroup<WanderConfig>[] = [
  { label: 'Palette', options: palettePresets },
  { label: 'Motion', options: motionPresets },
]

function makeTrail(ctx: CanvasRenderingContext2D, dpr: number): { trail: HTMLCanvasElement; tctx: CanvasRenderingContext2D } {
  const trail = document.createElement('canvas')
  trail.width = ctx.canvas.width
  trail.height = ctx.canvas.height
  const tctx = trail.getContext('2d')!
  tctx.setTransform(dpr, 0, 0, dpr, 0, 0) // draw segments in CSS px, like the main ctx
  tctx.lineCap = 'round'
  tctx.lineJoin = 'round'
  return { trail, tctx }
}

/** Stamp one trail segment onto the accumulation buffer. Glow = a soft, same-hue
 *  wide halo under an opaque core (two-layer, source-over — hue-safe, no additive
 *  blowout at density). */
function drawSegment(tctx: CanvasRenderingContext2D, seg: Segment, lineWidth: number, glow: boolean): void {
  tctx.strokeStyle = seg.color
  if (glow) {
    tctx.globalAlpha = 0.16
    tctx.lineWidth = lineWidth * 3
    tctx.beginPath()
    tctx.moveTo(seg.x0, seg.y0)
    tctx.lineTo(seg.x1, seg.y1)
    tctx.stroke()
    tctx.globalAlpha = 1
  }
  tctx.lineWidth = lineWidth
  tctx.beginPath()
  tctx.moveTo(seg.x0, seg.y0)
  tctx.lineTo(seg.x1, seg.y1)
  tctx.stroke()
}

/** Reduce the whole buffer's alpha toward transparent (destination-out in device
 *  space). `amount` in 0..1 — dest_alpha *= (1 - amount). */
function fadeBuffer(st: State, amount: number): void {
  if (amount <= 0) return
  const { tctx, trail } = st
  tctx.save()
  tctx.setTransform(1, 0, 0, 1, 0, 0)
  tctx.globalCompositeOperation = 'destination-out'
  tctx.fillStyle = `rgba(0,0,0,${Math.min(1, amount)})`
  tctx.fillRect(0, 0, trail.width, trail.height)
  tctx.restore() // back to source-over + the dpr transform
}

function clearBuffer(st: State): void {
  st.tctx.save()
  st.tctx.setTransform(1, 0, 0, 1, 0, 0)
  st.tctx.clearRect(0, 0, st.trail.width, st.trail.height)
  st.tctx.restore()
}

/** Composite background (LIVE) + accumulation buffer onto the visible canvas. */
function composite(st: State, ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = st.sim.cfg.background
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.drawImage(st.trail, 0, 0)
  ctx.restore()
}

const wander = defineDiversion<typeof wanderSchema, State, '2d'>({
  id: 'wander',
  title: 'Wander',
  description: 'Random-walking pens weave luminous, slowly hue-shifting ribbons across the dark, '
    + 'growing an ever-larger meandering tapestry that gently fades and renews. After xscreensaver’s Wander.',
  kind: '2d',
  schema: wanderSchema,
  presets,

  setup(ctx, config, size) {
    const dpr = size.width > 0 ? ctx.canvas.width / size.width : 1
    const sim = createWanderState(config, size.width, size.height)
    const { trail, tctx } = makeTrail(ctx, dpr)
    const st: State = { sim, trail, tctx, dpr }
    composite(st, ctx) // paint the ground immediately (no first-frame flash)
    return st
  },

  frame(st, ctx, _t, dt) {
    const { sim } = st
    const cfg = sim.cfg
    if (sim.life === 'draw') {
      runSteps(sim, dt, (seg) => drawSegment(st.tctx, seg, cfg.lineWidth, cfg.glow))
      // Comet-style continuous fade so the ribbon never fully fills.
      if (cfg.trailStyle === 'fade') fadeBuffer(st, dt / 1000 / cfg.fadeTime)
    } else {
      // Accumulate lifecycle: fade the full tapestry out over fadeTime, then reseed.
      sim.fadeElapsed += dt
      fadeBuffer(st, dt / 1000 / cfg.fadeTime)
      if (sim.fadeElapsed >= cfg.fadeTime * 1000) {
        clearBuffer(st)
        reseed(sim)
      }
    }
    composite(st, ctx)
  },

  resize(st, size, ctx) {
    st.dpr = size.width > 0 ? ctx.canvas.width / size.width : 1
    st.trail.width = ctx.canvas.width   // resizing clears the buffer
    st.trail.height = ctx.canvas.height
    st.tctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0)
    st.tctx.lineCap = 'round'
    st.tctx.lineJoin = 'round'
    resizeWanderState(st.sim, size.width, size.height)
    composite(st, ctx)
  },

  update(st, config, size) {
    const prev = st.sim.cfg
    // Structural — different walker set: full re-setup (rebuilds buffer + walkers).
    if (config.walkers !== prev.walkers || config.seed !== prev.seed) return false
    st.sim.cfg = config
    if (config.colors !== prev.colors) st.sim.lut = buildLut(config.colors)
    void size
    return true
  },
})

export default wander
