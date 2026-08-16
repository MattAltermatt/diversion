import { defineDiversion, type Size } from '../../framework/types'
import { plasmaSchema, type PlasmaConfig } from './schema'
import { initGL, render, disposeGL, type PlasmaGL } from './plasma'
import { meta } from './meta'

type PlasmaState = {
  gl: WebGL2RenderingContext // kept so teardown() (which gets no ctx) can free GL resources
  res: PlasmaGL
  cfg: PlasmaConfig
  phase: number
}

// Common period of the shader's three time coefficients (0.6, 0.7, 1.0): 20π is
// the smallest multiple of 2π that's also a multiple of 2π/0.7 and 2π/0.6, so
// wrapping `phase` at a multiple of it lands every term back at a whole-cycle
// boundary simultaneously — the reset is seamless instead of a visible snap.
const WRAP = Math.round(1e4 / (20 * Math.PI)) * 20 * Math.PI

const plasma = defineDiversion<typeof plasmaSchema, PlasmaState, 'webgl'>({
  ...meta,
  schema: plasmaSchema,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, phase: 0 }
  },

  frame(state, gl, _t, dt) {
    // The viewport must track the live backing store; resize()/teardown() don't get
    // the gl context, and frame() does — so set it here every frame (cheap, always-correct).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Accumulate phase so changing Speed never jumps the animation. Wrap it to keep the
    // float32 `u_time` uniform precise over multi-hour unattended runs (unbounded time
    // loses ULP precision and the motion would quantize). WRAP is a multiple of 20π —
    // the common period of the shader's three time coefficients (0.6, 0.7, 1.0) — so
    // every term completes whole cycles at the wrap point and the reset is seamless,
    // not a visible full-screen snap.
    state.phase = (state.phase + (dt / 1000) * state.cfg.speed) % WRAP
    render(gl, state.res, state.cfg, state.phase)
  },

  update(state, cfg) {
    state.cfg = cfg
    return true // every param is a uniform — always applied live, never re-setup
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default plasma
