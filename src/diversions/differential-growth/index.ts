import { defineDiversion, type PresetGroup } from '../../framework/types'
import { differentialGrowthSchema, type DifferentialGrowthConfig } from './schema'
import { advanceGrowth, createGrowthState, updateGrowthState, updateView, type GrowthState } from './growth'
import { renderGrowth } from './render'
import { growthPresets, stylePresets } from './presets'
import { meta } from './meta'

// After the curve fills to the node cap it keeps gently breathing; once it has
// settled this long the piece fades and re-grows a fresh seeded world — the right
// unattended-screensaver loop (never a frozen dead frame).
const SETTLE_HOLD_MS = 14000

const presets: PresetGroup<DifferentialGrowthConfig>[] = [
  { label: 'Growth', options: growthPresets },
  { label: 'Style', options: stylePresets },
]

const differentialGrowth = defineDiversion<typeof differentialGrowthSchema, GrowthState, '2d'>({
  ...meta,
  schema: differentialGrowthSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createGrowthState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    advanceGrowth(state, dt)
    updateView(state, dt)
    renderGrowth(state, ctx)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateGrowthState(state, config)
  },

  shouldRestart(state) {
    return state.settledMs >= SETTLE_HOLD_MS
  },

  presets,
})

export default differentialGrowth
