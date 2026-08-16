import { defineDiversion, type Size } from '../../framework/types'
import { halftoneSchema } from './schema'
import { seedMasses, stepMasses, applyStrength, rescaleX, type Mass } from './motion'
import { initGL, render, disposeGL, type HalftoneGL } from './halftone'
import { meta } from './meta'

type HalftoneState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: HalftoneGL
  cfg: ReturnType<typeof halftoneSchema.parse>
  masses: Mass[]
  aspect: number // setup-time width/height; rescale mass X on resize
  t: number
}

const halftone = defineDiversion<typeof halftoneSchema, HalftoneState, 'webgl'>({
  ...meta,
  schema: halftoneSchema,

  setup(gl, cfg, size: Size) {
    const aspect = size.width / size.height
    return { gl, res: initGL(gl), cfg, masses: seedMasses(cfg, aspect), aspect, t: 0 }
  },

  frame(state, gl, _t, dt) {
    // Viewport must track the live backing store; resize()/teardown() get no gl.
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.t = stepMasses(state.masses, state.cfg, dt, state.t)
    render(gl, state.res, state.cfg, state.masses)
  },

  resize(state, size) {
    // Keep mass orbits within the visible width when the aspect changes. u_res is
    // set per-frame, but CPU orbit centres need rescaling.
    const next = size.width / size.height
    rescaleX(state.masses, state.aspect, next)
    state.aspect = next
  },

  update(state, cfg) {
    // massCount/seed change the seeded mass *set* — but the GL program does NOT
    // depend on mass count (u_count is read live, the uniform array is fixed at
    // MAX_MASSES), so reseed the CPU mass set in place instead of a full teardown
    // + initGL (which would needlessly rebuild + flicker the shader).
    if (cfg.massCount !== state.cfg.massCount || cfg.seed !== state.cfg.seed) {
      state.masses = seedMasses(cfg, state.aspect)
      state.cfg = cfg
      return true
    }
    // Mass strength re-tunes live from each mass's seeded fraction (no reseed).
    if (cfg.massStrength !== state.cfg.massStrength) applyStrength(state.masses, cfg)
    state.cfg = cfg // spread / grid / dot size / colours are read live each frame
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO on diversion switch
  },
})

export default halftone
