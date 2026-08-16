import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { kuramotoSchema, type KuramotoConfig } from './schema'
import { initGL, render, uploadLUT, disposeGL, type KuramotoGL } from './gl'
import { regimePresets, colorPresets } from './presets'
import { meta } from './meta'

type KuramotoState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: KuramotoGL
  cfg: KuramotoConfig
}

const presets: PresetGroup<KuramotoConfig>[] = [
  { label: 'Regime', options: regimePresets },
  { label: 'Palette', options: colorPresets },
]

const kuramoto = defineDiversion<typeof kuramotoSchema, KuramotoState, 'webgl'>({
  ...meta,
  schema: kuramotoSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  update(state, cfg) {
    // A fresh field is needed when the seed changes or the frequency spread changes
    // (spread bakes each cell's fixed natural frequency at seed time) → re-setup.
    if (cfg.seed !== state.cfg.seed) return false
    if (cfg.spread !== state.cfg.spread) return false
    // coupling / simSpeed are uniforms read live each step; a color change re-bakes
    // the phase-wheel LUT in place.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default kuramoto
