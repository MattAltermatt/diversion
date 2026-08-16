// Pinion — a connected train of meshing gears (xscreensaver `pinion` / `gears`, GH
// #113). The train is grown deterministically from the seed: each new gear meshes
// with one already placed — centre distance = the sum of pitch radii, tooth count
// sets the gear ratio, and the phase is solved so a tooth of one drops into a gap of
// the other. Meshing gears turn in OPPOSITE directions at speeds inversely
// proportional to tooth count (ω₁·T₁ = −ω₂·T₂), so the whole clockwork stays in
// perfect mesh forever. Brass / jewel / steel wheels of many sizes fill the screen.
import { defineDiversion } from '../../framework/types'
import { pinionSchema } from './schema'
import {
  createPinionState, stepPinion, drawPinion, updatePinion, type PinionState,
} from './pinion'
import { meta } from './meta'

const pinion = defineDiversion<typeof pinionSchema, PinionState, '2d'>({
  ...meta,
  schema: pinionSchema,

  setup(ctx, config, size) {
    const state = createPinionState(config, size.width, size.height)
    drawPinion(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepPinion(state, dt)
    drawPinion(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    drawPinion(state, ctx)
  },

  update(state, config, size) {
    return updatePinion(state, config, size.width, size.height)
  },
})

export default pinion
