import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { raymarcherSchema, type RaymarcherConfig } from './schema'
import {
  initGL, render, disposeGL, derivePrimitives, buildPalette, buildSky, lightColorFromHue,
  orbitCamera, type RaymarcherGL, type PrimitiveParams, type Camera,
} from './raymarcher'
import { formPresets, palettePresets } from './presets'
import { meta } from './meta'

type RaymarcherState = {
  gl: WebGL2RenderingContext // kept so teardown() (which gets no ctx) can free GL resources
  res: RaymarcherGL
  cfg: RaymarcherConfig
  prims: PrimitiveParams
  palette: { stops: Float32Array; count: number }
  sky: { zenith: [number, number, number]; horizon: [number, number, number] }
  lightColor: [number, number, number]
  morphPhase: number
  camPhase: number
}

// Neither phase is periodic in time (per-primitive speeds are incommensurate-ish, and
// the camera orbit never exactly repeats), so wrap both at a large multiple of 2π to
// keep their float32/JS trig precise over multi-hour unattended runs. At the default
// slow speeds this is many hours between wraps; the single-frame snap at the wrap
// point is sub-perceptible against a continuously morphing, orbiting scene.
const WRAP = Math.round(1e4 / (2 * Math.PI)) * 2 * Math.PI

const presets: PresetGroup<RaymarcherConfig>[] = [
  { label: 'Form', options: formPresets },
  { label: 'Palette', options: palettePresets },
]

const raymarcher = defineDiversion<typeof raymarcherSchema, RaymarcherState, 'webgl'>({
  ...meta,
  schema: raymarcherSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return {
      gl, res: initGL(gl), cfg,
      prims: derivePrimitives(cfg.seed),
      palette: buildPalette(cfg), sky: buildSky(cfg), lightColor: lightColorFromHue(cfg.lightHue),
      morphPhase: 0, camPhase: 0,
    }
  },

  frame(state, gl, _t, dt) {
    // frame() is the only lifecycle hook that gets the gl context every tick, so the
    // viewport is set here to always track the live backing store (resize/teardown don't).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Accumulate speed into phase (not a separate uniform) so changing Speed never jumps
    // the animation — it only changes the accumulation rate. Speed 0 → phase frozen.
    state.morphPhase = (state.morphPhase + (dt / 1000) * state.cfg.morphSpeed) % WRAP
    state.camPhase = (state.camPhase + (dt / 1000) * state.cfg.cameraSpeed) % WRAP
    const camera: Camera = orbitCamera(state.camPhase)
    render(gl, state.res, state.cfg, state.prims, state.palette, state.sky, camera, state.lightColor, state.morphPhase)
  },

  update(state, cfg) {
    if (cfg.seed !== state.cfg.seed) state.prims = derivePrimitives(cfg.seed) // reshuffle placement
    state.cfg = cfg
    state.palette = buildPalette(cfg)
    state.sky = buildSky(cfg)
    state.lightColor = lightColorFromHue(cfg.lightHue)
    return true // every param is a uniform / cheap derived uniform — always applied live
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default raymarcher
