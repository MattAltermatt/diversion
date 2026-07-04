// Hypnowheel — several superimposed layers of the same M-arm spiral wheel, each
// rotated a little past the last and spinning at a slightly different rate. The
// near-identical layers beat into a hypnotic spiral moire that churns and breathes
// forever. Clean-room take on xscreensaver `hypnowheel` (#87); duotone (XOR fringe)
// and spectrum (luminous) modes.
import { defineDiversion } from '../../framework/types'
import { hypnowheelSchema } from './schema'
import {
  createHypnowheelState, stepHypnowheel, drawHypnowheel,
  updateHypnowheelState, resizeHypnowheelState,
  type HypnowheelState,
} from './hypnowheel'

const hypnowheel = defineDiversion<typeof hypnowheelSchema, HypnowheelState, '2d'>({
  id: 'hypnowheel',
  title: 'Hypnowheel',
  description: 'Superimposed spiral-arm wheels rotate at slightly different rates and '
    + 'beat into a hypnotic spiral moire — duotone XOR fringe, or luminous spectrum.',
  kind: '2d',
  schema: hypnowheelSchema,

  setup(ctx, config, size) {
    const state = createHypnowheelState(config, size.width, size.height)
    drawHypnowheel(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepHypnowheel(state, dt)
    drawHypnowheel(state, ctx)
  },

  resize(state, size, ctx) {
    resizeHypnowheelState(state, size.width, size.height)
    drawHypnowheel(state, ctx)
  },

  update(state, config, size) {
    return updateHypnowheelState(state, config, size.width, size.height)
  },
})

export default hypnowheel
