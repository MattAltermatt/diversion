import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { foamSchema, type FoamConfig } from './schema'
import { initGL, render, uploadLUT, refreshWallColor, disposeGL, type FoamGL } from './gl'
import { foamPresets, palettePresets } from './presets'
import { meta } from './meta'

type FoamState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: FoamGL
  cfg: FoamConfig
}

// Two independent preset axes. A Foam option patches cell size + pace; a Palette
// option patches the cell colors + wall color. Seed / wall-shape knobs stay outside.
const presets: PresetGroup<FoamConfig>[] = [
  { label: 'Foam', options: foamPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: palettePresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const foam = defineDiversion<typeof foamSchema, FoamState, 'webgl'>({
  ...meta,
  schema: foamSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and always
  // fills the screen, so the froth survives window/fullscreen resizes without
  // reallocation or reseed (the sim field keeps its setup-time size).

  update(state, cfg) {
    // Reseeding needs a fresh field → fall back to teardown + setup.
    if (cfg.seed !== state.cfg.seed) return false
    // Everything else is a per-step uniform (cellScale/simSpeed), a display uniform
    // (wall color/thickness/contrast), or an in-place LUT swap (cell colors) — all
    // non-structural, morphing the existing froth live.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    if (cfg.wallColor !== state.cfg.wallColor) refreshWallColor(state.res, cfg)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default foam
