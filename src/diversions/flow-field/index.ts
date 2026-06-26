import type { Diversion, RenderContext, Size } from '../../framework/types'
import { flowFieldSchema, type FlowFieldConfig } from './schema'
import { createFlowState, stepFlow, type FlowState } from './flowField'

const flowField: Diversion<FlowFieldConfig> = {
  id: 'flow-field',
  title: 'Flow Field',
  description: 'Particles drifting through a noise-driven vector field.',
  kind: '2d',
  schema: flowFieldSchema,

  setup(ctx: RenderContext, config: FlowFieldConfig, size: Size): FlowState {
    const c = ctx as CanvasRenderingContext2D
    c.fillStyle = config.palette.background
    c.fillRect(0, 0, size.width, size.height)
    return createFlowState(config, size.width, size.height)
  },

  frame(state, ctx, _t, dt) {
    stepFlow(state as FlowState, ctx as CanvasRenderingContext2D, dt)
  },

  resize(state, size) {
    const s = state as FlowState
    s.w = size.width; s.h = size.height
  },
}

export default flowField
