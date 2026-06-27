import type { Diversion } from '../../framework/types'
import { flowFieldSchema, type FlowFieldConfig } from './schema'
import { createFlowState, stepFlow, updateFlowState, type FlowState } from './flowField'

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
}

export default flowField
