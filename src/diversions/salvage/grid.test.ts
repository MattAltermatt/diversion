import { describe, it, expect } from 'vitest'
import { makeGrid, floodReach, cellIndex, PICTURE } from './grid'

describe('floodReach', () => {
  it('marks the outside and not a hole enclosed by picture cells', () => {
    const g = makeGrid(9, 9)
    // A 5x5 ring of PICTURE at (2..6, 2..6) with a 3x3 free hole inside.
    for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) {
      if (r === 2 || r === 6 || c === 2 || c === 6) g.occ[cellIndex(g, c, r)] = PICTURE
    }
    const n = floodReach(g)
    expect(g.reach[cellIndex(g, 0, 0)]).toBe(1)
    expect(g.reach[cellIndex(g, 4, 4)]).toBe(0)
    expect(g.reach[cellIndex(g, 2, 2)]).toBe(0) // occupied, never reachable
    expect(n).toBe(81 - 25)
  })
})
