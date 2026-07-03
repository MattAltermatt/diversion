import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { juliaMorphSchema, type JuliaMorphConfig } from './schema'
import { initGL, render, disposeGL, seededPhase, type JuliaGL } from './julia'
import { familyPresets, colorPresets } from './presets'

type JuliaState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: JuliaGL
  cfg: JuliaMorphConfig
  phase: number
}

// The constant's orbit (cos/sin u_time, coeff 1.0) and the color drift (u_time·0.3)
// share the common period 20π — wrap there to keep the float32 u_time precise over
// long runs with no visible snap (same reasoning as plasma).
const WRAP = Math.round(1e4 / (20 * Math.PI)) * 20 * Math.PI

const presets: PresetGroup<JuliaMorphConfig>[] = [
  { label: 'Family', options: familyPresets },
  { label: 'Color', options: colorPresets },
]

const juliaMorph = defineDiversion<typeof juliaMorphSchema, JuliaState, 'webgl'>({
  id: 'julia-morph',
  title: 'Julia Morph',
  description: 'The Julia set z ← z² + c, with c endlessly orbiting the complex plane so the fractal breathes between dendrites, spirals, and scattered islands — never landing on one shape.',
  kind: 'webgl',
  schema: juliaMorphSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, phase: seededPhase(cfg.seed) }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.phase = (state.phase + (dt / 1000) * state.cfg.speed) % WRAP
    render(gl, state.res, state.cfg, state.phase)
  },

  update(state, cfg) {
    // seed sets the orbit's start; changing it jumps to that new form. Everything
    // else is a uniform read live — no re-setup.
    if (cfg.seed !== state.cfg.seed) state.phase = seededPhase(cfg.seed)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default juliaMorph
