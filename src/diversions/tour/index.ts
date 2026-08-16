import { defineDiversion } from '../../framework/types'
import { tourSchema, type TourConfig } from './schema'
import { advance, createTourState, type TourState } from './tour'
import { render } from './render'
import { meta } from './meta'

// Editing any of these rebuilds the cities + tour; everything else — solver mode,
// speed, hold, colours — applies live to the running solve.
const STRUCTURAL: (keyof TourConfig)[] = ['cityCount', 'cityLayout', 'seed']

const tour = defineDiversion<typeof tourSchema, TourState, '2d'>({
  ...meta,
  schema: tourSchema,

  setup(_ctx, config, size) {
    return createTourState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    for (const k of STRUCTURAL) {
      if (config[k] !== state.cfg[k]) return false
    }
    state.cfg = config
    return true
  },
})

export default tour
