// Forest Fire — the Drossel–Schwabl self-organized-criticality automaton. A lush
// forest perpetually regrows; rare lightning sparks fire fronts that sweep outward
// in bursts of every scale, leaving glowing embers that fade to burnt ground and
// green over again. It never settles (SOC), so it needs no reseed.
import { defineDiversion } from '../../framework/types'
import { forestFireSchema } from './schema'
import {
  createForestFireState, stepForestFire, renderForestFire, resizeForestFire, applyColors,
  type ForestFireState,
} from './forestFire'
import { meta } from './meta'

const MAX_STEPS_PER_FRAME = 4 // post-stall cap so a dt spike can't jank

const forestFire = defineDiversion<typeof forestFireSchema, ForestFireState, '2d'>({
  ...meta,
  schema: forestFireSchema,

  setup(ctx, config, size) {
    const st = createForestFireState(config, size.width, size.height)
    renderForestFire(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.stepAcc += state.cfg.speed * (dt / 1000)
    let steps = Math.floor(state.stepAcc)
    state.stepAcc -= steps
    if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
    for (let s = 0; s < steps; s++) stepForestFire(state)
    if (state.needBlit) renderForestFire(state, ctx)
  },

  resize(state, size) {
    resizeForestFire(state, size.width, size.height)
  },

  update(state, config) {
    // Grid geometry, seed, and initial density want a fresh forest → full re-setup.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.initialDensity !== state.cfg.initialDensity) return false
    // growth / lightning / speed read live; colours + ember length re-bake the LUTs.
    const recolor =
      config.ground !== state.cfg.ground ||
      config.tree !== state.cfg.tree ||
      config.fire !== state.cfg.fire ||
      config.emberLife !== state.cfg.emberLife
    state.cfg = config
    if (recolor) applyColors(state)
    return true
  },
})

export default forestFire
