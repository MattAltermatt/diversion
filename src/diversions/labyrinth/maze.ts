import { mulberry32 } from '../../framework/rng'

// Wall bits per cell. A set bit means a wall on that side is PRESENT.
export const N = 1, E = 2, S = 4, W = 8

export type Maze = {
  cols: number
  rows: number
  cells: Uint8Array // length cols*rows, each a bitmask of present walls (N|E|S|W)
}

const OPP: Record<number, number> = { [N]: S, [E]: W, [S]: N, [W]: E }
const DX: Record<number, number> = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 }
const DY: Record<number, number> = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 }

/** Recursive-backtracker perfect maze. Starts every cell fully walled, then
 *  carves a spanning tree by depth-first walking to a random unvisited neighbour
 *  and knocking down the shared wall. Deterministic in `seed`: every cell is
 *  reachable and there is exactly one path between any two cells. */
export function generateMaze(seed: number, cols: number, rows: number): Maze {
  const rng = mulberry32(seed)
  const cells = new Uint8Array(cols * rows).fill(N | E | S | W)
  const visited = new Uint8Array(cols * rows)
  const stack: number[] = [0]
  visited[0] = 1
  while (stack.length) {
    const i = stack[stack.length - 1]
    const x = i % cols, y = (i / cols) | 0
    const opts: number[] = []
    for (const dir of [N, E, S, W]) {
      const nx = x + DX[dir], ny = y + DY[dir]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      if (!visited[ny * cols + nx]) opts.push(dir)
    }
    if (opts.length === 0) { stack.pop(); continue }
    const dir = opts[(rng() * opts.length) | 0]
    const ni = (y + DY[dir]) * cols + (x + DX[dir])
    cells[i] &= ~dir            // knock down our wall
    cells[ni] &= ~OPP[dir]      // and the neighbour's matching wall
    visited[ni] = 1
    stack.push(ni)
  }
  return { cols, rows, cells }
}

/** BFS shortest path start (0,0) → end (cols-1,rows-1), as a list of cell indices.
 *  In a perfect maze this is the unique path. */
export function solvePath(m: Maze): number[] {
  const { cols, rows, cells } = m
  const start = 0, end = cols * rows - 1
  const prev = new Int32Array(cols * rows).fill(-1)
  const seen = new Uint8Array(cols * rows)
  const q = [start]; seen[start] = 1
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    if (i === end) break
    const x = i % cols, y = (i / cols) | 0, w = cells[i]
    const tryDir = (open: boolean, ni: number) => {
      if (open && ni >= 0 && ni < cols * rows && !seen[ni]) { seen[ni] = 1; prev[ni] = i; q.push(ni) }
    }
    tryDir(!(w & N) && y > 0, i - cols)
    tryDir(!(w & S) && y < rows - 1, i + cols)
    tryDir(!(w & W) && x > 0, i - 1)
    tryDir(!(w & E) && x < cols - 1, i + 1)
  }
  const path: number[] = []
  for (let i = end; i !== -1; i = prev[i]) path.push(i)
  return path.reverse()
}

/** BFS step-distance from the EXIT cell to every cell (through open passages).
 *  -1 = unreachable (never happens in a perfect maze). The goal gradient is built
 *  from this: distance 0 at the exit, rising toward the start. */
export function distanceFromExit(m: Maze): Int32Array {
  const { cols, rows, cells } = m
  const end = cols * rows - 1
  const dist = new Int32Array(cols * rows).fill(-1)
  const q = [end]; dist[end] = 0
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % cols, y = (i / cols) | 0, w = cells[i], d = dist[i]
    const tryDir = (open: boolean, ni: number) => {
      if (open && ni >= 0 && ni < cols * rows && dist[ni] < 0) { dist[ni] = d + 1; q.push(ni) }
    }
    tryDir(!(w & N) && y > 0, i - cols)
    tryDir(!(w & S) && y < rows - 1, i + cols)
    tryDir(!(w & W) && x > 0, i - 1)
    tryDir(!(w & E) && x < cols - 1, i + 1)
  }
  return dist
}

/** Rasterize the goal attractant to a w×h float field: 1.0 at the exit, falling
 *  toward 0 at the start, following corridor distance (so its gradient points
 *  along the maze toward the exit). Filled per cell block. */
