import { defineDiversion } from '../../framework/types'
import { rehydrate } from '../../framework/imageStore'
import { salvageSchema } from './schema'
import { salvagePresets } from './presets'
import { createState, step, applyConfig, resizeState } from './salvage'
import type { SalvageState } from './state'
import { render } from './render'
import { meta } from './meta'

// Salvage: a colony of spider drones dismantles a pixel-art sprite from the outside
// in — pieces are impassable, so only the edge is reachable — and carries every piece
// across the arena to a mound, laying colour-coded trails that recruit blank drones to
// the colour being carried. Heavy pieces wait for a crew. When the picture is gone the
// mound fades and the next sprite fades in.
const salvage = defineDiversion<typeof salvageSchema, SalvageState, '2d'>({
  ...meta,
  schema: salvageSchema,
  presets: salvagePresets,

  setup(_ctx, config, size) {
    // Decode the stored upload here, not at module scope (the registry is eager).
    if (config.source === 'Yours') rehydrate()
    return createState(config, size)
  },

  // dt arrives in MILLISECONDS; the sim works in seconds.
  frame(state, ctx, _t, dt) {
    step(state, dt / 1000)
    render(state, ctx)
  },

  resize(state, size) { resizeState(state, size) },
  update(state, config, size) { return applyConfig(state, config, size) },
})

export default salvage
