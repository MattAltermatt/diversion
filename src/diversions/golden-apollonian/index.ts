import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { mulberry32 } from '../../framework/rng'
import { goldenApollonianSchema, type GoldenApollonianConfig } from './schema'
import { initGL, render, disposeGL, type ApollianGL } from './apollian'
import { palettePresets } from './presets'

type ApollianState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: ApollianGL
  cfg: GoldenApollonianConfig
  phase: number // accumulated flight time (drives the u_time uniform)
}

const presets: PresetGroup<GoldenApollonianConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

/** Map the seed to a starting point in the endless flight so each visit opens
 *  somewhere new (the path is quasi-periodic — it never repeats). */
export function seedOffset(seed: number): number {
  return mulberry32(seed)() * 800
}

const goldenApollonian = defineDiversion<typeof goldenApollonianSchema, ApollianState, 'webgl'>({
  id: 'golden-apollonian',
  title: 'Golden Apollonian',
  description: 'An endless flight down a tunnel whose walls are glowing golden Apollonian-gasket fractals — a stack of receding planes, each a folded-cube sphere-inversion fractal lit by two soft lights and a sun far down the throat, weaving along a curved path with kaleidoscopic symmetry that cycles as you fall.',
  kind: 'webgl',
  schema: goldenApollonianSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, phase: seedOffset(cfg.seed) }
  },

  frame(state, gl, _t, dt) {
    // viewport must track the live backing store each frame (resize/teardown get no ctx).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Accumulate so changing Speed never jumps the flight. No wrap: the path is
    // quasi-periodic (irrational frequency ratios) so there's no seamless reset point
    // a wrap could snap to. float32 u_time stays precise for many hours; only a
    // multi-day *continuous* run (or a very low Speed) eventually shrinks the per-frame
    // step below a float32 ULP and quantizes the motion — fine for a screensaver that
    // cycles or reloads, and unavoidable here without a visible snap.
    state.phase += (dt / 1000) * state.cfg.speed
    render(gl, state.res, state.cfg, state.phase)
  },

  update(state, cfg) {
    // A new seed re-picks the flight's starting point; everything else is a live uniform.
    if (cfg.seed !== state.cfg.seed) state.phase = seedOffset(cfg.seed)
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default goldenApollonian
