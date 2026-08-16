import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { viscousFingeringSchema, type ViscousFingeringConfig } from './schema'
import { initGL, render, uploadLUT, disposeGL, type ViscousFingeringGL } from './gl'
import { fingeringPresets, colorPresets } from './presets'
import { meta } from './meta'

type ViscousFingeringState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: ViscousFingeringGL
  cfg: ViscousFingeringConfig
}

// Two independent preset axes. A Fingering option patches the interface knobs; a
// Color option patches the palette + background. Speed/seed/colorMode stay outside.
const presets: PresetGroup<ViscousFingeringConfig>[] = [
  { label: 'Fingering', options: fingeringPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const viscousFingering = defineDiversion<typeof viscousFingeringSchema, ViscousFingeringState, 'webgl'>({
  ...meta,
  schema: viscousFingeringSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and always
  // fills the screen, so the fingers survive window/fullscreen resizes without
  // reallocation or reseed (the sim field keeps its setup-time size).

  update(state, cfg) {
    // Reseeding needs a fresh field → fall back to teardown + setup.
    if (cfg.seed !== state.cfg.seed) return false
    // Everything else is a per-step uniform (ratio/tension/injection/noise/speed,
    // color mode, background) or an in-place LUT swap — all non-structural.
    if (cfg.palette.join() !== state.cfg.palette.join()) uploadLUT(state.gl, state.res, cfg.palette)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default viscousFingering
