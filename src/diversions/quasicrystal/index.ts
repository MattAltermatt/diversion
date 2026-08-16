import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { quasicrystalSchema, type QuasicrystalConfig } from './schema'
import { initGL, render, disposeGL, seededRotation, type QuasicrystalGL } from './quasicrystal'
import { symmetryPresets, colorPresets } from './presets'
import { meta } from './meta'

type QuasicrystalState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: QuasicrystalGL
  cfg: QuasicrystalConfig
  phase: number
  rot: number
}

// The waves all share the drifting phase (coefficient 1.0), so every term
// completes whole cycles at any multiple of 2π — wrap there to keep the float32
// u_time uniform precise over multi-hour runs without a visible snap.
const WRAP = Math.round(1e4 / (2 * Math.PI)) * 2 * Math.PI

const presets: PresetGroup<QuasicrystalConfig>[] = [
  { label: 'Symmetry', options: symmetryPresets },
  { label: 'Palette', options: colorPresets },
]

const quasicrystal = defineDiversion<typeof quasicrystalSchema, QuasicrystalState, 'webgl'>({
  ...meta,
  schema: quasicrystalSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, phase: 0, rot: seededRotation(cfg.seed) }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.phase = (state.phase + (dt / 1000) * state.cfg.speed) % WRAP
    render(gl, state.res, state.cfg, state.phase, state.rot)
  },

  update(state, cfg) {
    if (cfg.seed !== state.cfg.seed) state.rot = seededRotation(cfg.seed) // rotation is a uniform, no re-setup
    state.cfg = cfg
    return true // every param is a uniform — always applied live
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default quasicrystal
