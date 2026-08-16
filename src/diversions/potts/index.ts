// Potts Grain Growth — the Q-state Potts model as a model of metallurgical grain growth
// (GH #177). Each cell holds one of Q orientations; boundaries between unlike orientations
// cost energy, and a Monte-Carlo anneal lets big grains swallow small ones. The
// polycrystalline mosaic COARSENS forever — colour cells whose walls glide and straighten,
// exactly like annealing metal — reseeding once it settles into a few big grains.
import { defineDiversion } from '../../framework/types'
import { pottsSchema } from './schema'
import {
  createPottsState, advancePotts, renderPotts, resizePotts, applyColors,
  type PottsState,
} from './potts'
import { meta } from './meta'

const potts = defineDiversion<typeof pottsSchema, PottsState, '2d'>({
  ...meta,
  schema: pottsSchema,

  setup(ctx, config, size) {
    const st = createPottsState(config, size.width, size.height)
    ctx.fillStyle = '#05060a' // fixed dark ground for the very first paint before the mosaic covers it
    ctx.fillRect(0, 0, size.width, size.height)
    renderPotts(st, ctx)
    return st
  },

  frame(state, ctx, _t, _dt) {
    advancePotts(state, state.cfg.stepsPerFrame)
    if (state.needBlit) renderPotts(state, ctx)
  },

  resize(state, size) {
    resizePotts(state, size.width, size.height)
  },

  update(state, config) {
    // A different lattice resolution, orientation count, or seed wants a fresh board.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.states !== state.cfg.states) return false
    if (config.seed !== state.cfg.seed) return false
    // Everything else applies live over the CURRENT grains: temperature, speed read straight
    // off cfg next frame; colours / walls re-cache and repaint.
    const colorsChanged = config.boundary !== state.cfg.boundary
      || config.boundaryColor !== state.cfg.boundaryColor
      || config.palette.hueStart !== state.cfg.palette.hueStart
      || config.palette.hueSpan !== state.cfg.palette.hueSpan
      || config.palette.saturation !== state.cfg.palette.saturation
      || config.palette.lightness !== state.cfg.palette.lightness
    state.cfg = config
    if (colorsChanged) applyColors(state, config)
    else state.needBlit = true
    return true
  },
})

export default potts
