import { describe, it, expect, vi } from 'vitest'
import { makeGLContext } from '../../test-setup'
import { accSizeFor, gridFor, initGL, resizeTargets, disposeGL, render, RAYS_PER_PX, ACC_MAX_PX } from './gl'
import { causticsSchema } from './schema'
import { buildSpectrum } from './spectrum'

describe('ray budget', () => {
  it('delivers at least RAYS_PER_PX rays per accumulation pixel', () => {
    for (const [w, h] of [[320, 200], [640, 400], [1260, 770], [2048, 1152]]) {
      const { gridW, gridH } = gridFor(w, h)
      expect(gridW * gridH).toBeGreaterThanOrEqual(w * h * RAYS_PER_PX)
    }
  })
  it('keeps the ray grid near the buffer aspect', () => {
    const { gridW, gridH } = gridFor(1260, 770)
    expect(gridW / gridH).toBeCloseTo(1260 / 770, 1)
  })
  it('never degenerates on a tiny gallery tile', () => {
    const { gridW, gridH } = gridFor(2, 2)
    expect(gridW).toBeGreaterThanOrEqual(8); expect(gridH).toBeGreaterThanOrEqual(8)
  })
  // Uncapped, a 5K display asks for 36M point primitives per frame. The 1.02
  // slack is load-bearing: 5120x2880 lands at 720,447 because both axes round up.
  it('caps the accumulation buffer on big displays, preserving aspect', () => {
    for (const [w, h] of [[2880, 1800], [3840, 2160], [5120, 2880], [7680, 4320]]) {
      const { accW, accH } = accSizeFor(w, h)
      expect(accW * accH, `${w}x${h}`).toBeLessThanOrEqual(ACC_MAX_PX * 1.02)
      expect(accW / accH).toBeCloseTo(w / h, 1)
      const g = gridFor(accW, accH)
      expect(g.gridW * g.gridH).toBeLessThanOrEqual(ACC_MAX_PX * RAYS_PER_PX * 1.05)
    }
  })
  // Renamed from 'does not cap a normal window', which encoded a wrong belief in
  // the wrong units: accSizeFor is called with DEVICE pixels (AnimationHost hands
  // `webgl` device px), so a "normal window" at the call site is 2880x1800 and IS
  // capped. The uncapped branch is the DPR-1 case.
  it('does not cap a DPR-1 window', () => {
    const { accW, accH } = accSizeFor(1440, 900)
    expect(accW).toBe(Math.round(1440 * 0.42)); expect(accH).toBe(Math.round(900 * 0.42))
  })

  // The threshold is ACC_MAX_PX / ACC_SCALE^2 = 4.08 M device px, i.e. every DPR-2
  // display wider than ~1278 CSS px -- including the machine the look was approved
  // on. Pinned because the cap's whole job is holding the ray budget at the
  // mockup's measured-good ~10 M there, and nothing else asserts it binds at all.
  it('DOES cap an ordinary retina laptop, at the mockup ray budget', () => {
    const { accW, accH } = accSizeFor(2880, 1800)
    expect(accW * accH).toBeLessThanOrEqual(ACC_MAX_PX * 1.02)
    expect(accW).toBeLessThan(Math.round(2880 * 0.42))
    const { gridW, gridH } = gridFor(accW, accH)
    expect(gridW * gridH / 1e6).toBeGreaterThan(9.5)
    expect(gridW * gridH / 1e6).toBeLessThan(10.6)
  })
})

describe('float requirement', () => {
  // There is NO R8 path. A normalized 8-bit target saturates on its FIRST ray
  // under blendFunc(ONE,ONE), so `e` resolves to 1/14 and x = max(e-0.88,0) = 0:
  // flat water, no caustic, no GL error, forever. Six diversions already throw.
  it('throws when neither float colour extension is present', () => {
    const gl = makeGLContext()
    gl.getExtension = (() => null) as typeof gl.getExtension
    expect(() => initGL(gl)).toThrow(/float render targets/i)
  })
  it('accepts EXT_color_buffer_half_float alone', () => {
    const gl = makeGLContext()
    gl.getExtension = ((name: string) =>
      name === 'EXT_color_buffer_half_float' ? { __mock: 'ext' } : null) as typeof gl.getExtension
    expect(() => initGL(gl)).not.toThrow()
  })
  it('allocates the accumulation target as R16F', () => {
    const gl = makeGLContext()
    const texImage2D = vi.spyOn(gl, 'texImage2D')
    const res = initGL(gl)
    resizeTargets(gl, res, 800, 600)
    expect(texImage2D).toHaveBeenCalled()
    const call = texImage2D.mock.calls[0]
    expect(call[2]).toBe(gl.R16F)
  })
})

