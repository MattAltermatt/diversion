import type { Diversion, PresetGroup } from '../../framework/types'
import { flowFieldSchema, type FlowFieldConfig } from './schema'
import { createFlowState, stepFlow, updateFlowState, type FlowState } from './flowField'
import { flowPresets, colorPresets } from './presets'

// Two independent preset axes. A Flow option patches the motion fields; a Color
// option patches background + blend + the whole color group. Seed is excluded
// from Flow on purpose — the 🎲 dice stays independent of the chosen motion.
const presets: PresetGroup<FlowFieldConfig>[] = [
  { label: 'Flow', options: flowPresets.map((p) => ({ name: p.name, patch: p.flow })) },
  {
    label: 'Color',
    options: colorPresets.map((p) => ({
      name: p.name,
      patch: { background: p.background, blend: p.blend, color: p.color },
    })),
  },
]

// Typed as Diversion<Config, State, '2d'> so the framework threads FlowState and
// a CanvasRenderingContext2D through every hook — no `as` casts needed.
const flowField: Diversion<FlowFieldConfig, FlowState, '2d'> = {
  id: 'flow-field',
  title: 'Flow Field',
  description: 'Particles drifting through a noise-driven vector field.',
  kind: '2d',
  schema: flowFieldSchema,

  setup(ctx, config, size) {
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return createFlowState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepFlow(state, ctx, dt)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    return updateFlowState(state, config)
  },

  presets,
}

export default flowField
