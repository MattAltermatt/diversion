import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { auroraSchema, type AuroraConfig } from './schema'
import {
  initGL, render, disposeGL, buildPalette, buildSky, seedOffset, type AuroraGL,
} from './gl'
import { activityPresets, palettePresets } from './presets'
import { meta } from './meta'

type AuroraState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: AuroraGL
  cfg: AuroraConfig
  seed: [number, number]
  palette: { stops: Float32Array; count: number }
  sky: { zenith: [number, number, number]; horizon: [number, number, number] }
  phase: number
}

// The fbm field is not periodic in time, so wrap the accumulated phase at a large
// multiple of 2π to keep the float32 u_time uniform precise over multi-hour unattended
// runs. At the default slow drift this is ~hours between wraps; the single-frame snap at
// the wrap point is sub-perceptible against continuously reforming curtains.
const WRAP = Math.round(1e4 / (2 * Math.PI)) * 2 * Math.PI

const presets: PresetGroup<AuroraConfig>[] = [
  { label: 'Activity', options: activityPresets },
  { label: 'Palette', options: palettePresets },
]

const aurora = defineDiversion<typeof auroraSchema, AuroraState, 'webgl'>({
  ...meta,
  schema: auroraSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return {
      gl, res: initGL(gl), cfg,
      seed: seedOffset(cfg.seed), palette: buildPalette(cfg), sky: buildSky(cfg), phase: 0,
    }
  },

  frame(state, gl, _t, dt) {
    // frame() is the only lifecycle hook that gets the gl context every tick, so set
    // the viewport here to always track the live backing store (resize/teardown don't).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Accumulate speed into phase (not a separate uniform) so changing Speed never jumps
    // the animation — it only changes the accumulation rate. Speed 0 → phase frozen.
    state.phase = (state.phase + (dt / 1000) * state.cfg.speed) % WRAP
    render(gl, state.res, state.cfg, state.seed, state.palette, state.sky, state.phase)
  },

  update(state, cfg) {
    state.cfg = cfg
    state.seed = seedOffset(cfg.seed) // cheap; reflects a seed edit live
    state.palette = buildPalette(cfg)
    state.sky = buildSky(cfg)
    return true // every param is a uniform / derived uniform — always applied live
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default aurora
