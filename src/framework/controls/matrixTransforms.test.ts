import { describe, it, expect } from 'vitest'
import { allAttract, allRepel, identity, chase, randomize, invert } from './matrixTransforms'

describe('matrix preset transforms (#220)', () => {
  it('allAttract / allRepel fill the whole n×n grid', () => {
    expect(allAttract(3)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(allRepel(3)).toEqual([-1, -1, -1, -1, -1, -1, -1, -1, -1])
  })

  it('identity is self-attract, cross-repel', () => {
    // rows: [+1,-1,-1] [-1,+1,-1] [-1,-1,+1]
    expect(identity(3)).toEqual([1, -1, -1, -1, 1, -1, -1, -1, 1])
  })

  it('chase attracts the next species, repels the previous (cyclic)', () => {
    const m = chase(3)
    const at = (i: number, j: number) => m[i * 3 + j]
    for (let i = 0; i < 3; i++) {
      expect(at(i, (i + 1) % 3)).toBe(1) // attracts next
      expect(at(i, (i + 2) % 3)).toBe(-1) // (i+2)%3 === i-1: repels previous
      expect(at(i, i)).toBe(0) // ignores self
    }
  })

  it('randomize fills n² cells within −1…1 and honors an injected rng', () => {
    const m = randomize(4, () => 0.75)
    expect(m).toHaveLength(16)
    expect(m.every((v) => v === 0.5)).toBe(true) // 0.75*2-1
    const r = randomize(5)
    expect(r.every((v) => v >= -1 && v <= 1)).toBe(true)
  })

  it('invert negates the current matrix in place-agnostic fashion', () => {
    expect(invert([0.4, -0.2, 1, -1])).toEqual([-0.4, 0.2, -1, 1])
  })
})
