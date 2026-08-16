import { defineDiversion, type PresetGroup } from '../../framework/types'
import { penroseSchema, type PenroseConfig } from './schema'
import { createPenroseState, buildTiling, seededRot, renderPenrose, type PenroseState } from './penrose'
import { palettePresets } from './presets'
import { meta } from './meta'

const SPIN_RATE = 0.3 // rad/sec at spin 1

const presets: PresetGroup<PenroseConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const penrose = defineDiversion<typeof penroseSchema, PenroseState, '2d'>({
  ...meta,
  schema: penroseSchema,
  presets,

  setup(ctx, config, size) {
    const st = createPenroseState(config, size.width, size.height)
    renderPenrose(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.rotation += state.cfg.spin * SPIN_RATE * (dt / 1000)
    renderPenrose(state, ctx)
  },

  resize(state, size) {
    // The tiling lives in unit coordinates; the render scales it to fill — a resize
    // just changes w/h, no rebuild, no restart.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    if (config.depth !== state.cfg.depth || config.seed !== state.cfg.seed) {
      state.tris = buildTiling(config.depth, seededRot(config.seed)) // structural rebuild
    }
    state.cfg = config
    return true // spin / colors / lineWidth read live
  },
})

export default penrose
