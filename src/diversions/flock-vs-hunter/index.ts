// index.ts — framework wiring. Owns setup/frame/update/resize/teardown; delegates
// the sim to sim.ts and drawing to render.ts. Fixed-steps-per-frame (dt ignored).
import { defineDiversion, type Size } from '../../framework/types'
import { flockVsHunterSchema, type FlockVsHunterConfig } from './schema'
import { flockVsHunterPresets } from './presets'
import { createSim, stepSim, type Ecosystem, type SimConfig } from './sim'
import { drawScene } from './render'
import { meta } from './meta'

interface State {
  sim: Ecosystem
  cfg: FlockVsHunterConfig
  size: Size
}

const toSimConfig = (c: FlockVsHunterConfig): SimConfig => ({
  boidCount: c.boidCount, predatorCount: c.predatorCount, seed: c.seed,
  roundLength: c.roundLength, flockMutationRate: c.flockMutationRate,
  predMutationRate: c.predMutationRate, flockElites: c.flockElites,
  predElites: c.predElites, immigrateEvery: c.immigrateEvery, seasons: c.seasons,
})

const flockVsHunter = defineDiversion({
  ...meta,
  schema: flockVsHunterSchema,
  presets: flockVsHunterPresets,

  setup(_ctx, cfg, size): State {
    return { sim: createSim(toSimConfig(cfg)), cfg, size }
  },

  frame(state, ctx, _t, _dt) {
    const steps = Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepSim(state.sim)
    drawScene(ctx as CanvasRenderingContext2D, state.sim, state.cfg, state.size)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit from size
  },

  update(state, cfg, size): boolean {
    // structural → false (re-setup rebuilds arrays/streams)
    if (cfg.boidCount !== state.sim.cfg.boidCount ||
        cfg.predatorCount !== state.sim.cfg.predatorCount ||
        cfg.seed !== state.sim.cfg.seed) return false
    // live: swap cfg (visual + evolutionary knobs apply at the next breed)
    state.cfg = cfg
    state.size = size
    Object.assign(state.sim.cfg, toSimConfig(cfg))
    return true
  },

  teardown(state) {
    // release the large SoA arrays for GC (nothing GPU in 2D)
    ;(state as unknown as { sim: null }).sim = null
  },
})

export default flockVsHunter
