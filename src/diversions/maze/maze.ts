// Maze — pure, framework-agnostic maze generation + solving (no DOM here, so it
// stays unit-testable and jsdom-safe). A clean-room take on xscreensaver's
// "maze": build a PERFECT maze (a spanning tree — every cell reachable, exactly
// one path between any two cells) recording the carve order so the framework can
// animate the walls receding, then solve it (flood-fill wavefront + shortest-path
// retrace, or a right-hand-rule wall-follower) recording the reveal order so the
// solution can be animated flooding through to the exit. Everything is
// deterministic in `seed`: same seed → same maze → same solution.
import { mulberry32 } from '../../framework/rng'

// Wall bits per cell. A set bit means that side's wall is PRESENT.
export const N = 1, E = 2, S = 4, W = 8
export const DIRS = [N, E, S, W] as const // clockwise: N → E → S → W

const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E }
const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 }
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 }

export type Generator = 'dfs' | 'prim' | 'wilson'
export type Solver = 'flood' | 'wall-follower'

export type Maze = {
  cols: number
  rows: number
  cells: Uint8Array // length cols*rows, bitmask of PRESENT walls (N|E|S|W)
}

/** A generated perfect maze plus the ordered list of carve steps that built it.
 *  `edgeCell[k]` + `edgeDir[k]` is the k-th wall knocked down (dir side of that
 *  cell, and OPP on its neighbour). Length cols*rows-1 = a spanning tree. */
export type Carved = {
  maze: Maze
  edgeCell: Int32Array
  edgeDir: Uint8Array
}

function inBounds(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows
}

/** Depth-first recursive-backtracker: carve a spanning tree by walking to a
 *  random unvisited neighbour and knocking down the shared wall, backtracking at
 *  dead ends. Produces long, winding corridors. */
function carveDFS(seed: number, cols: number, rows: number): Carved {
  const rng = mulberry32(seed)
  const n = cols * rows
  const cells = new Uint8Array(n).fill(N | E | S | W)
  const visited = new Uint8Array(n)
  const edgeCell: number[] = [], edgeDir: number[] = []
  const stack = [0]; visited[0] = 1
  while (stack.length) {
    const i = stack[stack.length - 1]
    const x = i % cols, y = (i / cols) | 0
    const opts: number[] = []
    for (const dir of DIRS) {
      const nx = x + DX[dir], ny = y + DY[dir]
      if (inBounds(nx, ny, cols, rows) && !visited[ny * cols + nx]) opts.push(dir)
    }
    if (opts.length === 0) { stack.pop(); continue }
    const dir = opts[(rng() * opts.length) | 0]
    const ni = (y + DY[dir]) * cols + (x + DX[dir])
    cells[i] &= ~dir
    cells[ni] &= ~OPP[dir]
    visited[ni] = 1
    edgeCell.push(i); edgeDir.push(dir)
    stack.push(ni)
  }
  return { maze: { cols, rows, cells }, edgeCell: Int32Array.from(edgeCell), edgeDir: Uint8Array.from(edgeDir) }
}

/** Randomized Prim: grow the maze from one cell, repeatedly carving a random
 *  frontier wall into the tree. Produces a bushier, more uniform texture. */
function carvePrim(seed: number, cols: number, rows: number): Carved {
  const rng = mulberry32(seed)
  const n = cols * rows
  const cells = new Uint8Array(n).fill(N | E | S | W)
  const inTree = new Uint8Array(n)
  const edgeCell: number[] = [], edgeDir: number[] = []
  // Frontier = candidate walls {from cell in-tree, dir to out-of-tree neighbour}.
  const frontFrom: number[] = [], frontDir: number[] = []
  const addFrontier = (i: number) => {
    const x = i % cols, y = (i / cols) | 0
    for (const dir of DIRS) {
      const nx = x + DX[dir], ny = y + DY[dir]
      if (inBounds(nx, ny, cols, rows) && !inTree[ny * cols + nx]) { frontFrom.push(i); frontDir.push(dir) }
    }
  }
  inTree[0] = 1; addFrontier(0)
  while (frontFrom.length) {
    const k = (rng() * frontFrom.length) | 0
    const i = frontFrom[k], dir = frontDir[k]
    // swap-remove k
    const last = frontFrom.length - 1
    frontFrom[k] = frontFrom[last]; frontDir[k] = frontDir[last]
    frontFrom.pop(); frontDir.pop()
    const x = i % cols, y = (i / cols) | 0
    const nx = x + DX[dir], ny = y + DY[dir]
    if (!inBounds(nx, ny, cols, rows)) continue
    const ni = ny * cols + nx
    if (inTree[ni]) continue // neighbour joined via another wall since we queued this
    cells[i] &= ~dir
    cells[ni] &= ~OPP[dir]
    inTree[ni] = 1
    edgeCell.push(i); edgeDir.push(dir)
    addFrontier(ni)
  }
  return { maze: { cols, rows, cells }, edgeCell: Int32Array.from(edgeCell), edgeDir: Uint8Array.from(edgeDir) }
}

