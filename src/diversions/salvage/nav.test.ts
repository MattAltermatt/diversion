import { describe, it, expect } from 'vitest'
import { makeGrid, PICTURE, cellIndex } from './grid'
import { bfs, pathTo, approachCell, lineClear, smoothPath } from './nav'

const scratch = (n: number) => ({ dist: new Int32Array(n), prev: new Int32Array(n), queue: new Int32Array(n) })

describe('bfs + pathTo', () => {
  it('measures path distance around an obstacle and reconstructs a 4-connected free path', () => {
    const g = makeGrid(5, 3)
    g.occ[cellIndex(g, 2, 0)] = PICTURE
    g.occ[cellIndex(g, 2, 1)] = PICTURE
    const s = scratch(15)
    const start = cellIndex(g, 0, 0), goal = cellIndex(g, 4, 0)
    bfs(g, start, s.dist, s.prev, s.queue)
    expect(s.dist[goal]).toBe(8)
    expect(s.dist[cellIndex(g, 2, 0)]).toBe(-1)
    const path = pathTo(s.prev, start, goal)
    expect(path.length).toBe(8)
    expect(path[path.length - 1]).toBe(goal)
    let cur = start
    for (const next of path) {
      expect(g.occ[next]).toBe(0)
      expect(Math.abs((next % 5) - (cur % 5)) + Math.abs(Math.floor(next / 5) - Math.floor(cur / 5))).toBe(1)
      cur = next
    }
    expect(pathTo(s.prev, start, start)).toEqual([])
  })
})

describe('approachCell', () => {
  it('returns the nearest reachable free cell touching the piece, or -1', () => {
    const g = makeGrid(7, 5)
    const piece = Int32Array.from([cellIndex(g, 3, 2), cellIndex(g, 4, 2)])
    for (const i of piece) g.occ[i] = PICTURE
    const s = scratch(35)
    bfs(g, cellIndex(g, 0, 2), s.dist, s.prev, s.queue)
    expect(approachCell(g, s.dist, piece)).toBe(cellIndex(g, 2, 2))
    for (const [c, r] of [[2, 2], [5, 2], [3, 1], [4, 1], [3, 3], [4, 3]]) g.occ[cellIndex(g, c, r)] = PICTURE
    bfs(g, cellIndex(g, 0, 0), s.dist, s.prev, s.queue)
    expect(approachCell(g, s.dist, piece)).toBe(-1)
  })
})

describe('lineClear', () => {
  it('is true across open ground and false through a blocked cell', () => {
    const g = makeGrid(6, 6)
    expect(lineClear(g, 0.5, 0.5, 5.5, 3.5)).toBe(true)
    g.occ[cellIndex(g, 3, 2)] = PICTURE
    expect(lineClear(g, 0.5, 0.5, 5.5, 3.5)).toBe(false)
    expect(lineClear(g, 0.5, 0.5, 5.5, 0.5)).toBe(true)
  })
  it('refuses to squeeze diagonally between two blocked cells that touch at a corner', () => {
    const g = makeGrid(3, 3)
    g.occ[cellIndex(g, 1, 0)] = PICTURE
    g.occ[cellIndex(g, 0, 1)] = PICTURE
    expect(lineClear(g, 0.5, 0.5, 1.5, 1.5)).toBe(false)
    expect(lineClear(g, 0.5, 0.5, 2.5, 2.5)).toBe(false)
  })
  it('a corner crossing checks BOTH side cells, not just the one the walk steps through', () => {
    // Mutation-checked: with the corner branch deleted the walk steps into the OPEN side
    // cell and reports the diagonal clear, so blocking only one side is what guards it.
    for (const [bc, br] of [[1, 0], [0, 1]]) {
      const g = makeGrid(3, 3)
      g.occ[cellIndex(g, bc, br)] = PICTURE
      expect(lineClear(g, 0.5, 0.5, 1.5, 1.5)).toBe(false)
      expect(lineClear(g, 1.5, 1.5, 0.5, 0.5)).toBe(false)
    }
  })
  it('a zero-length line is clear on a walkable cell only', () => {
    const g = makeGrid(2, 2)
    expect(lineClear(g, 0.5, 0.5, 0.5, 0.5)).toBe(true)
    g.occ[0] = PICTURE
    expect(lineClear(g, 0.5, 0.5, 0.5, 0.5)).toBe(false)
  })
})

