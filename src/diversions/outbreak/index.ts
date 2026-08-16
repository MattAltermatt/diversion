// index.ts — framework wiring. Owns setup/frame/update/resize/teardown + the reseed
// hook; delegates the sim to sim.ts and drawing to render.ts. Fixed-steps-per-frame.
import { defineDiversion, type Size } from '../../framework/types'
import { outbreakSchema, type OutbreakConfig } from './schema'
import { outbreakPresets } from './presets'
import { createSim, stepSim, isResolved, type Ecosystem, type SimConfig } from './sim'
import { drawScene } from './render'
import { meta } from './meta'

interface State {
  sim: Ecosystem
  cfg: OutbreakConfig
  size: Size
  stepAcc: number // fractional sim-steps carried between frames (slow-mo when speed < 1)
}

const toSimConfig = (c: OutbreakConfig): SimConfig => ({
  civilianCount: c.civilianCount, fighterCount: c.fighterCount, zombieCount: c.zombieCount,
  zombieSpeed: c.zombieSpeed, humanSpeed: c.humanSpeed, civilianSight: c.civilianSight,
  seed: c.seed, arenaDensity: c.arenaDensity,
  fighterRange: c.fighterRange, fireCooldown: 1 / c.fireRate, magazine: c.magazine,
  reloadTime: c.reloadTime, bulletSpeed: c.bulletSpeed, zombieFearRadius: c.zombieFearRadius,
  enrageRadius: c.enrageRadius, enrageTime: c.enrageTime,
  panicStrength: c.panicStrength, panicRadius: c.panicRadius,
})

const outbreak = defineDiversion({
  ...meta,
  schema: outbreakSchema,
  presets: outbreakPresets,

  setup(_ctx, cfg, size): State {
    return { sim: createSim(toSimConfig(cfg)), cfg, size, stepAcc: 0 }
  },

  frame(state, ctx, _t, _dt) {
    // Accumulate fractional steps so speed < 1 slow-motions (a step every few frames)
    // while speed > 1 fast-forwards. Cap the burst so a frame hitch can't stampede.
    state.stepAcc += state.cfg.speed
    let steps = Math.floor(state.stepAcc)
    state.stepAcc -= steps
    if (steps > 8) steps = 8
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
        cfg.arenaDensity !== state.sim.cfg.arenaDensity || // rebuilds the arena
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
