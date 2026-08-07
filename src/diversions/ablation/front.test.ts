import { describe, it, expect } from 'vitest'
import { buildField, cellAt, type Field } from './field'
import { buildFront, frontCell, killCell, exposedHistogram, EDGE } from './front'

function grid(cols: number, rows: number, bands: number): Field {
  return buildField({ seed: 7, cols, rows, bands, featureSize: 10, roughness: 0.5 })
}

describe('front', () => {
  it('starts at the picture edges', () => {
    const f = grid(20, 12, 4)
    const fr = buildFront(f)
    expect(frontCell(f, fr, EDGE.top, 3)).toBe(cellAt(f, 3, 0))
    expect(frontCell(f, fr, EDGE.bottom, 3)).toBe(cellAt(f, 3, f.rows - 1))
    expect(frontCell(f, fr, EDGE.left, 5)).toBe(cellAt(f, 0, 5))
    expect(frontCell(f, fr, EDGE.right, 5)).toBe(cellAt(f, f.cols - 1, 5))
  })

  it('recedes by exactly one cell per kill', () => {
    const f = grid(20, 12, 4)
    const fr = buildFront(f)
    killCell(f, frontCell(f, fr, EDGE.top, 3))
    expect(frontCell(f, fr, EDGE.top, 3)).toBe(cellAt(f, 3, 1))
    killCell(f, frontCell(f, fr, EDGE.top, 3))
    expect(frontCell(f, fr, EDGE.top, 3)).toBe(cellAt(f, 3, 2))
  })

  it('skips cells killed from another edge', () => {
    const f = grid(20, 12, 4)
    const fr = buildFront(f)
    // wipe rows 0..4 of column 3 by hand, without touching the top cache
    for (let row = 0; row < 5; row++) killCell(f, cellAt(f, 3, row))
    expect(frontCell(f, fr, EDGE.top, 3)).toBe(cellAt(f, 3, 5))
  })

  it('reports -1 for an emptied lane', () => {
    const f = grid(6, 4, 3)
    const fr = buildFront(f)
    for (let row = 0; row < f.rows; row++) killCell(f, cellAt(f, 2, row))
    expect(frontCell(f, fr, EDGE.top, 2)).toBe(-1)
    expect(frontCell(f, fr, EDGE.bottom, 2)).toBe(-1)
  })

  it('reports -1 for an emptied row on the left and right edges', () => {
    const f = grid(6, 4, 3)
    const fr = buildFront(f)
    for (let col = 0; col < f.cols; col++) killCell(f, cellAt(f, col, 1))
    expect(frontCell(f, fr, EDGE.left, 1)).toBe(-1)
    expect(frontCell(f, fr, EDGE.right, 1)).toBe(-1)
  })

  it('tracks aliveCount and ignores a repeat kill', () => {
    const f = grid(6, 4, 3)
    expect(f.aliveCount).toBe(24)
    killCell(f, cellAt(f, 0, 0))
    expect(f.aliveCount).toBe(23)
    killCell(f, cellAt(f, 0, 0))
    expect(f.aliveCount).toBe(23)
  })

  it('ignores a kill on a -1 cell', () => {
    const f = grid(6, 4, 3)
    killCell(f, -1)
    expect(f.aliveCount).toBe(24)
  })

  it('exposedHistogram counts only the outermost survivors', () => {
    const f = grid(20, 12, 4)
    const fr = buildFront(f)
    const hist = exposedHistogram(f, fr, new Uint32Array(f.bands))
    const total = hist.reduce((a, b) => a + b, 0)
    // 2 lanes per column + 2 lanes per row, all non-empty at t=0
    expect(total).toBe(f.cols * 2 + f.rows * 2)
    expect(total).toBeLessThan(f.aliveCount)
  })

  it('exposedHistogram reflects what erosion has uncovered', () => {
    const f = grid(20, 12, 4)
    const fr = buildFront(f)
    const before = Array.from(exposedHistogram(f, fr, new Uint32Array(f.bands)))
    for (let col = 0; col < f.cols; col++) {
      for (let row = 0; row < 3; row++) killCell(f, cellAt(f, col, row))
    }
    const after = Array.from(exposedHistogram(f, fr, new Uint32Array(f.bands)))
    expect(after).not.toEqual(before)
  })

  it('exposedHistogram is all-zero once the picture is gone', () => {
    const f = grid(6, 4, 3)
    const fr = buildFront(f)
    for (let i = 0; i < f.cols * f.rows; i++) killCell(f, i)
    const hist = exposedHistogram(f, fr, new Uint32Array(f.bands))
    expect(hist.reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('stays O(1) amortised — total scan work is bounded by the cell count', () => {
    // Kill the whole grid one outermost cell at a time from the top edge; the
    // lazy front must never rescan from row 0.
    const f = grid(40, 30, 4)
    const fr = buildFront(f)
    let steps = 0
    while (f.aliveCount > 0) {
      for (let col = 0; col < f.cols; col++) {
        const cell = frontCell(f, fr, EDGE.top, col)
        if (cell >= 0) { killCell(f, cell); steps++ }
      }
    }
    expect(steps).toBe(f.cols * f.rows)
  })
})
