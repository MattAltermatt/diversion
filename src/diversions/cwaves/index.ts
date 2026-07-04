import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { cwavesSchema, type CwavesConfig } from './schema'
import {
  initGL, render, disposeGL, buildWaves, buildPalette, type CwavesGL, type WaveSet,
} from './cwaves'
import { flowPresets, colorPresets } from './presets'

type CwavesState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: CwavesGL
  cfg: CwavesConfig
  waves: WaveSet
  palette: { stops: Float32Array; count: number }
  phase: number
}

// Each grating drifts at a rate near 1 (±0.2), so there's no exact common period;
// wrap at a large multiple of 2π (as plasma/quasicrystal do) to keep the float32
// u_time uniform precise over multi-hour unattended runs. The residual per-grating
// snap at the wrap point is sub-perceptible and happens only every ~10⁴ phase-units.
const WRAP = Math.round(1e4 / (2 * Math.PI)) * 2 * Math.PI

const presets: PresetGroup<CwavesConfig>[] = [
  { label: 'Flow', options: flowPresets },
  { label: 'Palette', options: colorPresets },
]

const cwaves = defineDiversion<typeof cwavesSchema, CwavesState, 'webgl'>({
  id: 'cwaves',
  title: 'Colour Waves',
  description: 'Several drifting cosine gratings superimpose into smooth, ever-reorganizing ribbons of colour — like silk or an aurora.',
  kind: 'webgl',
  schema: cwavesSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, waves: buildWaves(cfg), palette: buildPalette(cfg), phase: 0 }
  },

  frame(state, gl, _t, dt) {
    // frame() is the only lifecycle hook that gets the gl context every tick, so set
    // the viewport here to always track the live backing store (resize/teardown don't).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    state.phase = (state.phase + (dt / 1000) * state.cfg.driftSpeed) % WRAP
    render(gl, state.res, state.cfg, state.waves, state.palette, state.phase)
  },

  update(state, cfg) {
    state.cfg = cfg
    state.waves = buildWaves(cfg) // cheap (≤8 gratings); reflects seed/count/spread edits live
    state.palette = buildPalette(cfg)
    return true // every param is a uniform / derived uniform array — always applied live
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default cwaves