/** Wilson's loop-erased random walk: unbiased uniform spanning tree. Random-walk
 *  from an unvisited cell until it hits the growing tree, erasing loops, then
 *  carve that path in. Carve order jumps around the grid for a lively animation. */
function carveWilson(seed: number, cols: number, rows: number): Carved {
  const rng = mulberry32(seed)
  const n = cols * rows
  const cells = new Uint8Array(n).fill(N | E | S | W)
  const inMaze = new Uint8Array(n)
  const dirOf = new Int8Array(n) // last-chosen walk direction per cell (loop-erased)
  const edgeCell: number[] = [], edgeDir: number[] = []
  const neighbours = (i: number): number[] => {
    const x = i % cols, y = (i / cols) | 0, out: number[] = []
    for (const dir of DIRS) if (inBounds(x + DX[dir], y + DY[dir], cols, rows)) out.push(dir)
    return out
  }
  inMaze[(rng() * n) | 0] = 1
  let remaining = n - 1
  while (remaining > 0) {
    // pick the first unvisited cell scanning from a seeded random offset
    let cell = -1
    const off = (rng() * n) | 0
    for (let s = 0; s < n; s++) { const idx = (off + s) % n; if (!inMaze[idx]) { cell = idx; break } }
    if (cell < 0) break
    // random walk (loop-erased by overwriting dirOf) until we hit the tree
    let walk = cell
    while (!inMaze[walk]) {
      const opts = neighbours(walk)
      const dir = opts[(rng() * opts.length) | 0]
      dirOf[walk] = dir
      const x = walk % cols, y = (walk / cols) | 0
      walk = (y + DY[dir]) * cols + (x + DX[dir])
    }
    // retrace from `cell` following dirOf, carving each step into the tree
    let cur = cell
    while (!inMaze[cur]) {
      const dir = dirOf[cur]
      const x = cur % cols, y = (cur / cols) | 0
      const ni = (y + DY[dir]) * cols + (x + DX[dir])
      cells[cur] &= ~dir
      cells[ni] &= ~OPP[dir]
      inMaze[cur] = 1; remaining--
      edgeCell.push(cur); edgeDir.push(dir)
      cur = ni
    }
  }
  return { maze: { cols, rows, cells }, edgeCell: Int32Array.from(edgeCell), edgeDir: Uint8Array.from(edgeDir) }
}

/** Generate a perfect maze with the chosen algorithm, recording carve order. */
export function generateMaze(seed: number, cols: number, rows: number, generator: Generator): Carved {
  switch (generator) {
    case 'prim': return carvePrim(seed, cols, rows)
    case 'wilson': return carveWilson(seed, cols, rows)
    default: return carveDFS(seed, cols, rows)
  }
}

/** True if the wall on `dir` side of cell `i` is OPEN (a passage). */
export function isOpen(cells: Uint8Array, i: number, dir: number): boolean {
  return (cells[i] & dir) === 0
}

/** BFS wavefront from the entrance (cell 0). Returns cells in discovery order,
 *  where the exit first appears in that order, and the unique shortest path. */