describe('lifecycle', () => {
  it('frees every GL object it created', () => {
    const gl = makeGLContext()
    const deleteProgram = vi.spyOn(gl, 'deleteProgram')
    const deleteVertexArray = vi.spyOn(gl, 'deleteVertexArray')
    const deleteTexture = vi.spyOn(gl, 'deleteTexture')
    const deleteFramebuffer = vi.spyOn(gl, 'deleteFramebuffer')
    const res = initGL(gl)
    resizeTargets(gl, res, 800, 600)
    disposeGL(gl, res)
    expect(deleteProgram).toHaveBeenCalledTimes(2)
    expect(deleteVertexArray).toHaveBeenCalledTimes(1)
    expect(deleteTexture).toHaveBeenCalledTimes(1)
    expect(deleteFramebuffer).toHaveBeenCalledTimes(1)
  })
  it('does not leak the previous target across a resize', () => {
    const gl = makeGLContext()
    const res = initGL(gl)
    const deleteTexture = vi.spyOn(gl, 'deleteTexture')
    resizeTargets(gl, res, 800, 600)
    resizeTargets(gl, res, 900, 700)
    expect(deleteTexture).toHaveBeenCalledTimes(1)
  })
  it('tolerates dispose before any resize', () => {
    // ONE context: disposing resources created by a different mock still asserted
    // what it claimed, but it did not mirror the real call.
    const gl = makeGLContext()
    expect(() => disposeGL(gl, initGL(gl))).not.toThrow()
  })

  // The same-size early return. Without it a ResizeObserver fire that reports an
  // unchanged size would reallocate a 1.44 MB R16F target every time, and nothing
  // else in the suite would go red.
  it('does not reallocate the target when the size is unchanged', () => {
    const gl = makeGLContext()
    const res = initGL(gl)
    resizeTargets(gl, res, 800, 600)
    const made = gl.calls.filter((c) => c === 'createTexture').length
    resizeTargets(gl, res, 800, 600)
    expect(gl.calls.filter((c) => c === 'createTexture').length).toBe(made)
  })
})

// Nothing else in this diversion inspects a uniform -- schema.ts's own FLOOR_INDEX
// comment says plainly that a mapping sending Plain -> 0 "renders the wrong floor
// and passes every test in this diversion". A comment naming an unguarded failure
// is a test, unwritten. Mock uniform locations are indistinguishable handles, so
// assert on VALUES in call order, never on locations.
describe('resolve uniforms', () => {
  const uploadsFor = (floor: 'Tile' | 'Plain' | 'Sand') => {
    const gl = makeGLContext()
    const ints: number[] = []
    const floats: number[] = []
    ;(gl as unknown as Record<string, unknown>).uniform1i = (_l: unknown, v: number) => { ints.push(v) }
    ;(gl as unknown as Record<string, unknown>).uniform1f = (_l: unknown, v: number) => { floats.push(v) }
    const res = initGL(gl)
    resizeTargets(gl, res, 800, 600)
    const cfg = causticsSchema.parse({ floor })
    render(gl, res, cfg, buildSpectrum(cfg), 0)
    return { ints, floats, res }
  }

  it('maps the floor enum to the branch RESOLVE_FS actually tests', () => {
    // uniform1i order in render(): uAcc (sampler, 0), then uFloor.
    expect(uploadsFor('Tile').ints).toEqual([0, 0])
    expect(uploadsFor('Plain').ints).toEqual([0, 1])
    expect(uploadsFor('Sand').ints).toEqual([0, 2])
  })

  it('uploads uMean as the true rays-per-accumulation-pixel', () => {
    const { floats, res } = uploadsFor('Tile')
    expect(floats).toContain(res.nPoints / (res.accW * res.accH))
  })
})
