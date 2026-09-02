import { describe, it, expect } from 'vitest'
import { makeGrid, PICTURE, cellIndex } from './grid'
import { bfs, pathTo, approachCell } from './nav'

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