export function floodSolve(m: Maze): { order: Int32Array; exitReachedAt: number; path: Int32Array } {
  const { cols, rows, cells } = m
  const n = cols * rows, exit = n - 1
  const prev = new Int32Array(n).fill(-1)
  const seen = new Uint8Array(n)
  const order: number[] = []
  const q = [0]; seen[0] = 1
  for (let head = 0; head < q.length; head++) {
    const i = q[head]; order.push(i)
    const x = i % cols, y = (i / cols) | 0
    for (const dir of DIRS) {
      if (!isOpen(cells, i, dir)) continue
      const nx = x + DX[dir], ny = y + DY[dir]
      if (!inBounds(nx, ny, cols, rows)) continue
      const ni = ny * cols + nx
      if (seen[ni]) continue
      seen[ni] = 1; prev[ni] = i; q.push(ni)
    }
  }
  const path: number[] = []
  for (let i = exit; i !== -1; i = prev[i]) path.push(i)
  path.reverse()
  return { order: Int32Array.from(order), exitReachedAt: order.indexOf(exit), path: Int32Array.from(path) }
}

/** Right-hand-rule walker from entrance (0) to exit. In a simply-connected
 *  perfect maze this always reaches the exit; `trail` is the full route walked
 *  (dead-end corridors included), ending on the exit cell. */
export function wallFollowerSolve(m: Maze): { trail: Int32Array; reached: boolean } {
  const { cols, rows, cells } = m
  const n = cols * rows, exit = n - 1
  const trail: number[] = [0]
  let pos = 0, facing = E // enter heading into the maze
  const cap = n * 8
  let steps = 0
  while (pos !== exit && steps < cap) {
    const fi = DIRS.indexOf(facing as typeof DIRS[number])
    // try right, forward, left, back (relative to facing), clockwise order
    const tryOrder = [DIRS[(fi + 1) & 3], DIRS[fi], DIRS[(fi + 3) & 3], DIRS[(fi + 2) & 3]]
    for (const dir of tryOrder) {
      if (!isOpen(cells, pos, dir)) continue
      const x = pos % cols, y = (pos / cols) | 0
      pos = (y + DY[dir]) * cols + (x + DX[dir])
      facing = dir
      trail.push(pos)
      break
    }
    steps++
  }
  return { trail: Int32Array.from(trail), reached: pos === exit }
}

/** Ordered reveal for animating a solve. `cells[k]` painted with kind `kinds[k]`
 *  (0 = exploration/path colour, 1 = confirmed-solution colour). The framework
 *  paints these in order at the configured speed: first the search fans out, then
 *  the solution glows in. Unifies both solvers behind one reveal list. */
export function solveOps(m: Maze, solver: Solver): { cells: Int32Array; kinds: Uint8Array } {
  const cells: number[] = [], kinds: number[] = []
  if (solver === 'wall-follower') {
    const { trail } = wallFollowerSolve(m)
    for (const c of trail) { cells.push(c); kinds.push(0) }
    const seen = new Set<number>()
    for (const c of trail) if (!seen.has(c)) { seen.add(c); cells.push(c); kinds.push(1) }
  } else {
    const { order, exitReachedAt, path } = floodSolve(m)
    const upto = exitReachedAt < 0 ? order.length - 1 : exitReachedAt
    for (let k = 0; k <= upto; k++) { cells.push(order[k]); kinds.push(0) }
    for (const c of path) { cells.push(c); kinds.push(1) }
  }
  return { cells: Int32Array.from(cells), kinds: Uint8Array.from(kinds) }
}

export type Layout = { cols: number; rows: number; p: number; ox: number; oy: number }

const MIN_CELLS = 3

/** Fit a square-cell grid of pitch `cellSize` CSS px into a w×h display, centred
 *  with a symmetric margin. Viewport-derived, so a resize just recomputes it. */
export function mazeLayout(w: number, h: number, cellSize: number): Layout {
  const p = Math.max(6, cellSize)
  const cols = Math.max(MIN_CELLS, Math.floor(w / p))
  const rows = Math.max(MIN_CELLS, Math.floor(h / p))
  const ox = Math.floor((w - cols * p) / 2)
  const oy = Math.floor((h - rows * p) / 2)
  return { cols, rows, p, ox, oy }
}
