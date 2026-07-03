import { defineDiversion } from '../../framework/types'
import { cyclicDominanceSchema, type CyclicDominanceConfig } from './schema'
import { advance, buildLut, buildRates, createState, render, type CDState } from './cyclicDominance'
import { cyclicDominancePresets } from './presets'

// Editing the grid shape or the seed re-lays the world; everything else
// (rates, colours, speed) applies live.
const STRUCTURAL: (keyof CyclicDominanceConfig)[] = ['gridResolution', 'seed']

const cyclicDominance = defineDiversion<typeof cyclicDominanceSchema, CDState, '2d'>({
  id: 'cyclic-dominance',
  title: 'Cyclic Dominance',
  description: 'Spatial rock-paper-scissors on a lattice — three species chase each other in an endless loop, churning into large, slowly-curling wavefronts of coexistence that never settle.',
  kind: '2d',
  schema: cyclicDominanceSchema,

  setup(_ctx, config, size) {
    return createState(config, size.width, size.height)
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
    state.tickMs = 1000 / config.simSpeed
    state.thresh = buildRates(config)
    state.lut = buildLut(config)
    return true
  },

  // The cyclic system can collapse to a single survivor once a species goes
  // extinct — an absorbing state (nothing left to reproduce it back) that
  // only decays toward uniformity from there. Reseed a fresh world instead.
  shouldRestart(state) {
    return state.extinctStreak > 5
  },

  presets: cyclicDominancePresets,
})

export default cyclicDominance
