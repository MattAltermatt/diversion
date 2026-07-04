import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { lyapunovSchema, type LyapunovConfig } from './schema'
import { initGL, render, disposeGL, computeView, type LyapunovGL } from './lyapunov'
import { palettePresets } from './presets'

type LyapunovState = {
  gl: WebGL2RenderingContext // kept so teardown() (no ctx) can free GL resources
  res: LyapunovGL
  cfg: LyapunovConfig
  time: number // accumulated seconds (double precision — drives the double-precision drift)
}

// The palette shimmer's `sin(u_shimmer * 0.7 + ...)` completes whole cycles at
// multiples of 2π/0.7. WRAP is a large multiple of that period, so wrapping the
// shimmer phase keeps the float32 uniform precise over multi-hour runs with no
// visible snap. The window drift itself runs in JS double precision (computeView),
// so only this palette term needs wrapping.
const WRAP = Math.round(1e4 / (2 * Math.PI / 0.7)) * (2 * Math.PI / 0.7)

const presets: PresetGroup<LyapunovConfig>[] = [
  { label: 'Palette', options: palettePresets },
]

const lyapunov = defineDiversion<typeof lyapunovSchema, LyapunovState, 'webgl'>({
  id: 'lyapunov',
  title: 'Lyapunov',
  description: 'The Markus–Lyapunov "Zircon Zity" fractal — a binary A/B sequence drives the logistic map, and its Lyapunov exponent paints glowing warm stable cities against deep chaotic voids, slowly drifting through parameter space.',
  kind: 'webgl',
  schema: lyapunovSchema,
  presets,

  setup(gl, cfg, _size: Size) {
    return { gl, res: initGL(gl), cfg, time: 0 }
  },

  frame(state, gl, _t, dt) {
    // The viewport must track the live backing store; resize()/teardown() don't get
    // the gl context, frame() does — so set it here every frame (cheap, always-correct).
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    // Accumulate at Drift speed so changing speed never jumps the animation.
    state.time += (dt / 1000) * state.cfg.speed
    const view = computeView(state.cfg.seed, state.cfg.zoom, state.time)
    render(gl, state.res, state.cfg, view, state.time % WRAP)
  },

  update(state, cfg) {
    // Every param is a live uniform (or drives the pure computeView) — no re-setup.
    // The iteration loop is unrolled to a compile-time bound and clamped by u_iter,
    // so even Detail changes apply live.
    state.cfg = cfg
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res) // free program + VAO when the diversion changes
  },
})

export default lyapunov
