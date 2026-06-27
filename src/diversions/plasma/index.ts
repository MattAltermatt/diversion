import type { Diversion, Size } from '../../framework/types'
import { plasmaSchema, type PlasmaConfig } from './schema'
import { initGL, render, disposeGL, type PlasmaGL } from './plasma'

type PlasmaState = {
  gl: WebGL2RenderingContext // kept so teardown() (which gets no ctx) can free GL resources
  res: PlasmaGL
  cfg: PlasmaConfig
  phase: number
}

const plasma: Diversion<PlasmaConfig, PlasmaState, 'webgl'> = {
  id: 'plasma',
  title: 'Plasma',
  description: 'Domain-warped color fields drifting across the screen — demoscene plasma.',
  kind: 'webgl',
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
    // loses ULP precision and the motion would quantize). The wrap causes one imperceptible
    // jump roughly every few hours — a fine trade for bounded precision.
    state.phase = (state.phase + (dt / 1000) * state.cfg.speed) % 1e4
    render(gl, state.res, state.cfg, state.phase)
  },

  update(state, cfg) {
    state.cfg = cfg
    return true // every param is a uniform — always applied live, never re-setup
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
}

export default plasma
