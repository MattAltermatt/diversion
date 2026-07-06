import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { excitableMediaSchema, type ExcitableMediaConfig } from './schema'
import { initGL, render, uploadLUT, disposeGL, type ExcitableGL } from './gl'
import { patternPresets, colorPresets } from './presets'

type ExcitableState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: ExcitableGL
  cfg: ExcitableMediaConfig
}

// Two independent preset axes. Pattern sets the excitable regime; Color patches
// the intensity→color ramp. simSpeed/seed stay user-controlled, outside both.
const presets: PresetGroup<ExcitableMediaConfig>[] = [
  { label: 'Pattern', options: patternPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Color', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const excitableMedia = defineDiversion<typeof excitableMediaSchema, ExcitableState, 'webgl'>({
  id: 'excitable-media',
  title: 'Excitable Media',
  description: 'A chemical medium ignites into rotating spiral waves — bright fronts chasing their own recovering tails, like a Belousov-Zhabotinsky dish.',
  kind: 'webgl',
  schema: excitableMediaSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg, dt)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and
  // fills the screen, so the pattern survives window/fullscreen resizes without
  // reallocation or reseed (the sim field keeps its setup-time size).

  update(state, cfg) {
    // A fresh field is needed when the seed changes or the state count changes
    // (the latter rescales what every stored state means) → full re-setup.
    if (cfg.seed !== state.cfg.seed) return false
    if (cfg.states !== state.cfg.states) return false
    // k1 / k2 / g / simSpeed are read live each step and gamma in the display pass;
    // a color change just re-bakes the LUT in place.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default excitableMedia
