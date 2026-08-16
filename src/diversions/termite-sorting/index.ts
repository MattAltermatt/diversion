import { defineDiversion } from '../../framework/types'
import { termiteSortingSchema, type TermiteSortingConfig } from './schema'
import { advance, createTermiteState, render, type TermiteState } from './termites'
import { termitePresets } from './presets'
import { meta } from './meta'

// Editing any of these re-scatters the world; everything else applies live.
const STRUCTURAL: (keyof TermiteSortingConfig)[] = ['gridResolution', 'chipDensity', 'colorCount', 'termiteCount', 'seed']

const termiteSorting = defineDiversion<typeof termiteSortingSchema, TermiteState, '2d'>({
  ...meta,
  schema: termiteSortingSchema,

  setup(_ctx, config, size) {
    return createTermiteState(config, size.width, size.height)
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
    state.dirty = true // colors may have changed → repaint the field next render
    return true
  },

  // Once the mess is sorted and stops improving, scatter a fresh one.
  shouldRestart(state) {
    return state.wantReseed
  },

  presets: termitePresets,
})

export default termiteSorting
