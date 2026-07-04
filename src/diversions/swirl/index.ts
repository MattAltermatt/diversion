// Swirl — luminous spiral knots. A handful of spiral SOURCES, each at its own slowly
// wandering centre, fan out many fine spiral arms (logarithmic or Archimedean) that
// wind from centre to rim and overlap their neighbours' arms. The filaments glow —
// a soft halo under a bright core, drawn additively over a dark ground — and their
// hue slides centre→rim, so the crossings light up into a swirling, marbled,
// nebula-like tapestry. The whole field rotates and the centres drift, churning the
// knots forever; a long, crossfaded reseed refreshes the arrangement. Clean-room
// take on xscreensaver `swirl` (#95).
import { defineDiversion } from '../../framework/types'
import { swirlSchema } from './schema'
import {
  createSwirlState, stepSwirl, drawSwirl,
  updateSwirlState, resizeSwirlState,
  type SwirlState,
} from './swirl'

const swirl = defineDiversion<typeof swirlSchema, SwirlState, '2d'>({
  id: 'swirl',
  title: 'Swirl',
  description: 'Luminous spiral knots — many fine spiral arms from a few drifting '
    + 'centres interweave into a slowly swirling, marbled nebula of jewel colour.',
  kind: '2d',
  schema: swirlSchema,

  setup(ctx, config, size) {
    const state = createSwirlState(config, size.width, size.height)
    drawSwirl(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepSwirl(state, dt)
    drawSwirl(state, ctx)
  },

  resize(state, size, ctx) {
    resizeSwirlState(state, size.width, size.height)
    drawSwirl(state, ctx)
  },

  update(state, config, size) {
    return updateSwirlState(state, config, size.width, size.height)
  },
})

export default swirl
