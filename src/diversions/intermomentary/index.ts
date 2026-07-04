// InterMomentary — equal circles are spaced evenly around one or more concentric
// rings (a circle of circles); each ring slowly rotates at its own rate and the ring
// radii breathe, so where the circle outlines cross, the crossing points trace shifting
// secondary rosettes — moire from circle intersections. Clean-room after xscreensaver
// `intermomentary` (#109, Gregory Barsamian's "Intersecting Momentary" effect).
import { defineDiversion } from '../../framework/types'
import { intermomentarySchema } from './schema'
import {
  createIMState, stepIM, drawIM, updateIMState, resizeIMState,
  type IMState,
} from './intermomentary'

const intermomentary = defineDiversion<typeof intermomentarySchema, IMState, '2d'>({
  id: 'intermomentary',
  title: 'InterMomentary',
  description: 'Rings of overlapping circles slowly rotate and breathe; their crossings '
    + 'weave shifting rosette interference patterns — moire from circle intersections.',
  kind: '2d',
  schema: intermomentarySchema,

  setup(ctx, config, size) {
    const state = createIMState(config, size.width, size.height)
    drawIM(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepIM(state, dt)
    drawIM(state, ctx)
  },

  resize(state, size, ctx) {
    resizeIMState(state, size.width, size.height)
    drawIM(state, ctx)
  },

  update(state, config, size) {
    return updateIMState(state, config, size.width, size.height)
  },
})

export default intermomentary
