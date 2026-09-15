import { defineDiversion, type Size } from '../../framework/types'
import {
  createFilm,
  formFilm,
  gridFor,
  resampleFilm,
  stepFilm,
  type Film,
  type FilmParams,
} from './film'
import { allocThickness, disposeGL, initGL, render, uploadLut, uploadThickness, type SoapGL } from './gl'
import { meta } from './meta'
import { buildColorLut } from './optics'
import { filmPresets, pacePresets } from './presets'
import { REFORM_FADE_S, updateRupture, type Rupture } from './rupture'
import { soapFilmSchema, type SoapFilmConfig } from './schema'

export interface SoapFilmState {
  /** Stashed: `teardown()` is the one hook that gets no context. */
  gl: WebGL2RenderingContext
  res: SoapGL
  cfg: SoapFilmConfig
  film: Film
  rupture: Rupture | null
  /** Seconds since the current film formed — drives the fade-in after a rupture. */
  sinceForm: number
  width: number
  height: number
}

const paramsOf = (cfg: SoapFilmConfig): FilmParams => ({
  mobility: cfg.mobility,
  drainRate: cfg.drainRate,
  filmThickness: cfg.filmThickness,
})

const soapFilm = defineDiversion<typeof soapFilmSchema, SoapFilmState, 'webgl'>({
  ...meta,
  schema: soapFilmSchema,
  presets: [
    { label: 'Film', options: filmPresets },
    { label: 'Pace', options: pacePresets },
  ],

  setup(gl, cfg, size: Size) {
    const { cols, rows } = gridFor(size.width, size.height)
    const res = initGL(gl, cols, rows)
    uploadLut(gl, res, buildColorLut(cfg.filmIndex, cfg.illuminant))
    return {
      gl,
      res,
      cfg,
      film: createFilm(cols, rows, cfg.seed, paramsOf(cfg)),
      rupture: null,
      sinceForm: REFORM_FADE_S,
      width: size.width,
      height: size.height,
    }
  },

  frame(state, gl, _t, dt) {
    // ⚠️ The framework's dt is MILLISECONDS. `tempo` SCALES the step: this is a state
    // integrator, not a phase function, so there is no clock to accumulate — a
    // `clock += …` that nothing reads is a dead store, and `t * tempo` would mean
    // nothing here.
    const dtSeconds = (dt / 1000) * state.cfg.tempo
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)

    // ⚠️ stepFilm ALWAYS before updateRupture: they share `film.rng`, so the call order
    // is the determinism contract.
    stepFilm(state.film, paramsOf(state.cfg), dtSeconds)
    const aspect = state.width / state.height
    const out = updateRupture(
      state.rupture,
      state.film,
      state.cfg.rupture,
      dtSeconds,
      aspect,
      state.cfg.filmThickness,
    )
    state.rupture = out.rupture
    if (out.reform) {
      formFilm(state.film, paramsOf(state.cfg))
      state.sinceForm = 0
    } else {
      state.sinceForm += dtSeconds
    }

    uploadThickness(gl, state.res, state.film)
    render(gl, state.res, {
      width: gl.drawingBufferWidth,
      height: gl.drawingBufferHeight,
      filmIndex: state.cfg.filmIndex,
      exposure: state.cfg.exposure,
      background: state.cfg.background,
      rupture: state.rupture
        ? [state.rupture.x, state.rupture.y, state.rupture.r, 0.028]
        : [0, 0, 0, 0],
      fade: Math.min(1, state.sinceForm / REFORM_FADE_S),
    })
  },

  resize(state, size, gl) {
    state.width = size.width
    state.height = size.height
    const { cols, rows } = gridFor(size.width, size.height)
    if (cols === state.film.cols && rows === state.film.rows) return
    // Resample rather than re-form: a window changing size must not restart the piece.
    state.film = resampleFilm(state.film, cols, rows)
    allocThickness(gl, state.res, cols, rows)
  },

  update(state, cfg) {
    const prev = state.cfg
    state.cfg = cfg
    // ⚠️ There is NO debounce between a slider and update(), so every intermediate value
    // of a drag runs this. Nothing here may rebuild the field.
    if (prev.filmIndex !== cfg.filmIndex || prev.illuminant !== cfg.illuminant) {
      uploadLut(state.gl, state.res, buildColorLut(cfg.filmIndex, cfg.illuminant))
    }
    return true
  },

  teardown(state) {
    disposeGL(state.gl, state.res)
  },
})

export default soapFilm
