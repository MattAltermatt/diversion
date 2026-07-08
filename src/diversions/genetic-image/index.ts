import { defineDiversion } from '../../framework/types'
import { geneticImageSchema } from './schema'
import {
  createState, stepEvolution, render, applyConfig, resize as resizeState, type GeneticImageState,
} from './geneticImage'

// Roger Alsing's "evolving Mona Lisa" (#180): a handful of translucent
// polygons hill-climb toward a hidden procedural target, generation by
// generation — abstract soup resolves into a recognizable picture, then fades
// and cycles to the next built-in target so it never "finishes."
const geneticImage = defineDiversion<typeof geneticImageSchema, GeneticImageState, '2d'>({
  id: 'genetic-image',
  title: 'Genetic Image Evolution',
  description: 'Translucent polygons hill-climb toward a hidden picture, generation by generation.',
  kind: '2d',
  schema: geneticImageSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepEvolution(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    resizeState(state, size)
  },

  update(state, config) {
    return applyConfig(state, config)
  },
})

export default geneticImage
