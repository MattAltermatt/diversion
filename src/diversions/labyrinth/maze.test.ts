import { describe, it, expect } from 'vitest'
import {
  generateMaze, solvePath, rasterizeWalls, rasterizePath, mazeGridFor,
  distanceFromExit, rasterizeAttractant, N, S, E, W,
} from './maze'

describe('generateMaze', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMaze(42, 10, 8)
    const b = generateMaze(42, 10, 8)
    expect(a.cols).toBe(10); expect(a.rows).toBe(8)
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells))
  })

  it('differs across seeds', () => {
    const a = generateMaze(1, 12, 12)
    const b = generateMaze(2, 12, 12)
    expect(Array.from(a.cells)).not.toEqual(Array.from(b.cells))
  })

  it('is fully connected (every cell reachable from 0,0)', () => {
    const m = generateMaze(7, 15, 11)
    const seen = new Uint8Array(m.cols * m.rows)
    const stack = [0]; seen[0] = 1; let count = 0
    while (stack.length) {
      const i = stack.pop()!; count++
      const x = i % m.cols, y = (i / m.cols) | 0, w = m.cells[i]
      if (!(w & N) && y > 0 && !seen[i - m.cols]) { seen[i - m.cols] = 1; stack.push(i - m.cols) }
      if (!(w & S) && y < m.rows - 1 && !seen[i + m.cols]) { seen[i + m.cols] = 1; stack.push(i + m.cols) }
      if (!(w & W) && x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (!(w & E) && x < m.cols - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
    }
    expect(count).toBe(m.cols * m.rows)
  })
})

describe('solvePath', () => {
  it('returns a contiguous path from start to end, each step adjacent', () => {
    const m = generateMaze(7, 12, 9)
    const path = solvePath(m)
    expect(path[0]).toBe(0)
    expect(path[path.length - 1]).toBe(m.cols * m.rows - 1)
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k]
      const ax = a % m.cols, ay = (a / m.cols) | 0
      const bx = b % m.cols, by = (b / m.cols) | 0
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1)
    }
  })
})

describe('distanceFromExit', () => {
  it('is 0 at the exit and equals the solve-path length at the start', () => {
    const m = generateMaze(7, 12, 9)
    const dist = distanceFromExit(m)
    const end = m.cols * m.rows - 1
    expect(dist[end]).toBe(0)
    expect(dist[0]).toBe(solvePath(m).length - 1) // start→exit distance == path edges
    for (const d of dist) expect(d).toBeGreaterThanOrEqual(0) // perfect maze → all reachable
  })

  it('attractant field is 1 at the exit and lower at the start', () => {
    const m = generateMaze(7, 8, 8)
    const { cellPx } = mazeGridFor(8, 64, 64)
    const dist = distanceFromExit(m)
    const field = rasterizeAttractant(m, dist, cellPx)
    const w = m.cols * cellPx, h = m.rows * cellPx
    const c = (cellPx / 2) | 0
    const atExit = field[(h - c) * w + (w - c)]
    const atStart = field[c * w + c]
    expect(atExit).toBeCloseTo(1, 5)
    expect(atStart).toBeLessThan(atExit)
  })
})

describe('mazeGridFor', () => {
  it('keeps cells at least 8 texels', () => {
    const g = mazeGridFor(40, 1000, 800)
    expect(g.cellPx).toBeGreaterThanOrEqual(8)
    expect(g.cols).toBeGreaterThan(0); expect(g.rows).toBeGreaterThan(0)
  })
})

describe('rasterize', () => {
  it('walls mask has a fully-walled top border and an open start-cell centre', () => {
    const m = generateMaze(3, 8, 8)
    const { cellPx } = mazeGridFor(8, 64, 64)
    const w = m.cols * cellPx, h = m.rows * cellPx
    const walls = rasterizeWalls(m, cellPx, 2)
    expect(walls.length).toBe(w * h)
    for (let x = 0; x < w; x++) expect(walls[x]).toBe(255) // top row all wall
    const c = (cellPx / 2) | 0
    expect(walls[c * w + c]).toBe(0) // start-cell centre open
  })

  it('path mask marks the start cell and is the right size', () => {
    const m = generateMaze(3, 8, 8)
    const { cellPx } = mazeGridFor(8, 64, 64)
    const path = solvePath(m)
    const pm = rasterizePath(m, path, cellPx)
    const c = (cellPx / 2) | 0, w = m.cols * cellPx
    expect(pm.length).toBe(w * m.rows * cellPx)
    expect(pm[c * w + c]).toBe(255)
  })
})
