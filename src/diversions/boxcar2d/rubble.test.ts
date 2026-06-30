import { describe, it, expect } from 'vitest'
import { makeRubbleLayout } from './rubble'

describe('makeRubbleLayout', () => {
  it('is null when density is 0 (no rubble, zero cost)', () => {
    expect(makeRubbleLayout(1, 0)).toBeNull()
  })
  it('is deterministic for a seed (same layout every car / reset)', () => {
    const a = makeRubbleLayout(7, 4)!
    const b = makeRubbleLayout(7, 4)!
    for (let s = 0; s < 50; s++) {
      expect(a.blockX(s)).toBe(b.blockX(s))
      expect(a.blockSize(s)).toBe(b.blockSize(s))
    }
  })
  it('different seeds give different layouts', () => {
    const a = makeRubbleLayout(7, 4)!
    const c = makeRubbleLayout(8, 4)!
    let differs = false
    for (let s = 0; s < 50; s++) if (a.blockX(s) !== c.blockX(s)) differs = true
    expect(differs).toBe(true)
  })
  it('blockX is strictly increasing in slot', () => {
    const L = makeRubbleLayout(3, 6)!
    for (let s = 0; s < 80; s++) expect(L.blockX(s + 1)).toBeGreaterThan(L.blockX(s))
  })
  it('higher density packs blocks closer', () => {
    const sparse = makeRubbleLayout(2, 2)!
    const dense = makeRubbleLayout(2, 8)!
    const spanSparse = sparse.blockX(10) - sparse.blockX(0)
    const spanDense = dense.blockX(10) - dense.blockX(0)
    expect(spanDense).toBeLessThan(spanSparse)
  })
})
