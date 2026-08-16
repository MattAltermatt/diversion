import { defineDiversion } from '../../framework/types'
import { camouflageSchema, type CamouflageConfig } from './schema'
import { advance, createCamouflageState, render, type CamouflageState } from './camouflage'
import { camouflagePresets } from './presets'
import { meta } from './meta'

// The habitat (background/pattern/seed) and the population size rebuild the world;
// predator pressure, mutation, flutter, colours, and speed apply live.
const STRUCTURAL: (keyof CamouflageConfig)[] = ['background', 'patternScale', 'mothCount', 'seed']

const camouflage = defineDiversion<typeof camouflageSchema, CamouflageState, '2d'>({
  ...meta,
  schema: camouflageSchema,

  setup(_ctx, config, size) {
    return createCamouflageState(config, size.width, size.height)
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
    return true
  },

  presets: camouflagePresets,
})

export default camouflage
