import { defineDiversion, type Size } from '../../framework/types'
import { causticsSchema, type CausticsConfig } from './schema'
import { buildSpectrum, setSlosh, type Spectrum } from './spectrum'
import { writePhase } from './phase'
import { initGL, resizeTargets, render, disposeGL, type CausticsGL } from './gl'
import { waterPresets, palettePresets } from './presets'
import { meta } from './meta'

export interface CausticsState {
  gl: WebGL2RenderingContext // stashed: teardown() gets no context
  res: CausticsGL
  cfg: CausticsConfig
  spec: Spectrum
  /** Tempo-dilated seconds. NOT the framework's `t`. */
  clock: number
}

/** Fields that change the wave trains themselves and force a rebuild. Everything
 *  else is either a plain uniform or — for `slosh` alone — an in-place mutation
 *  of the standing mask, which is why the three-way split is written down: a
 *  `slosh` that falls through to "uniform" leaves the slider completely inert,
 *  and it is the piece's headline mechanism. */
const SPECTRAL: readonly (keyof CausticsConfig)[] = ['tilt', 'spread', 'seed']

const caustics = defineDiversion<typeof causticsSchema, CausticsState, 'webgl'>({
  ...meta,
  schema: causticsSchema,
  presets: [
    { label: 'Water', options: waterPresets },
    { label: 'Palette', options: palettePresets },
  ],

  setup(gl, cfg, size: Size) {
    const res = initGL(gl)
    // setup allocates its own targets; the resize hook handles only SUBSEQUENT
    // changes. diversionSmoke calls setup + five frames and never calls resize,
    // so relying on the hook for the first allocation would render nothing.
    resizeTargets(gl, res, size.width, size.height)
    return { gl, res, cfg, spec: buildSpectrum(cfg), clock: 0 }
  },

  frame(state, gl, _t, dt) {
    // ⚠️ The framework's dt is MILLISECONDS; the mockup's loop was in seconds.
    // And this must INTEGRATE: `uTime = t * tempo` would teleport the whole
    // surface on every intermediate value of a live Tempo drag. The framework
    // already clamps dt at 50ms, which is the mockup's own 0.05s clamp.
    state.clock += (dt / 1000) * state.cfg.tempo * 60
    writePhase(state.spec, state.clock)
    render(gl, state.res, state.cfg, state.spec, state.clock)
  },

  resize(state, size, gl) {
    resizeTargets(gl, state.res, size.width, size.height)
  },

  update(state, cfg) {
    const prev = state.cfg
    state.cfg = cfg
    if (SPECTRAL.some((k) => prev[k] !== cfg[k])) state.spec = buildSpectrum(cfg)
    else if (prev.slosh !== cfg.slosh) setSlosh(state.spec, cfg.slosh)
    // Nothing here is structural, so setup() never re-runs: ConfigScreen.update
    // runs synchronously on every intermediate value of a slider drag, and a
    // restart there is visible under the cursor.
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default caustics
