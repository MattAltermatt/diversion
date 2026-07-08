import { defineDiversion, type PresetGroup } from '../../framework/types'
import { voronoiSchema, type VoronoiConfig } from './schema'
import { createVoronoiState, stepVoronoi, resizeVoronoi, buildPaletteLUT, type VoronoiState } from './voronoi'
import { palettePresets } from './presets'

const presets: PresetGroup<VoronoiConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const voronoi = defineDiversion<typeof voronoiSchema, VoronoiState, '2d'>({
  id: 'voronoi',
  title: 'Animated Voronoi',
  description: 'A field of colored Voronoi cells where every seed drifts its own slow, never-'
    + 'repeating orbit — cells grow, shrink, and swap neighbors as the mosaic flows like stained '
    + 'glass. A clean-room port of xscreensaver\'s voronoi hack by Jamie Zawinski, reimagined on a '
    + '2D canvas with a Delaunay-triangulation tessellation recomputed every frame.',
  kind: '2d',
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
