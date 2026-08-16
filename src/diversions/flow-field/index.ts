import { defineDiversion, type PresetGroup } from '../../framework/types'
import { flowFieldSchema, type FlowFieldConfig } from './schema'
import { createFlowState, stepFlow, updateFlowState, type FlowState } from './flowField'
import { flowPresets, colorPresets } from './presets'
import { meta } from './meta'

// Two independent preset axes. A Flow option patches the motion fields; a Color
// option patches background + blend + the whole color group. Seed is excluded
// from Flow on purpose — the 🎲 dice stays independent of the chosen motion.
const presets: PresetGroup<FlowFieldConfig>[] = [
  { label: 'Flow', options: flowPresets.map((p) => ({ name: p.name, patch: p.flow })) },
  {
    label: 'Palette',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]

// Typed as Diversion<Config, State, '2d'> so the framework threads FlowState and
// a CanvasRenderingContext2D through every hook — no `as` casts needed.
const flowField = defineDiversion<typeof flowFieldSchema, FlowState, '2d'>({
  ...meta,
  schema: flowFieldSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createFlowState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepFlow(state, ctx, dt)
  },

  resize(state, size, ctx) {
    state.w = size.width
    state.h = size.height
    // Setting canvas dims wipes the backing store; repaint the bg so the
    // newly-sized canvas doesn't flash the page colour before trails rebuild.
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config) {
    return updateFlowState(state, config)
  },

  presets,
})

export default flowField
