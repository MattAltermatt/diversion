import { describe, it, expect } from 'vitest'
import { hexToRgb, initGL } from './halftone'

describe('hexToRgb', () => {
  it('converts #rrggbb to 0..1 floats', () => {
    expect(hexToRgb('#ff0000')).toEqual([1, 0, 0])
    expect(hexToRgb('#000000')).toEqual([0, 0, 0])
    const [r, g, b] = hexToRgb('#8040c0')
    expect(r).toBeCloseTo(0.502, 2)
    expect(g).toBeCloseTo(0.251, 2)
    expect(b).toBeCloseTo(0.753, 2)
  })
})

// halftone initGL is a verbatim copy of plasma's — guard the same leak fix here (#124).
type Sh = { kind: 'shader'; type: number }
type Prog = { kind: 'program' }

function leakProbeGL(opts: { fsCompiles: boolean; programLinks: boolean }) {
  const deletedShaders: Sh[] = []
  const deletedPrograms: Prog[] = []
  const VERTEX_SHADER = 0x8b31
  const FRAGMENT_SHADER = 0x8b30
  const gl = {
    VERTEX_SHADER,
    FRAGMENT_SHADER,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    createShader: (type: number): Sh => ({ kind: 'shader', type }),
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: (sh: Sh) => (sh.type === VERTEX_SHADER ? true : opts.fsCompiles),
    getShaderInfoLog: () => 'compile log',
    deleteShader: (sh: Sh) => deletedShaders.push(sh),
    createProgram: (): Prog => ({ kind: 'program' }),
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => opts.programLinks,
    getProgramInfoLog: () => 'link log',
    deleteProgram: (p: Prog) => deletedPrograms.push(p),
    createVertexArray: () => ({ kind: 'vao' }),
    getUniformLocation: () => ({ kind: 'loc' }),
  } as unknown as WebGL2RenderingContext
  return { gl, deletedShaders, deletedPrograms, VERTEX_SHADER }
}

describe('initGL leak-free error paths (#124)', () => {
  it('deletes the vertex shader when the fragment shader fails to compile', () => {
    const p = leakProbeGL({ fsCompiles: false, programLinks: true })
    expect(() => initGL(p.gl)).toThrow(/compile failed/)
    expect(p.deletedShaders.some((s) => s.type === p.VERTEX_SHADER)).toBe(true)
  })

  it('deletes the program when linking fails', () => {
    const p = leakProbeGL({ fsCompiles: true, programLinks: false })
    expect(() => initGL(p.gl)).toThrow(/link failed/)
    expect(p.deletedPrograms.length).toBe(1)
  })
})