export function rasterizeAttractant(m: Maze, dist: Int32Array, cellPx: number): Float32Array {
  const w = m.cols * cellPx, h = m.rows * cellPx
  const out = new Float32Array(w * h)
  let maxD = 1
  for (const d of dist) if (d > maxD) maxD = d
  for (let cy = 0; cy < m.rows; cy++) {
    for (let cx = 0; cx < m.cols; cx++) {
      const d = dist[cy * m.cols + cx]
      const a = d < 0 ? 0 : 1 - d / maxD // exit = 1, start ≈ 0
      const x0 = cx * cellPx, y0 = cy * cellPx
      for (let y = 0; y < cellPx; y++)
        for (let x = 0; x < cellPx; x++)
          out[(y0 + y) * w + (x0 + x)] = a
    }
  }
  return out
}

export type Grid = { cols: number; rows: number; cellPx: number }

const MIN_CELL_PX = 8

/** Choose grid dims + texels-per-cell to fill a `texW×texH` field with `shortCells`
 *  cells on the short axis, keeping cells square and ≥ MIN_CELL_PX texels (so 3-tap
 *  sensing has room). Returns the chosen cols/rows/cellPx. */
export function mazeGridFor(shortCells: number, texW: number, texH: number): Grid {
  const short = Math.min(texW, texH)
  const cellPx = Math.max(MIN_CELL_PX, Math.floor(short / shortCells))
  const cols = Math.max(2, Math.floor(texW / cellPx))
  const rows = Math.max(2, Math.floor(texH / cellPx))
  return { cols, rows, cellPx }
}

/** Rasterize present walls to a w×h byte mask (255=wall, 0=open). Every wall is a
 *  band exactly `wallPx` texels thick, centred on the cell boundary but shifted
 *  fully inside the field at the edges — so border walls and interior walls come
 *  out the SAME uniform thickness (no half-thin borders) and line up cleanly.
 *  The grid's outer border is always wall (edge cells start fully walled). */
export function rasterizeWalls(m: Maze, cellPx: number, wallPx: number): Uint8Array {
  const w = m.cols * cellPx, h = m.rows * cellPx
  const out = new Uint8Array(w * h) // 0 = open
  const t = Math.max(1, Math.min(wallPx, cellPx - 2)) // uniform thickness; keep a corridor open
  const off = t >> 1
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 255 }
  const hWall = (cx: number, yb: number) => { // horizontal wall across a cell column at boundary row yb
    const y0 = Math.max(0, Math.min(yb - off, h - t))
    for (let x = cx * cellPx; x < (cx + 1) * cellPx; x++)
      for (let d = 0; d < t; d++) set(x, y0 + d)
  }
  const vWall = (cy: number, xb: number) => { // vertical wall down a cell row at boundary col xb
    const x0 = Math.max(0, Math.min(xb - off, w - t))
    for (let y = cy * cellPx; y < (cy + 1) * cellPx; y++)
      for (let d = 0; d < t; d++) set(x0 + d, y)
  }
  for (let cy = 0; cy < m.rows; cy++) {
    for (let cx = 0; cx < m.cols; cx++) {
      const wbits = m.cells[cy * m.cols + cx]
      if (wbits & N) hWall(cx, cy * cellPx)
      if (wbits & S) hWall(cx, (cy + 1) * cellPx)
      if (wbits & W) vWall(cy, cx * cellPx)
      if (wbits & E) vWall(cy, (cx + 1) * cellPx)
    }
  }
  return out
}

/** Rasterize the path cells to a w×h byte mask (255 on path cells, 0 else).
 *  Fills the FULL cellPx×cellPx block per path cell so the glow stays continuous
 *  across the carved openings between consecutive path cells — wall texels still
 *  win in the display shader (drawn first, returns early), so over-painting the
 *  cell's own wall border is harmless. */
export function rasterizePath(m: Maze, path: number[], cellPx: number): Uint8Array {
  const w = m.cols * cellPx, h = m.rows * cellPx
  const out = new Uint8Array(w * h)
  for (const i of path) {
    const cx = i % m.cols, cy = (i / m.cols) | 0
    const x0 = cx * cellPx, y0 = cy * cellPx
    for (let y = 0; y < cellPx; y++)
      for (let x = 0; x < cellPx; x++)
        out[(y0 + y) * w + (x0 + x)] = 255
  }
  return out
}
