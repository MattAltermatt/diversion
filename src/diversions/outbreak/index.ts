// index.ts — framework wiring. Owns setup/frame/update/resize/teardown + the reseed
// hook; delegates the sim to sim.ts and drawing to render.ts. Fixed-steps-per-frame.
import { defineDiversion, type Size } from '../../framework/types'
import { outbreakSchema, type OutbreakConfig } from './schema'
import { createSim, stepSim, isResolved, type Ecosystem, type SimConfig } from './sim'
import { drawScene } from './render'

interface State {
  sim: Ecosystem
  cfg: OutbreakConfig
  size: Size
}

const toSimConfig = (c: OutbreakConfig): SimConfig => ({
  civilianCount: c.civilianCount, fighterCount: c.fighterCount, zombieCount: c.zombieCount,
  zombieSpeed: c.zombieSpeed, humanSpeed: c.humanSpeed, seed: c.seed,
})

const outbreak = defineDiversion({
  id: 'outbreak',
  title: 'Outbreak',
  description: 'A three-faction arena: fighters recruit and the horde bites, both draining a crowd of civilians. Watch who wins — then it reseeds into a fresh outbreak.',
  kind: '2d',
  schema: outbreakSchema,

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
    // structural → false (re-setup rebuilds the population)
    if (cfg.civilianCount !== state.sim.cfg.civilianCount ||
        cfg.fighterCount !== state.sim.cfg.fighterCount ||
        cfg.zombieCount !== state.sim.cfg.zombieCount ||
        cfg.seed !== state.sim.cfg.seed) return false
    // live: speeds + look apply without reallocating the population
    state.cfg = cfg
    state.size = size
    Object.assign(state.sim.cfg, toSimConfig(cfg))
    return true
  },

  shouldRestart(state): boolean {
    // terminal (one side wiped) or settled (no conversions for a while) → fresh outbreak
    return isResolved(state.sim)
  },

  teardown(state) {
    ;(state as unknown as { sim: null }).sim = null
  },
})

export default outbreak
