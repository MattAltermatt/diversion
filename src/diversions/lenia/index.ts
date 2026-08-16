import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { leniaSchema, type LeniaConfig } from './schema'
import { initGL, render, uploadLUT, uploadKernel, disposeGL, type LeniaGL } from './gl'
import { patternPresets, colorPresets } from './presets'
import { meta } from './meta'

type LeniaState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: LeniaGL
  cfg: LeniaConfig
}

// Two independent preset axes (like Gray-Scott / Physarum). Pattern patches μ/σ +
// structural kernel; Color patches the field→color ramp. simSpeed/seed stay outside.
const presets: PresetGroup<LeniaConfig>[] = [
  { label: 'Pattern', options: patternPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Palette', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const lenia = defineDiversion<typeof leniaSchema, LeniaState, 'webgl'>({
  ...meta,
  schema: leniaSchema,

  setup(gl, cfg, size: Size) {
    return { gl, res: initGL(gl, cfg, size.width, size.height), cfg }
  },

  frame(state, gl, _t, _dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    render(gl, state.res, state.cfg)
  },

  // resize is a no-op: the display pass samples the field in normalized UV and always
  // fills the screen, so the soup survives window/fullscreen resizes without realloc.

  update(state, cfg) {
    // Reseed (fresh field) or a kernel-radius change (R is a compile-time shader
    // constant) need a full rebuild → fall back to teardown + setup.
    if (cfg.seed !== state.cfg.seed) return false
    if (cfg.kernelRadius !== state.cfg.kernelRadius) return false
    // Ring-profile (β) change at the same radius: re-upload the kernel LUT in place.
    if (cfg.kernel !== state.cfg.kernel) uploadKernel(state.gl, state.res, cfg.kernelRadius, cfg.kernel)
    // Color change: swap the LUT in place. μ/σ/simSpeed are read live as uniforms.
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },

  presets,
})

export default lenia
