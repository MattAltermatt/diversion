import { defineDiversion } from '../../framework/types'
import { canopySchema } from './schema'
import { advance, createCanopyState, render, type CanopyState } from './canopy'
import { canopyPresets } from './presets'

const canopy = defineDiversion<typeof canopySchema, CanopyState, '2d'>({
  id: 'canopy',
  title: 'Canopy',
  description: 'Branching plants race for light, evolving toward runaway height until the cost of trunk reins them back.',
  kind: '2d',
  schema: canopySchema,

  setup(_ctx, config, size) {
    return createCanopyState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advance(state, dt)
    render(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    state.cols = Math.max(1, Math.ceil(size.width / 6))
    state.colLight = new Float32Array(state.cols)
  },

  // Only a seed change rebuilds the forest; every other knob reads live from cfg.
  update(state, config) {
    if (config.seed !== state.cfg.seed) return false
    state.cfg = config
    state.tickMs = 1000 / config.simSpeed
    return true
  },

  // Safety: if the whole forest dies out, reseed a fresh one.
  shouldRestart(state) {
    return state.plants.length === 0
  },

  presets: canopyPresets,
})

export default canopy
