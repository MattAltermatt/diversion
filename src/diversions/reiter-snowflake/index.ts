import { defineDiversion, type PresetGroup } from '../../framework/types'
import { reiterSnowflakeSchema, type ReiterSnowflakeConfig } from './schema'
import {
  createSnowState, stepSnow, tickLifecycle, renderSnow, applyColors, displayCell,
  type SnowState,
} from './snowflake'
import { morphologyPresets, colorPresets } from './presets'

const MAX_STEPS_PER_FRAME = 12

const presets: PresetGroup<ReiterSnowflakeConfig>[] = [
  { label: 'Morphology', options: morphologyPresets },
  { label: 'Color', options: colorPresets },
]

const reiterSnowflake = defineDiversion<typeof reiterSnowflakeSchema, SnowState, '2d'>({
  id: 'reiter-snowflake',
  title: 'Snowflake',
  description: 'A single frozen speck grows a six-fold ice crystal by Clifford Reiter’s snow-growth rule — vapor diffuses in from the air and freezes onto the tips, sculpting dendrites, ferns, and plates that are each unique, then melts and grows anew.',
  kind: '2d',
  schema: reiterSnowflakeSchema,
  presets,

  setup(ctx, config, size) {
    const st = createSnowState(config, size.width, size.height)
    renderSnow(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    if (state.phase === 'grow') {
      state.stepAcc += state.cfg.speed * (dt / 16.6667)
      let steps = Math.floor(state.stepAcc)
      state.stepAcc -= steps
      if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME
      for (let k = 0; k < steps; k++) stepSnow(state)
    }
    tickLifecycle(state, dt)
    if (state.needBlit) renderSnow(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    state.cell = displayCell(state.N, size.width, size.height)
    state.needBlit = true
  },

  update(state, config) {
    // The crystal's shape is fixed at seed time by its parameters + grid, so those
    // changes grow a fresh flake; speed/hold read live; a color change re-bakes.
    if (config.detail !== state.cfg.detail) return false
    if (config.seed !== state.cfg.seed) return false
    if (config.spread !== state.cfg.spread) return false
    if (config.humidity !== state.cfg.humidity) return false
    if (config.sharpness !== state.cfg.sharpness) return false
    if (config.stops.join() !== state.cfg.stops.join()) applyColors(state, config.stops)
    state.cfg = config
    return true
  },
})

export default reiterSnowflake
