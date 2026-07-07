import { defineDiversion } from '../../framework/types'
import { waTorSchema, type WaTorConfig } from './schema'
import { advance, buildLut, createWaTorState, render, type WaTorState } from './waTor'
import { waTorPresets } from './presets'

// Editing any of these rebuilds the grid (its shape or its initial population);
// everything else — breed times, energy, colours, speed — applies live.
const STRUCTURAL: (keyof WaTorConfig)[] = ['gridResolution', 'initialFish', 'initialSharks', 'seed']

const waTor = defineDiversion<typeof waTorSchema, WaTorState, '2d'>({
  id: 'wa-tor',
  title: 'Wa-Tor',
  description: 'Dewdney’s predator-prey ocean: fish bloom, a shark front culls them, sharks starve back down, and the population waves roll on forever.',
  kind: '2d',
  schema: waTorSchema,

  setup(_ctx, config, size) {
    return createWaTorState(config, size.width, size.height)
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
    state.lut = buildLut(config)
    state.dirty = true // colours may have changed → repaint the field next render
    return true
  },

  // Screensaver safety: Wa-Tor commonly collapses to one extinction or the other
  // (sharks all die out and fish fill the grid, or fish run out and sharks starve).
  // Either way, reseed a fresh world rather than sit on a dead ocean.
  shouldRestart(state) {
    return state.fishCount === 0 || state.sharkCount === 0
  },

  presets: waTorPresets,
})

export default waTor
