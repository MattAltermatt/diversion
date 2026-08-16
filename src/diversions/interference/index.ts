import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { interferenceSchema, type InterferenceConfig } from './schema'
import {
  initGL, render, disposeGL, buildSources, buildPalette, type InterferenceGL, type SourceSet,
} from './interference'
import { flowPresets, colorPresets } from './presets'
import { meta } from './meta'

type InterferenceState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: InterferenceGL
  cfg: InterferenceConfig
  sources: SourceSet
  palette: { stops: Float32Array; count: number }
  phase: number   // ripple-travel phase (wave argument's t term), wrapped for float32 precision
  driftT: number  // elapsed seconds driving source drift — JS double precision, never wrapped
}

// The wave argument's time coefficient is 1.0 (sin(dist·frequency − t)), so every
// term completes whole cycles at any multiple of 2π — wrap there to keep the
// float32 u_time uniform precise over multi-hour unattended runs (mirrors
// plasma/quasicrystal/cwaves).
const WRAP = Math.round(1e4 / (2 * Math.PI)) * 2 * Math.PI

const presets: PresetGroup<InterferenceConfig>[] = [
  { label: 'Flow', options: flowPresets },
  { label: 'Palette', options: colorPresets },
]

const interference = defineDiversion<typeof interferenceSchema, InterferenceState, 'webgl'>({
  ...meta,
  schema: interferenceSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return {
      gl, res: initGL(gl), cfg,
      sources: buildSources(cfg), palette: buildPalette(cfg),
      phase: 0, driftT: 0,
    }
  },

  frame(state, gl, _t, dt) {
    // frame() is the only lifecycle hook that gets the gl context every tick, so set
    // the viewport here to always track the live backing store (resize/teardown don't).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    const dts = dt / 1000
    state.phase = (state.phase + dts * state.cfg.speed) % WRAP
    state.driftT += dts
    render(gl, state.res, state.cfg, state.sources, state.palette, state.phase, state.driftT)
  },

  update(state, cfg) {
    state.cfg = cfg
    state.sources = buildSources(cfg) // cheap (<=8 sources); reflects seed/count edits live
    state.palette = buildPalette(cfg)
    return true // every param is a uniform / derived uniform array — always applied live
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default interference
