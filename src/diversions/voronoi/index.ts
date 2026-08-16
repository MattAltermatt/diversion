import { defineDiversion, type PresetGroup } from '../../framework/types'
import { voronoiSchema, type VoronoiConfig } from './schema'
import { createVoronoiState, stepVoronoi, resizeVoronoi, buildPaletteLUT, type VoronoiState } from './voronoi'
import { palettePresets } from './presets'
import { meta } from './meta'

const presets: PresetGroup<VoronoiConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const voronoi = defineDiversion<typeof voronoiSchema, VoronoiState, '2d'>({
  ...meta,
  schema: voronoiSchema,
  presets,

  setup(ctx, config, size) {
    const st = createVoronoiState(config, size.width, size.height)
    stepVoronoi(st, ctx, 16) // paint the initial mosaic
    return st
  },

  frame(state, ctx, _t, dt) {
    stepVoronoi(state, ctx, dt)
  },

  resize(state, size) {
    resizeVoronoi(state, size.width, size.height)
  },

  update(state, config) {
    // siteCount + seed rebuild the whole point set → full re-setup.
    if (config.siteCount !== state.cfg.siteCount) return false
    if (config.seed !== state.cfg.seed) return false
    // driftRadius rescales the already-baked per-site amplitudes proportionally.
    if (config.driftRadius !== state.cfg.driftRadius) {
      const ratio = config.driftRadius / state.cfg.driftRadius
      for (let i = 0; i < state.amp.length; i++) state.amp[i] *= ratio
    }
    // palette re-bakes the color LUT; driftSpeed/fillMode/edgeWidth/edgeColor read live.
    if (config.palette.join() !== state.cfg.palette.join()) state.lut = buildPaletteLUT(config.palette)
    state.cfg = config
    return true
  },
})

export default voronoi
