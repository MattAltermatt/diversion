import { defineDiversion } from '../../framework/types'
import { cyclicDominanceSchema, type CyclicDominanceConfig } from './schema'
import { advance, buildLut, buildRates, createState, render, type CDState } from './cyclicDominance'
import { cyclicDominancePresets } from './presets'
import { meta } from './meta'

// Editing the grid shape or the seed re-lays the world; everything else
// (rates, colours, speed) applies live.
const STRUCTURAL: (keyof CyclicDominanceConfig)[] = ['gridResolution', 'seed']

const cyclicDominance = defineDiversion<typeof cyclicDominanceSchema, CDState, '2d'>({
  ...meta,
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
    state.dirty = true // colour/rate edits must repaint the field even if the sim is paused
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
