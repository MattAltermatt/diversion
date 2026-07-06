import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { mccabeSchema, type MccabeConfig } from './schema'
import { initGL, render, uploadLUT, setScale, disposeGL, type MccabeGL } from './gl'
import { palettePresets, patternPresets } from './presets'

type MccabeState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: MccabeGL
  cfg: MccabeConfig
}

const presets: PresetGroup<MccabeConfig>[] = [
  { label: 'Pattern', options: patternPresets },
  { label: 'Palette', options: palettePresets },
]

const mccabe = defineDiversion<typeof mccabeSchema, MccabeState, 'webgl'>({
  id: 'mccabe',
  title: 'McCabe',
  description: "Jonathan McCabe's multi-scale Turing patterns: at every point the field measures its surroundings at a ladder of blur radii, and the scale that fits best nudges it up or down — and out of pure noise grows a living field of fingerprint ridges, reptile-skin cells, and nested organic mazes.",
  kind: 'webgl',
  schema: mccabeSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  update(state, cfg) {
    // A new seed reseeds the whole field → re-setup.
    if (cfg.seed !== state.cfg.seed) return false
    // scale re-derives the mip scale set live; a palette edit re-bakes the ramp LUT;
    // speed / contrast are read live each frame.
    if (cfg.scale !== state.cfg.scale) setScale(state.res, cfg.scale)
    if (cfg.palette.join() !== state.cfg.palette.join()) uploadLUT(state.gl, state.res, cfg.palette)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default mccabe
