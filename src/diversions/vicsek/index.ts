// index.ts — framework wiring. Owns setup/frame/update/teardown; delegates the sim
// to sim.ts and drawing to render.ts. Fixed-steps-per-frame (dt ignored, like
// flock-vs-hunter — a deterministic-feeling sim, not a real-time-accurate one).
import { defineDiversion, type Size } from '../../framework/types'
import { vicsekSchema, type VicsekConfig } from './schema'
import { vicsekPresets } from './presets'
import { createFlock, stepFlock, type Flock, type SimConfig } from './sim'
import { drawScene, buildHueLUT } from './render'

interface State {
  sim: Flock
  cfg: VicsekConfig
  size: Size
  lut: string[]
}

const toSimConfig = (c: VicsekConfig): SimConfig => ({
  particleCount: c.particleCount, neighborRadius: c.neighborRadius, worldSize: c.worldSize,
  seed: c.seed, noise: c.noise, speed: c.speed,
})

const vicsek = defineDiversion({
  id: 'vicsek',
  title: 'Vicsek Flock',
  description: 'Self-propelled particles that just steer toward their neighbours’ average '
    + 'heading, plus a little noise. Turn the noise down and a directionless swarm '
    + 'spontaneously condenses into one coherent flock — the phase transition that started '
    + 'the whole field of collective motion.',
  kind: '2d',
  schema: vicsekSchema,
  presets: vicsekPresets,

  setup(_ctx, cfg, size): State {
    return { sim: createFlock(toSimConfig(cfg)), cfg, size, lut: buildHueLUT(cfg.palette) }
  },

  frame(state, ctx, _t, _dt) {
    stepFlock(state.sim)
    drawScene(ctx as CanvasRenderingContext2D, state.sim, state.cfg, state.size, state.lut)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit from size
  },

  update(state, cfg, size): boolean {
    // structural (rebuilds the spatial hash / particle arrays / RNG stream) → false
    if (cfg.particleCount !== state.sim.cfg.particleCount ||
        cfg.neighborRadius !== state.sim.cfg.neighborRadius ||
        cfg.worldSize !== state.sim.cfg.worldSize ||
        cfg.seed !== state.sim.cfg.seed) return false
    // live: noise/speed apply next tick, palette/background/HUD apply next draw
    if (cfg.palette !== state.cfg.palette) state.lut = buildHueLUT(cfg.palette)
    state.cfg = cfg
    state.size = size
    Object.assign(state.sim.cfg, toSimConfig(cfg))
    return true
  },

  teardown(state) {
    // release the SoA arrays for GC (nothing GPU in 2D)
    ;(state as unknown as { sim: null }).sim = null
  },
})

export default vicsek
