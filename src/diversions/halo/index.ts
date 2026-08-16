// Halo — several ring-emitters at slowly drifting centers each draw a static
// family of evenly-spaced concentric circle outlines; where the families overlap,
// the near-equal spacings beat into moire fringe rosettes that breathe as the
// centers wander. Faithful to xscreensaver `halo` (#80); spectrum (luminous) and
// mono (XOR-fringe) modes.
import { defineDiversion } from '../../framework/types'
import { haloSchema } from './schema'
import {
  createHaloState, stepHalo, drawHalo, updateHaloState, resizeHaloState,
  type HaloState,
} from './halo'
import { meta } from './meta'

const halo = defineDiversion<typeof haloSchema, HaloState, '2d'>({
  ...meta,
  schema: haloSchema,

  setup(ctx, config, size) {
    const state = createHaloState(config, size.width, size.height)
    drawHalo(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepHalo(state, dt)
    drawHalo(state, ctx)
  },

  resize(state, size, ctx) {
    resizeHaloState(state, size.width, size.height)
    drawHalo(state, ctx)
  },

  update(state, config, size) {
    return updateHaloState(state, config, size.width, size.height)
  },
})

export default halo
