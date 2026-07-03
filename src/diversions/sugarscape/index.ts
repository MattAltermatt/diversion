import { defineDiversion } from '../../framework/types'
import { sugarscapeSchema, type SugarscapeConfig } from './schema'
import { advance, buildFieldLut, createSugarState, render, type SugarState } from './sugarscape'
import { sugarPresets } from './presets'

// Editing any of these re-seeds the world (grid shape or the agent trait pool);
// everything else applies live.
const STRUCTURAL: (keyof SugarscapeConfig)[] = ['gridResolution', 'agentCount', 'visionMax', 'metabolismMax', 'seed']

const sugarscape = defineDiversion<typeof sugarscapeSchema, SugarState, '2d'>({
  id: 'sugarscape',
  title: 'Sugarscape',
  description: 'An agent economy: harvesters stream to two sugar mountains, and migration, boom-bust, and inequality emerge.',
  kind: '2d',
  schema: sugarscapeSchema,

  setup(_ctx, config, size) {
    return createSugarState(config, size.width, size.height)
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
    state.fieldLut = buildFieldLut(config)
    return true
  },

  // Screensaver safety: if the population collapses, reseed a fresh world.
  shouldRestart(state) {
    return state.agents.length <= 3
  },

  presets: sugarPresets,
})

export default sugarscape
