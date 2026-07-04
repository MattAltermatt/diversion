import { defineDiversion, type PresetGroup } from '../../framework/types'
import { forestSchema, type ForestConfig } from './schema'
import {
  advanceForest,
  createForestState,
  shouldReseed,
  updateForestState,
  type ForestState,
} from './forest'
import { renderForest } from './render'
import { seasonPresets, grovePresets } from './presets'

const presets: PresetGroup<ForestConfig>[] = [
  { label: 'Season', options: seasonPresets },
  { label: 'Grove', options: grovePresets },
]

const forest = defineDiversion<typeof forestSchema, ForestState, '2d'>({
  id: 'forest',
  title: 'Forest',
  description: 'A grove of recursive fractal trees sprouting across a misty ground, then fading to regrow.',
  kind: '2d',
  schema: forestSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createForestState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advanceForest(state, dt)
    renderForest(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateForestState(state, config)
  },

  shouldRestart(state) {
    return shouldReseed(state)
  },

  presets,
})

export default forest
