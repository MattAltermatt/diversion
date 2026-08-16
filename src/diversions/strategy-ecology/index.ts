import { defineDiversion } from '../../framework/types'
import { strategyEcologySchema, type StrategyEcologyConfig } from './schema'
import { advance, buildLut, buildTable, createStrategyState, render, type StrategyState } from './strategyEcology'
import { strategyPresets } from './presets'
import { meta } from './meta'

// Editing any of these rebuilds the grid (its shape or its initial layout);
// everything else — payoffs, colours, speed — applies live.
const STRUCTURAL: (keyof StrategyEcologyConfig)[] = ['gridResolution', 'seedPattern', 'strategySet', 'seed']

const strategyEcology = defineDiversion<typeof strategyEcologySchema, StrategyState, '2d'>({
  ...meta,
  schema: strategyEcologySchema,

  setup(_ctx, config, size) {
    return createStrategyState(config, size.width, size.height)
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
    state.table = buildTable(config)
    state.lut = buildLut(config)
    return true
  },

  // If the world all but freezes for a while, reseed a fresh one.
  shouldRestart(state) {
    return state.quietStreak > 40
  },

  presets: strategyPresets,
})

export default strategyEcology
