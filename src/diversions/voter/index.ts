// Voter Model — Opinion Dynamics (GH #185). A lattice of cells each holds one of k
// discrete opinions; every step a random cell simply COPIES a random neighbour's
// opinion. Pure imitation — no energy, no surface tension, which is what makes this
// distinct from Ising/Potts (#146/#177). That alone is enough for domains of like
// opinion to coarsen: boundaries do an unbiased random walk, merging and shrinking,
// until a finite lattice drifts to full consensus — then it reseeds forever.
import { defineDiversion } from '../../framework/types'
import { voterSchema } from './schema'
import {
  createVoterState, advanceVoter, renderVoter, resizeVoter, applyColors, setNeighborhood,
  type VoterState,
} from './voter'
import { palettePresets } from './presets'
import { meta } from './meta'

const voter = defineDiversion<typeof voterSchema, VoterState, '2d'>({
  ...meta,
  schema: voterSchema,

  presets: [
    { label: 'Palette', options: palettePresets },
  ],

  setup(ctx, config, size) {
    const st = createVoterState(config, size.width, size.height)
    ctx.fillStyle = '#05060a' // fixed dark ground for the very first paint before the field covers it
    ctx.fillRect(0, 0, size.width, size.height)
    renderVoter(st, ctx)
    return st
  },

  frame(state, ctx, _t, _dt) {
    advanceVoter(state, state.cfg.stepsPerFrame)
    if (state.needBlit) renderVoter(state, ctx)
  },

  resize(state, size) {
    resizeVoter(state, size.width, size.height)
  },

  update(state, config) {
    // A different lattice resolution, opinion count, or seed wants a fresh board.
    if (config.cellSize !== state.cfg.cellSize) return false
    if (config.palette.length !== state.cfg.palette.length) return false
    if (config.seed !== state.cfg.seed) return false
    // Everything else applies live: neighbourhood/speed/noise read straight off cfg next
    // sweep, colours re-cache and repaint over the CURRENT domains.
    const neighborhoodChanged = config.neighborhood !== state.cfg.neighborhood
    const colorsChanged = config.palette.some((hex, i) => hex !== state.cfg.palette[i])
    state.cfg = config
    if (neighborhoodChanged) setNeighborhood(state, config.neighborhood)
    if (colorsChanged) applyColors(state, config)
    else state.needBlit = true
    return true
  },
})

export default voter
