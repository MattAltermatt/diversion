// Cynosure — drifting translucent rectangles that overlap into soft, ever-
// recomposing color fields (Rothko/Albers-ish). A clean-room take on the
// xscreensaver `cynosure` hack (GH #74), upgraded to a curated-palette gallery
// piece. Bounded pool; births/deaths ride a fade envelope so nothing pops.
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { cynosureSchema, type CynosureConfig } from './schema'
import { createState, rebuild, renderCynosure, step, type CynosureState } from './cynosure'
import { motionPresets, palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<CynosureConfig>[] = [
  { label: 'Palette', options: palettePresets },
  { label: 'Motion', options: motionPresets },
]

// Config fields that change the rectangle pool itself → need a rebuild. Everything
// else (opacity, blend, rounding, palette, background, drift, rotate) reads live.
function needsRebuild(a: CynosureConfig, b: CynosureConfig): boolean {
  return a.rectCount !== b.rectCount
    || a.sizeMin !== b.sizeMin
    || a.sizeMax !== b.sizeMax
    || a.aspectVar !== b.aspectVar
    || a.lifespan !== b.lifespan
    || a.seed !== b.seed
}

const cynosure = defineDiversion<typeof cynosureSchema, CynosureState, '2d'>({
  ...meta,
  schema: cynosureSchema,
  presets,

  setup(ctx, config, size: Size) {
    const st = createState(config, size.width, size.height)
    renderCynosure(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    step(state, dt / 1000)
    renderCynosure(state, ctx)
  },

  resize(state, size) {
    // Geometry is viewport-independent (fractions), so a resize just updates the
    // draw size — never restarts the composition.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    const structural = needsRebuild(state.cfg, config)
    state.cfg = config
    if (structural) rebuild(state)
    return true // opacity/blend/rounding/palette/background/drift/rotate all read live
  },
})

export default cynosure
