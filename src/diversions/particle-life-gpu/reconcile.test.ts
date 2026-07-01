import { describe, it, expect } from 'vitest'
import { reconcileMatrix } from './reconcile'
import { particleLifeGpuSchema } from './schema'

const base = () => ({ ...particleLifeGpuSchema.parse({ colors: 3 }), matrix: [0.5,-0.5,1,-1,0,0.25,-0.25,0.75,-0.75] })

describe('reconcileMatrix', () => {
  it('clears the matrix when seed changes', () => {
    const out = reconcileMatrix(base(), { ...base(), seed: 42 })
    expect('matrix' in out).toBe(false)
  })
  it('clears the matrix when species changes', () => {
    const out = reconcileMatrix(base(), { ...base(), colors: 4 })
    expect('matrix' in out).toBe(false)
  })
  it('mirrors upper→lower when flipping to Symmetric', () => {
    const out = reconcileMatrix(base(), { ...base(), symmetry: 'Symmetric' })
    const n = 3, m = out.matrix!
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) expect(m[j*n+i]).toBeCloseTo(m[i*n+j], 5)
  })
  it('leaves the matrix untouched when attractBias changes (defer)', () => {
    const b = base()
    const out = reconcileMatrix(b, { ...b, attractBias: 0.9 })
    expect(out.matrix).toEqual(b.matrix)
  })
  it('passes a plain matrix edit straight through', () => {
    const b = base(); const edited = { ...b, matrix: b.matrix.map(() => 0) }
    expect(reconcileMatrix(b, edited).matrix).toEqual(edited.matrix)
  })
})