describe('smoothPath', () => {
  const s = (n: number) => ({ dist: new Int32Array(n), prev: new Int32Array(n), queue: new Int32Array(n) })
  it('collapses a staircase across open ground to its goal alone', () => {
    const g = makeGrid(10, 10)
    const start = cellIndex(g, 0, 0), goal = cellIndex(g, 7, 5)
    const sc = s(100)
    bfs(g, start, sc.dist, sc.prev, sc.queue)
    const path = pathTo(sc.prev, start, goal)
    expect(path.length).toBe(12)
    expect(smoothPath(g, 0.5, 0.5, path)).toEqual([goal])
  })
  it('bends around an obstacle: fewer waypoints, same goal, every leg clear, order kept', () => {
    const g = makeGrid(10, 10)
    for (let r = 0; r < 8; r++) g.occ[cellIndex(g, 4, r)] = PICTURE
    const start = cellIndex(g, 0, 0), goal = cellIndex(g, 9, 0)
    const sc = s(100)
    bfs(g, start, sc.dist, sc.prev, sc.queue)
    const path = pathTo(sc.prev, start, goal)
    const out = smoothPath(g, 0.5, 0.5, path)
    expect(out.length).toBeGreaterThan(1)
    expect(out.length).toBeLessThan(path.length)
    expect(out[out.length - 1]).toBe(goal)
    let last = -1
    for (const c of out) { const i = path.indexOf(c); expect(i).toBeGreaterThan(last); last = i }
    let px = 0.5, py = 0.5
    for (const c of out) {
      const x = (c % 10) + 0.5, y = Math.floor(c / 10) + 0.5
      expect(lineClear(g, px, py, x, y)).toBe(true)
      px = x; py = y
    }
  })
  it('starts from where the walker actually stands, not its cell centre', () => {
    // A wall ends at row 1; from the top of cell (0,0) the goal is in view, from its
    // bottom the corner of the wall is in the way.
    const g = makeGrid(6, 3)
    g.occ[cellIndex(g, 2, 1)] = PICTURE
    g.occ[cellIndex(g, 2, 2)] = PICTURE
    const start = cellIndex(g, 0, 0), goal = cellIndex(g, 5, 1)
    const sc = s(18)
    bfs(g, start, sc.dist, sc.prev, sc.queue)
    const path = pathTo(sc.prev, start, goal)
    expect(smoothPath(g, 0.5, 0.1, path)).toEqual([goal])
    expect(smoothPath(g, 0.5, 0.95, path).length).toBeGreaterThan(1)
  })
  it('wraps a large block in a few legs, every leg clear (the doubling/bisect probe)', () => {
    const g = makeGrid(120, 80)
    for (let c = 30; c < 90; c++) for (let r = 10; r < 60; r++) g.occ[cellIndex(g, c, r)] = PICTURE
    const start = cellIndex(g, 5, 40), goal = cellIndex(g, 115, 40)
    const sc = s(120 * 80)
    bfs(g, start, sc.dist, sc.prev, sc.queue)
    const path = pathTo(sc.prev, start, goal)
    expect(path.length).toBeGreaterThan(120)
    const out = smoothPath(g, 5.5, 40.5, path)
    expect(out.length).toBeLessThanOrEqual(4)
    expect(out[out.length - 1]).toBe(goal)
    let px = 5.5, py = 40.5
    for (const c of out) {
      const x = (c % 120) + 0.5, y = Math.floor(c / 120) + 0.5
      expect(lineClear(g, px, py, x, y)).toBe(true)
      px = x; py = y
    }
  })
  it('passes short paths through', () => {
    const g = makeGrid(3, 3)
    expect(smoothPath(g, 0.5, 0.5, [])).toEqual([])
    expect(smoothPath(g, 0.5, 0.5, [4])).toEqual([4])
  })
})
