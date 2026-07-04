import { defineDiversion } from '../../framework/types'
import { tourSchema, type TourConfig } from './schema'
import { advance, createTourState, type TourState } from './tour'
import { render } from './render'

// Editing any of these rebuilds the cities + tour; everything else — solver mode,
// speed, hold, colours — applies live to the running solve.
const STRUCTURAL: (keyof TourConfig)[] = ['cityCount', 'cityLayout', 'seed']

const tour = defineDiversion<typeof tourSchema, TourState, '2d'>({
  id: 'tour',
  title: 'Tour',
  description: 'A travelling salesman untangles his route: a chaotic web of crossing lines through '
    + 'scattered cities straightens, edge by edge, into an elegant crossing-free loop — then fresh '
    + 'cities scatter and it begins again.',
  kind: '2d',
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
