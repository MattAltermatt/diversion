import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { morphogenSchema, type MorphogenConfig } from './schema'
import { initGL, render, uploadLUT, uploadTerritoryColors, disposeGL, type MorphogenGL } from './gl'
import { buildSources, liveSources, type SourceBase } from './sources'
import { bodyPlanPresets, palettePresets } from './presets'

type MorphogenState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: MorphogenGL
  cfg: MorphogenConfig
  bases: SourceBase[]
  driftT: number // accumulated drift clock (s), scaled by driftSpeed
  lifeT: number  // accumulated reorganization clock (s), scaled by reorganize
}

// Two independent axes: Body plan (mechanism) and Palette (colors). simSpeed / seed /
// drift / reorganize / gridResolution stay user-controlled, outside both.
const presets: PresetGroup<MorphogenConfig>[] = [
  { label: 'Body plan', options: bodyPlanPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

// A structural change can't be applied to the live field (it changes the source cast
// or the grid) → fall back to teardown + setup, like Gray-Scott's seed.
const STRUCTURAL: (keyof MorphogenConfig)[] = [
  'gridResolution', 'sourceLayout', 'morphogenCount', 'sourceCount', 'seed',
]

const morphogen = defineDiversion<typeof morphogenSchema, MorphogenState, 'webgl'>({
  id: 'morphogen',
  title: 'Morphogen',
  description: 'Diffusing chemicals lay down gradients that cells read into a body plan — territories, eyespots, a French flag.',
  kind: 'webgl',
  schema: morphogenSchema,

  setup(gl, cfg, size: Size) {
    const bases = buildSources(cfg, cfg.seed)
    // Seed the field at full source strength (reorganize=0) for a clean initial thumbnail.
    const seedSrc = liveSources(bases, 0, 0, 0, cfg.seed)
    const res = initGL(gl, cfg, seedSrc, size.width, size.height)
    return { gl, res, cfg, bases, driftT: 0, lifeT: 0 }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    const s = dt / 1000
    state.driftT += s * state.cfg.driftSpeed
    state.lifeT += s * state.cfg.reorganize
    const sources = liveSources(state.bases, state.driftT, state.lifeT, state.cfg.reorganize, state.cfg.seed)
    render(gl, state.res, state.cfg, sources)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and always
  // fills the screen, so the body plan survives window/fullscreen resizes (the sim
  // field keeps its setup-time size, matching Gray-Scott).

  update(state, cfg) {
    for (const key of STRUCTURAL) {
      if (cfg[key] !== state.cfg[key]) return false
    }
    if (cfg.palette.join() !== state.cfg.palette.join()) uploadLUT(state.gl, state.res, cfg.palette)
    if (cfg.territoryColors.join() !== state.cfg.territoryColors.join()) {
      uploadTerritoryColors(state.res, cfg.territoryColors)
    }
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default morphogen
