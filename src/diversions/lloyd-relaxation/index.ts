import { defineDiversion, type PresetGroup } from '../../framework/types'
import { lloydRelaxationSchema, type LloydRelaxationConfig } from './schema'
import { createLloydState, stepLloyd, resizeLloyd, buildLUT, type LloydState } from './lloyd'
import { palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<LloydRelaxationConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const lloydRelaxation = defineDiversion<typeof lloydRelaxationSchema, LloydState, '2d'>({
  ...meta,
  schema: lloydRelaxationSchema,
  presets,

  setup(ctx, config, size) {
    const st = createLloydState(config, size.width, size.height)
    stepLloyd(st, ctx, 16) // paint the initial scatter
    return st
  },

  frame(state, ctx, _t, dt) {
    stepLloyd(state, ctx, dt)
  },

  resize(state, size) {
    resizeLloyd(state, size.width, size.height)
  },

  update(state, config) {
    // count + seed rebuild the whole point set → full re-setup.
    if (config.count !== state.cfg.count) return false
    if (config.seed !== state.cfg.seed) return false
    // palette re-bakes the color LUT; relaxRate/jitter/border read live.
    if (config.palette.join() !== state.cfg.palette.join()) state.lut = buildLUT(config.palette)
    state.cfg = config
    return true
  },
})

export default lloydRelaxation
