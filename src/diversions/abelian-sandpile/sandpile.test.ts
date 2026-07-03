import { describe, it, expect } from 'vitest'
import {
  createSandpileState, stepSandpile, addGrains, dumpPile, renderOffscreen, computeSources, buildLUT,
} from './sandpile'
import type { AbelianSandpileConfig } from './schema'

// Build a config directly (bypassing the schema's min-detail clamp) so tests can
// use a tiny grid that's easy to reason about.
const cfg = (over: Partial<AbelianSandpileConfig> = {}): AbelianSandpileConfig => ({
  // hold long by default so a crystallized pile doesn't immediately reset mid-test;
  // the lifecycle test overrides hold to 0 to exercise the reset.
  speed: 8, sources: 1, detail: 5, hold: 999, seed: 1,
  stops: ['#000000', '#333333', '#999999', '#ffffff'],
  ...over,
})

describe('computeSources', () => {
  it('places one source dead-center', () => {
    expect(computeSources(101, 1, 5)[0]).toBe(50 * 101 + 50)
  })
  it('is deterministic per seed and varies with seed for multiple sources', () => {
    expect(computeSources(101, 3, 7)).toEqual(computeSources(101, 3, 7))
    expect(computeSources(101, 3, 7)).not.toEqual(computeSources(101, 3, 8))
    expect(computeSources(101, 3, 7).length).toBe(3)
  })
})

describe('buildLUT', () => {
  it('bakes 4 grain-counts, opaque, dark→bright', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut.length).toBe(4 * 4)
    expect(lut[3]).toBe(255)
    expect(lut[0]).toBeLessThan(lut[3 * 4])
  })
})

describe('stepSandpile — toppling', () => {
  it('topples a cell of exactly 4 into one grain per neighbour', () => {
    const st = createSandpileState(cfg({ detail: 5 }), 400, 300)
    addGrains(st, 12, 4) // center of a 5×5 grid
    stepSandpile(st, 16)
    expect(st.grid[12]).toBe(0)
    expect(st.grid[7]).toBe(1)  // up
    expect(st.grid[17]).toBe(1) // down
    expect(st.grid[11]).toBe(1) // left
    expect(st.grid[13]).toBe(1) // right
  })

  it('fully stabilizes an avalanche (abelian): grains conserved, every cell < 4', () => {
    const st = createSandpileState(cfg({ detail: 101 }), 400, 300)
    addGrains(st, 50 * 101 + 50, 16) // 16 at center, far from the edge
    stepSandpile(st, 16) // budget (8×30k) >> need → stabilizes this frame
    let total = 0
    let max = 0
    for (let i = 0; i < st.grid.length; i++) {
      total += st.grid[i]
      if (st.grid[i] > max) max = st.grid[i]
    }
    expect(total).toBe(16)
    expect(max).toBeLessThan(4)
    expect(st.qHead).toBe(st.qTail)
  })

  it('crystallizes a dumped pile, then holds and regrows (reset lifecycle)', () => {
    const st = createSandpileState(cfg({ detail: 5, hold: 0 }), 400, 300)
    dumpPile(st)
    for (let i = 0; i < 40; i++) stepSandpile(st, 16)
    expect(st.reseeds).toBeGreaterThan(0) // cycled at least once
  })

  it('full repaint clears dirty flags so cells touched that frame keep repainting', () => {
    const st = createSandpileState(cfg({ detail: 11 }), 400, 300)
    addGrains(st, 60, 2)   // mark cell 60 dirty (flag set, added to the list)
    st.fullRepaint = true  // e.g. first frame of a cycle, or a live color change
    renderOffscreen(st)    // repaints all cells — must also clear the dirty flags
    expect(st.dirtyFlag[60]).toBe(0)
    addGrains(st, 60, 1)   // a later change to the same cell must re-enter the list
    expect(st.dirtyCount).toBe(1)
  })
})
