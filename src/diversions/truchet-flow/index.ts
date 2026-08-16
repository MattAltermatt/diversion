import { defineDiversion, type PresetGroup } from '../../framework/types'
import { truchetFlowSchema, type TruchetFlowConfig } from './schema'
import { createTruchetState, buildArcs, renderTruchet, computeStyles, type TruchetState } from './truchet'
import { palettePresets } from './presets'
import { meta } from './meta'

const SPEED_PX = 80 // px/sec of dash travel at flowSpeed 1

const presets: PresetGroup<TruchetFlowConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const truchetFlow = defineDiversion<typeof truchetFlowSchema, TruchetState, '2d'>({
  ...meta,
  schema: truchetFlowSchema,
  presets,

  setup(ctx, config, size) {
    const st = createTruchetState(config, size.width, size.height)
    renderTruchet(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    const arcLen = (Math.PI / 2) * (state.ts / 2)
    state.phase = (state.phase + state.cfg.flowSpeed * SPEED_PX * (dt / 1000)) % arcLen
    renderTruchet(state, ctx)
  },

  resize(state, size) {
    state.w = size.width
    state.h = size.height
    state.arcs = buildArcs(size.width, size.height, state.ts, state.cfg.seed)
  },

  update(state, config) {
    // Orientation is a stable hash, so a rebuild keeps existing tiles; tileSize/seed
    // rebuild the arc list, everything else is read live in frame/render.
    if (config.tileSize !== state.cfg.tileSize || config.seed !== state.cfg.seed) {
      state.ts = config.tileSize
      state.arcs = buildArcs(state.w, state.h, config.tileSize, config.seed)
    }
    state.cfg = config
    computeStyles(state) // refresh precomputed dash pattern + halo color
    return true
  },
})

export default truchetFlow
