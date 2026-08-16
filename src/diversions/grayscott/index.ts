import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { grayScottSchema, type GrayScottConfig } from './schema'
import { initGL, render, uploadLUT, disposeGL, type GrayScottGL } from './gl'
import { patternPresets, colorPresets } from './presets'
import { meta } from './meta'

type GrayScottState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: GrayScottGL
  cfg: GrayScottConfig
}

// Two independent preset axes (like Physarum). Pattern patches feed/kill; Color
// patches the V→color ramp. simSpeed/seed stay user-controlled, outside both.
const presets: PresetGroup<GrayScottConfig>[] = [
  { label: 'Pattern', options: patternPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const grayscott = defineDiversion<typeof grayScottSchema, GrayScottState, 'webgl'>({
  ...meta,
  schema: grayScottSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and
  // always fills the screen, so the pattern survives window/fullscreen resizes
  // without reallocation or reseed (the sim field keeps its setup-time size).

  update(state, cfg) {
    // Reseeding needs a fresh field → fall back to teardown + setup.
    if (cfg.seed !== state.cfg.seed) return false
    // Pattern switches + feed/kill drags morph the existing field live; the LUT
    // is swapped in place on a color change. All are non-structural.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default grayscott
