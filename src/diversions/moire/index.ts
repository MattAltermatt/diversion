// Moire — concentric rings expand from drifting centers and interfere into
// shifting moire fields. Three styles: glowing additive, filled XOR parity, and
// thin cancelling lines.
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { moireSchema, type MoireConfig } from './schema'
import {
  createMoireState, stepMoire, drawMoire, updateMoireState, resizeMoireState,
  type MoireState,
} from './moire'
import { stylePresets } from './presets'

const presets: PresetGroup<MoireConfig>[] = [
  { label: 'Style', options: stylePresets },
]

const moire = defineDiversion<typeof moireSchema, MoireState, '2d'>({
  id: 'moire',
  title: 'Moire',
  description: 'Concentric rings expand from drifting centers and interfere into '
    + 'shifting moire — glowing, filled op-art parity, or thin cancelling lines.',
  kind: '2d',
  schema: moireSchema,
  presets,

  setup(ctx, config, size) {
    const state = createMoireState(config, size.width, size.height)
    drawMoire(state, ctx)
    return state
  },

  frame(state, ctx, _t, dt) {
    stepMoire(state, dt)
    drawMoire(state, ctx)
  },

  resize(state, size, ctx) {
    resizeMoireState(state, size.width, size.height)
    drawMoire(state, ctx)
  },

  update(state, config, size) {
    return updateMoireState(state, config, size.width, size.height)
  },
})

export default moire
