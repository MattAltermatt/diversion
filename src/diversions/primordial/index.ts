// index.ts — framework wiring for the Primordial Particle System. Owns setup/frame/
// update/resize/teardown; the motion law lives in pps.ts and drawing in render.ts.
import { defineDiversion, type Size } from '../../framework/types'
import { primordialSchema, toPPSConfig, type PrimordialConfig } from './schema'
import { createSystem, stepSystem, type PPSystem } from './pps'
import { makeRenderState, buildLut, drawSystem, type RenderState } from './render'
import { meta } from './meta'

interface State {
  sys: PPSystem
  rs: RenderState
  cfg: PrimordialConfig
  size: Size
}

// Particle count, sense radius, and the seed rebuild the world (array sizes / grid
// geometry / seeded init). Everything else — angles, step size, colours, look — is live.
const STRUCTURAL: (keyof PrimordialConfig)[] = ['particleCount', 'radius', 'seed']

const primordial = defineDiversion<typeof primordialSchema, State, '2d'>({
  ...meta,
  schema: primordialSchema,

  setup(_ctx, cfg, size): State {
    const sys = createSystem(toPPSConfig(cfg))
    return { sys, rs: makeRenderState(cfg, sys.n), cfg, size }
  },

  frame(state, ctx, _t, _dt) {
    const steps = Math.max(1, state.cfg.stepsPerFrame)
    for (let i = 0; i < steps; i++) stepSystem(state.sys)
    drawSystem(ctx as CanvasRenderingContext2D, state.sys, state.cfg, state.size.width, state.size.height, state.rs)
  },

  resize(state, size) {
    state.size = size // world is a fixed torus; render recomputes the cover-fit
  },

  update(state, cfg, size): boolean {
    for (const k of STRUCTURAL) {
      if (cfg[k] !== state.cfg[k]) return false // rebuild via setup()
    }
    // live params: angles + step size feed the sim; colours feed the LUT
    const p = toPPSConfig(cfg)
    state.sys.alpha = p.alpha
    state.sys.beta = p.beta
    state.sys.velocity = p.velocity
    state.cfg = cfg
    state.size = size
    buildLut(state.rs, cfg)
    return true
  },

  teardown(state) {
    // release the typed arrays for GC (nothing GPU in 2D)
    ;(state as unknown as { sys: null }).sys = null
  },
})

export default primordial
