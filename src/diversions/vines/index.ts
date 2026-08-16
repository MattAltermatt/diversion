import { defineDiversion, type PresetGroup } from '../../framework/types'
import { vinesSchema, type VinesConfig } from './schema'
import {
  advanceVines,
  computeView,
  createVineState,
  shouldReseed,
  updateVineState,
  type VineState,
} from './vines'
import { renderVines } from './render'
import { vinePresets, palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<VinesConfig>[] = [
  { label: 'Vine', options: vinePresets },
  { label: 'Palette', options: palettePresets },
]

const vines = defineDiversion<typeof vinesSchema, VineState, '2d'>({
  ...meta,
  schema: vinesSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createVineState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advanceVines(state, dt)
    renderVines(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    state.view = computeView(state.geo, size.width, size.height)
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateVineState(state, config)
  },

  shouldRestart(state) {
    return shouldReseed(state)
  },

  presets,
})

export default vines
