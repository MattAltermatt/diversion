// Lockward — concentric rings of radial blades, a luminous stained-glass rose
// window / nested clockwork. Each ring is divided into an even number of equal
// blades and spins at its own seed-picked speed; neighbouring rings counter-rotate,
// so the blade boundaries sweep past each other in an interlocking churn. Colour
// drifts around the wheel; an optional soft glow blooms each blade. Clean-room take
// on xscreensaver `lockward` (GH #110).
import { defineDiversion } from '../../framework/types'
import { lockwardSchema } from './schema'
import {
  createLockwardState, stepLockward, drawLockward, updateLockward,
  type LockwardState,
} from './lockward'
import { meta } from './meta'

const lockward = defineDiversion<typeof lockwardSchema, LockwardState, '2d'>({
  ...meta,
  schema: lockwardSchema,

  setup(ctx, config, size) {
    const state = createLockwardState(config, size.width, size.height)
    drawLockward(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepLockward(state, dt)
    drawLockward(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    drawLockward(state, ctx)
  },

  update(state, config, size) {
    return updateLockward(state, config, size.width, size.height)
  },
})

export default lockward
