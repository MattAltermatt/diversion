import { describe, it, expect } from 'vitest'
import { mazeSchema } from './schema'
import {
  generateMaze, floodSolve, wallFollowerSolve, solveOps, mazeLayout, isOpen,
  N, E, S, W, type Generator, type Solver,
} from './maze'

const GENERATORS: Generator[] = ['dfs', 'prim', 'wilson']
const SOLVERS: Solver[] = ['flood', 'wall-follower']
const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E }

// walk from cell a to adjacent cell b: returns the direction, or -1 if not adjacent
function dirBetween(cols: number, a: number, b: number): number {
  const ax = a % cols, ay = (a / cols) | 0, bx = b % cols, by = (b / cols) | 0
  if (bx === ax + 1 && by === ay) return E
  if (bx === ax - 1 && by === ay) return W
  if (by === ay + 1 && bx === ax) return S
  if (by === ay - 1 && bx === ax) return N
  return -1
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    const cfg = mazeSchema.parse({})
    expect(cfg.cellSize).toBe(22)
    expect(cfg.generator).toBe('dfs')
    expect(cfg.solver).toBe('flood')
    expect(cfg.wallColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.pathColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.solvedColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    // every field carries meta so the form + codec can drive it
    for (const key of Object.keys(mazeSchema.shape)) {
      expect((mazeSchema.shape as Record<string, { meta(): unknown }>)[key].meta()).toBeTruthy()
    }
  })

  it('marks seed as randomizeOnFreshLoad (pin-only)', () => {
    const meta = mazeSchema.shape.seed.meta() as { randomizeOnFreshLoad?: boolean }
    expect(meta.randomizeOnFreshLoad).toBe(true)
  })
})

describe('mazeLayout', () => {
  it('fits a centred square grid with a sane minimum', () => {
    const lay = mazeLayout(1200, 800, 22)
    expect(lay.cols).toBeGreaterThanOrEqual(3)
    expect(lay.rows).toBeGreaterThanOrEqual(3)
    expect(lay.p).toBe(22)
    expect(lay.ox).toBeGreaterThanOrEqual(0)
    expect(lay.oy).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(lay.ox)).toBe(false)
    // tiny viewport still yields the 3×3 floor
    const tiny = mazeLayout(20, 20, 22)
    expect(tiny.cols).toBe(3)
    expect(tiny.rows).toBe(3)
  })
})

describe('determinism', () => {
  it.each(GENERATORS)('same seed → identical maze (%s)', (gen) => {
    const a = generateMaze(7, 24, 18, gen)
    const b = generateMaze(7, 24, 18, gen)
    expect(Array.from(a.maze.cells)).toEqual(Array.from(b.maze.cells))
    expect(Array.from(a.edgeCell)).toEqual(Array.from(b.edgeCell))
    expect(Array.from(a.edgeDir)).toEqual(Array.from(b.edgeDir))
  })

  it.each(GENERATORS)('different seed → different maze (%s)', (gen) => {
    const a = generateMaze(1, 24, 18, gen)
    const b = generateMaze(2, 24, 18, gen)
    expect(Array.from(a.maze.cells)).not.toEqual(Array.from(b.maze.cells))
  })

  it.each(SOLVERS)('same seed → identical solve reveal (%s)', (solver) => {
    const m1 = generateMaze(9, 20, 16, 'dfs').maze
    const m2 = generateMaze(9, 20, 16, 'dfs').maze
    const o1 = solveOps(m1, solver)
    const o2 = solveOps(m2, solver)
    expect(Array.from(o1.cells)).toEqual(Array.from(o2.cells))
    expect(Array.from(o1.kinds)).toEqual(Array.from(o2.kinds))
  })
})

describe('headline: generated maze is PERFECT (a spanning tree)', () => {
  it.each(GENERATORS)('%s: n-1 edges, fully connected, acyclic, no NaN', (gen) => {
    const cols = 26, rows = 20, n = cols * rows
    const { maze, edgeCell, edgeDir } = generateMaze(1234, cols, rows, gen)

    // exactly n-1 carve steps → a tree has exactly n-1 edges
    expect(edgeCell.length).toBe(n - 1)
    expect(edgeDir.length).toBe(n - 1)

    // count OPEN passages by scanning wall bits; must also equal n-1 (no cycles).
    // Each interior passage is shared by two cells, so count once per (cell,dir)
    // where dir ∈ {E,S} (right/down) to avoid double-counting.
    let openPassages = 0
    for (let i = 0; i < n; i++) {
      const x = i % cols, y = (i / cols) | 0
      if (x < cols - 1 && isOpen(maze.cells, i, E)) openPassages++
      if (y < rows - 1 && isOpen(maze.cells, i, S)) openPassages++
      expect(Number.isNaN(maze.cells[i])).toBe(false)
    }
    expect(openPassages).toBe(n - 1)

    // connectivity: BFS from entrance reaches every cell (order length === n)
    const { order } = floodSolve(maze)
    expect(order.length).toBe(n)

    // shared walls are consistent (if a→b is open, b→a is open)
    for (let i = 0; i < n; i++) {
      const x = i % cols, y = (i / cols) | 0
      for (const dir of [E, S] as const) {
        const nx = x + (dir === E ? 1 : 0), ny = y + (dir === S ? 1 : 0)
        if (nx >= cols || ny >= rows) continue
        const ni = ny * cols + nx
        expect(isOpen(maze.cells, i, dir)).toBe(isOpen(maze.cells, ni, OPP[dir]))
      }
    }
  })
})

describe('solvers find a valid entrance → exit path', () => {
  const cols = 22, rows = 18, n = cols * rows
  const maze = generateMaze(555, cols, rows, 'prim').maze

  it('flood: unique shortest path, every step adjacent through an open wall', () => {
    const { path, exitReachedAt, order } = floodSolve(maze)
    expect(path[0]).toBe(0)
    expect(path[path.length - 1]).toBe(n - 1)
    expect(exitReachedAt).toBeGreaterThanOrEqual(0)
    expect(order[exitReachedAt]).toBe(n - 1)
    for (let k = 1; k < path.length; k++) {
      const dir = dirBetween(cols, path[k - 1], path[k])
      expect(dir).not.toBe(-1)
      expect(isOpen(maze.cells, path[k - 1], dir)).toBe(true)
      expect(Number.isNaN(path[k])).toBe(false)
    }
  })

  it('wall-follower: reaches the exit, every step legal', () => {
    const { trail, reached } = wallFollowerSolve(maze)
    expect(reached).toBe(true)
    expect(trail[0]).toBe(0)
    expect(trail[trail.length - 1]).toBe(n - 1)
    for (let k = 1; k < trail.length; k++) {
      const dir = dirBetween(cols, trail[k - 1], trail[k])
      expect(dir).not.toBe(-1)
      expect(isOpen(maze.cells, trail[k - 1], dir)).toBe(true)
    }
  })
})
