// index.ts — framework wiring. Owns setup/frame/update/resize; delegates the sim
// to sim.ts and drawing to render.ts.
import { defineDiversion, type Size } from '../../framework/types'
import { boidsSchema, type BoidsConfig } from './schema'
import { boidsPresets } from './presets'
import { createFlock, stepFlock, type Flock } from './sim'
import { drawScene } from './render'
import { meta } from './meta'

interface State {
  flock: Flock
  cfg: BoidsConfig
  size: Size
}

const boids = defineDiversion({
  ...meta,
  schema: boidsSchema,
  presets: boidsPresets,

  setup(_ctx, cfg, size): State {
    return { flock: createFlock(cfg), cfg, size }
  },

  frame(state, ctx, _t, dt) {
    // Clamp a huge dt (tab backgrounded then resumed) so the flock doesn't fling
    // itself across the screen in one giant step.
    const dtSeconds = Math.min(dt, 100) / 1000
    stepFlock(state.flock, dtSeconds)
    drawScene(ctx as CanvasRenderingContext2D, state.flock, state.cfg, state.size)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit from size
  },

  update(state, cfg, size): boolean {
    // structural → false (re-setup rebuilds the SoA arrays + spatial hash sizing)
    if (cfg.count !== state.flock.cfg.count || cfg.seed !== state.flock.cfg.seed) return false
    // live: weights/perception/maxSpeed/edgeMode/predator/color/trail all apply
    // by swapping cfg — the spatial hash's own grid geometry re-`configure`s
    // itself lazily inside stepFlock when perception/edgeMode actually changed.
    state.cfg = cfg
    state.size = size
    state.flock.cfg = cfg
    return true
  },
})

export default boids
