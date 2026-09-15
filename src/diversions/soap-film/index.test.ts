import { describe, expect, it } from 'vitest'
import { makeGLContext } from '../../test-setup'
import soapFilm from './index'
import { meta } from './meta'
import { soapFilmSchema, type SoapFilmConfig } from './schema'

const SIZE = { width: 640, height: 400 }

describe('soap-film wiring', () => {
  it('spreads meta rather than restating it', () => {
    expect(soapFilm.id).toBe(meta.id)
    expect(soapFilm.title).toBe(meta.title)
    expect(soapFilm.kind).toBe('webgl')
  })

  it('applies every field live, without rebuilding the field', () => {
    // ⚠️ There is NO debounce between a slider and update(), so every intermediate value
    // of a drag runs this. A rebuild here costs a full rescan AND visibly restarts the
    // piece under the cursor.
    const gl = makeGLContext()
    const cfg = soapFilmSchema.parse({})
    const state = soapFilm.setup!(gl, cfg, SIZE)
    const before = state.film.h
    const changes: Partial<SoapFilmConfig>[] = [
      { mobility: 0.3 }, { drainRate: 2.2 }, { tempo: 3 }, { filmThickness: 700 },
      { rupture: 'Slow' }, { illuminant: 'Tungsten' }, { exposure: 2.1 },
      { background: '#010203' }, { filmIndex: 1.41 }, { seed: 99 },
    ]
    for (const change of changes) {
      const key = Object.keys(change)[0]
      expect(soapFilm.update!(state, { ...cfg, ...change }, SIZE), `${key} must apply live`).toBeTruthy()
    }
    expect(state.film.h, 'update() must not reallocate the thickness field').toBe(before)
  })

  it('a resize resamples rather than re-forms', () => {
    const gl = makeGLContext()
    const cfg = soapFilmSchema.parse({})
    const state = soapFilm.setup!(gl, cfg, SIZE)
    for (let i = 0; i < 300; i++) soapFilm.frame!(state, gl, 0, 16)
    const mean = (h: Float32Array) => { let s = 0; for (const v of h) s += v; return s / h.length }
    const before = mean(state.film.h)
    soapFilm.resize!(state, { width: 1920, height: 600 }, gl)
    expect(Math.abs(mean(state.film.h) - before) / before).toBeLessThan(0.05)
    expect(state.film.cols / state.film.rows).toBeGreaterThan(2)
  })

  it('frame() sets the viewport every call', () => {
    // The backing store can change under us at any time; resize is observer-driven.
    const gl = makeGLContext()
    const state = soapFilm.setup!(gl, soapFilmSchema.parse({}), SIZE)
    const n0 = gl.calls.filter((c: string) => c === 'viewport').length
    soapFilm.frame!(state, gl, 0, 16)
    soapFilm.frame!(state, gl, 16, 16)
    expect(gl.calls.filter((c: string) => c === 'viewport').length - n0).toBe(2)
  })

  it('tempo scales the simulation, and dt is milliseconds', () => {
    const gl = makeGLContext()
    const cfg = soapFilmSchema.parse({})
    const mean = (h: Float32Array) => { let s = 0; for (const v of h) s += v; return s / h.length }
    const slow = soapFilm.setup!(gl, { ...cfg, tempo: 1 }, SIZE)
    const fast = soapFilm.setup!(gl, { ...cfg, tempo: 4 }, SIZE)
    for (let i = 0; i < 200; i++) {
      soapFilm.frame!(slow, gl, i * 16, 16)
      soapFilm.frame!(fast, gl, i * 16, 16)
    }
    // 200 frames at 16 ms is 3.2 s at tempo 1 — if dt were read as seconds this would be
    // 3200 s and both films would be long gone.
    expect(mean(fast.film.h)).toBeLessThan(mean(slow.film.h))
    expect(mean(slow.film.h)).toBeGreaterThan(cfg.filmThickness * 0.8)
  })

  it('teardown frees the GL resources', () => {
    const gl = makeGLContext()
    const state = soapFilm.setup!(gl, soapFilmSchema.parse({}), SIZE)
    const n0 = gl.calls.filter((c: string) => c === 'deleteTexture').length
    soapFilm.teardown!(state)
    expect(gl.calls.filter((c: string) => c === 'deleteTexture').length - n0).toBe(2)
  })
})
