import { describe, expect, it, vi } from 'vitest'
import { makeGLContext } from '../../test-setup'
import { createFilm, type FilmParams } from './film'
import { allocThickness, disposeGL, initGL, render, uploadLut, uploadThickness } from './gl'
import { buildColorLut } from './optics'

const P: FilmParams = { mobility: 1, drainRate: 1, filmThickness: 900 }

describe('soap-film gl', () => {
  it('allocates with texImage2D and never touches texStorage2D', () => {
    // ⚠️ Asserting on the CALLS, not on the mock's own shape: `expect(gl.texStorage2D)
    // .toBeUndefined()` would be a statement about test-setup.ts and would pass whatever
    // gl.ts did. diversionSmoke sweeps every diversion through this mock with zero
    // exemptions, so the immutable-storage path would throw for the whole gallery.
    const gl = makeGLContext()
    initGL(gl, 64, 40)
    expect(gl.calls).toContain('texImage2D')
    expect(gl.calls).not.toContain('texStorage2D')
  })

  it('uploads the field without allocating after the first call', () => {
    const gl = makeGLContext()
    const res = initGL(gl, 64, 40)
    const f = createFilm(64, 40, 1, P)
    uploadThickness(gl, res, f)
    const first = res.thickData
    uploadThickness(gl, res, f)
    expect(res.thickData).toBe(first)
    expect(res.thickData[0]).toBeCloseTo(f.h[0], 3)
  })

  it('reallocates the reused buffer only when the grid changes', () => {
    const gl = makeGLContext()
    const res = initGL(gl, 64, 40)
    const same = res.thickData
    allocThickness(gl, res, 64, 40)
    expect(res.thickData).toBe(same)
    allocThickness(gl, res, 96, 60)
    expect(res.thickData).not.toBe(same)
    expect(res.thickData.length).toBe(96 * 60)
  })

  it('draws one fullscreen triangle with both textures bound', () => {
    const gl = makeGLContext()
    const res = initGL(gl, 64, 40)
    uploadLut(gl, res, buildColorLut(1.33, 'Daylight'))
    render(gl, res, {
      width: 800, height: 500, filmIndex: 1.33, exposure: 1.4,
      background: '#06080b', rupture: [0, 0, 0, 0], fade: 1,
    })
    expect(gl.calls).toContain('drawArrays')
    expect(gl.calls.filter((c: string) => c === 'bindTexture').length).toBeGreaterThanOrEqual(2)
  })

  it('sends the background as LINEAR, not sRGB', () => {
    // ⚠️ The mock records call NAMES only, so spy on the uniform setter to see the value.
    // `hexToRgb` returns sRGB-encoded components and the fragment shader encodes on
    // output; passing them through encodes twice and the default #06080b painted as
    // ~#2A323B — the near-black you picked coming out slate grey, through the rupture
    // hole. Nothing read a uniform value before this test, which is how it shipped.
    const gl = makeGLContext()
    const res = initGL(gl, 64, 40)
    const seen: number[][] = []
    const spy = vi.spyOn(gl, 'uniform3f').mockImplementation((...a: unknown[]) => {
      seen.push([a[1], a[2], a[3]] as number[])
    })
    render(gl, res, {
      width: 800, height: 500, filmIndex: 1.33, exposure: 1,
      background: '#808080', rupture: [0, 0, 0, 0], fade: 1,
    })
    spy.mockRestore()
    expect(seen.length).toBe(1)
    // mid grey: 128/255 = 0.502 encoded -> 0.502^2.2 = 0.216 linear
    for (const c of seen[0]) expect(c).toBeCloseTo(0.216, 2)
  })

  it('disposeGL deletes everything initGL created', () => {
    const gl = makeGLContext()
    const delTex = vi.spyOn(gl, 'deleteTexture')
    const delProg = vi.spyOn(gl, 'deleteProgram')
    const delVao = vi.spyOn(gl, 'deleteVertexArray')
    const res = initGL(gl, 64, 40)
    disposeGL(gl, res)
    // ⚠️ The VAO counts. CLAUDE.md names VAO leakage across gallery navigation
    // specifically — the context persists on the canvas when the diversion switches.
    expect(delTex).toHaveBeenCalledTimes(2)
    expect(delProg).toHaveBeenCalledTimes(1)
    expect(delVao).toHaveBeenCalledTimes(1)
  })
})
