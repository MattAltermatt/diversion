import { describe, it, expect } from 'vitest'
import { advancePhase, tintsToVec3, initGL } from './shader'

describe('advancePhase', () => {
  it('accumulates speed * dt(seconds)', () => {
    // dt is milliseconds; 1000ms at speed 0.5 advances 0.5
    expect(advancePhase(0, 0.5, 1000)).toBeCloseTo(0.5)
    expect(advancePhase(2, 1, 250)).toBeCloseTo(2.25)
  })
  it('is deterministic', () => {
    expect(advancePhase(1.234, 0.3, 16.7)).toBe(advancePhase(1.234, 0.3, 16.7))
  })
  it('wraps to keep float32 precision over long runs', () => {
    // wrap modulus is 1e4; just below it stays, just over wraps near 0
    expect(advancePhase(9999.9, 1, 1000)).toBeCloseTo(0.9, 5) // 10000.9 % 1e4
    expect(advancePhase(0, 1, 1000)).toBeCloseTo(1)
  })
})

describe('tintsToVec3', () => {
  it('flattens up to 8 hex6 colours into a length-24 Float32Array (0..1)', () => {
    const out = tintsToVec3(['#ff0000', '#00ff00'])
    expect(out.length).toBe(24)
    expect(out[0]).toBeCloseTo(1) // r of #ff0000
    expect(out[1]).toBeCloseTo(0)
    expect(out[2]).toBeCloseTo(0)
    expect(out[3]).toBeCloseTo(0) // r of #00ff00
    expect(out[4]).toBeCloseTo(1)
    // unused slots are zero
    expect(out[6]).toBe(0)
  })
  it('clamps the list to 8 slots', () => {
    const many = Array.from({ length: 12 }, () => '#808080')
    const out = tintsToVec3(many)
    expect(out.length).toBe(24) // only first 8 used
    expect(out[0]).toBeCloseTo(0.502, 2)
  })
})

type Sh = { kind: 'shader'; type: number }
type Prog = { kind: 'program' }

function leakProbeGL(opts: { fsCompiles: boolean; programLinks: boolean }) {
  const deletedShaders: Sh[] = []
  const deletedPrograms: Prog[] = []
  const VERTEX_SHADER = 0x8b31
  const FRAGMENT_SHADER = 0x8b30
  const gl = {
    VERTEX_SHADER, FRAGMENT_SHADER, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    createShader: (type: number): Sh => ({ kind: 'shader', type }),
    shaderSource: () => {}, compileShader: () => {},
    getShaderParameter: (sh: Sh) => (sh.type === VERTEX_SHADER ? true : opts.fsCompiles),
    getShaderInfoLog: () => 'compile log',
    deleteShader: (sh: Sh) => deletedShaders.push(sh),
    createProgram: (): Prog => ({ kind: 'program' }),
    attachShader: () => {}, linkProgram: () => {},
    getProgramParameter: () => opts.programLinks,
    getProgramInfoLog: () => 'link log',
    deleteProgram: (p: Prog) => deletedPrograms.push(p),
    createVertexArray: () => ({ kind: 'vao' }),
    getUniformLocation: () => ({ kind: 'loc' }),
  } as unknown as WebGL2RenderingContext
  return { gl, deletedShaders, deletedPrograms, VERTEX_SHADER }
}

describe('initGL leak-free error paths', () => {
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
  it('deletes both shaders on a successful build', () => {
    const p = leakProbeGL({ fsCompiles: true, programLinks: true })
    expect(() => initGL(p.gl)).not.toThrow()
    expect(p.deletedShaders.length).toBe(2)
  })
})
