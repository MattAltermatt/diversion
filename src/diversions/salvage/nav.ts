import { type Grid, walkable, inBounds, neighbors4 } from './grid'

const nb = new Int32Array(4)

/** Breadth-first distances over WALKABLE cells from `start` (`dist` -1 = unreachable).
 *  The start is expanded even if it is not walkable: a drone may stand inside a
 *  picture that was just built over it. One call answers "how far is every candidate" at once, which is
 *  why targeting does a BFS per PICK, never per frame. */
export function bfs(g: Grid, start: number, dist: Int32Array, prev: Int32Array, queue: Int32Array, until?: (cell: number) => boolean): void {
  dist.fill(-1)
  prev.fill(-1)
  dist[start] = 0
  let head = 0, tail = 0
  queue[tail++] = start
  while (head < tail) {
    const i = queue[head++]
    // Early exit: a path to ONE known goal needs only the diamond out to it, not the
    // whole arena (a crew's trip is ~100 cells; the arena is 81k).
    if (until && until(i)) return
    const d = dist[i] + 1
    const k = neighbors4(g, i, nb)
    for (let j = 0; j < k; j++) {
      const q = nb[j]
      if (dist[q] !== -1 || !walkable(g.occ[q])) continue
      dist[q] = d
      prev[q] = i
      queue[tail++] = q
    }
  }
}

/** Cells to walk from `start` (exclusive) to `goal` (inclusive) per a `bfs` `prev`. */
export function pathTo(prev: Int32Array, start: number, goal: number): number[] {
  const out: number[] = []
  let cur = goal
  while (cur !== start && cur !== -1) { out.push(cur); cur = prev[cur] }
  if (cur === -1) return []
  out.reverse()
  return out
}

/** Where a drone stands to work on `cells`: the nearest walkable cell (by `dist`)
 *  4-adjacent to the set, or -1. No fallback — a piece with no reachable stand cell
 *  is simply not exposed, and the caller must treat it that way. */
export function approachCell(g: Grid, dist: Int32Array, cells: Int32Array): number {
  let best = -1, bestD = Infinity
  for (const i of cells) {
    const k = neighbors4(g, i, nb)
    for (let j = 0; j < k; j++) {
      const q = nb[j]
      if (walkable(g.occ[q]) && dist[q] >= 0 && dist[q] < bestD) { bestD = dist[q]; best = q }
    }
  }
  return best
}

function clear(g: Grid, col: number, row: number): boolean {
  return inBounds(g, col, row) && walkable(g.occ[row * g.cols + col])
}

/** Is the straight segment between two points (cell units) over walkable cells only?
 *  A supercover walk: every cell the segment touches is checked, and a crossing that
 *  lands exactly on a cell corner checks BOTH cells beside it, so a walker cannot slip
 *  diagonally between two blocked cells that meet at a point. */
export function lineClear(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  let cx = Math.floor(x0), cy = Math.floor(y0)
  const ex = Math.floor(x1), ey = Math.floor(y1)
  if (!clear(g, cx, cy)) return false
  const dx = x1 - x0, dy = y1 - y0
  const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0
  // Parametric t (0..1 along the segment) at which the walk next crosses a column /
  // row boundary, and the t it takes to cross one whole cell in each axis.
  const tdx = sx === 0 ? Infinity : 1 / Math.abs(dx), tdy = sy === 0 ? Infinity : 1 / Math.abs(dy)
  let tx = sx === 0 ? Infinity : (sx > 0 ? cx + 1 - x0 : x0 - cx) / Math.abs(dx)
  let ty = sy === 0 ? Infinity : (sy > 0 ? cy + 1 - y0 : y0 - cy) / Math.abs(dy)
  let guard = g.cols + g.rows + 2
  while ((cx !== ex || cy !== ey) && guard-- > 0) {
    if (Math.abs(tx - ty) < 1e-9) {
      if (!clear(g, cx + sx, cy) || !clear(g, cx, cy + sy)) return false
      cx += sx; cy += sy; tx += tdx; ty += tdy
    } else if (tx < ty) { cx += sx; tx += tdx }
    else { cy += sy; ty += tdy }
    if (!clear(g, cx, cy)) return false
  }
  // Fail CLOSED if the guard ever ran out: the leg stays a staircase rather than
  // risking one through the picture.
  return guard >= 0
}

/** String-pull a 4-connected `path` (cell indices, as `pathTo` / a field walk yield)
 *  into straight legs over walkable cells, starting from where the walker actually
 *  stands (`x0`, `y0`). The goal is kept, so arrival is unchanged; only the shape
 *  between changes. Across open ground the first probe (straight to the goal) succeeds
 *  and this is one line check. Behind an obstacle the leg is found by DOUBLING the
 *  probe until a line clips, then bisecting to a clear/clipped boundary — O(n log n)
 *  cell reads for a path of n cells. A greedy one-cell advance was O(n²): 0.35 ms per
 *  pick wrapping the picture on the ceiling grid, and PICK_BUDGET of those in one
 *  frame (a lift frees a whole crew to re-pick) was a 14 ms stall (measured). Visibility
 *  along a path is not monotone, so bisection lands on *a* clear leg rather than the
 *  longest; any clear leg is valid and the result is still pure in the grid, so a seed
 *  replays identically. */
export function smoothPath(g: Grid, x0: number, y0: number, path: number[]): number[] {
  if (path.length < 2) return path
  const cx = (c: number) => (c % g.cols) + 0.5, cy = (c: number) => Math.floor(c / g.cols) + 0.5
  const out: number[] = []
  let px = x0, py = y0
  let i = -1
  const last = path.length - 1
  while (i < last) {
    let j: number
    if (lineClear(g, px, py, cx(path[last]), cy(path[last]))) j = last
    else {
      // path[i+1] is 4-adjacent to the walker's cell: always a clear leg.
      let lo = i + 1, hi = -1
      for (let step = 1; hi < 0; step *= 2) {
        const probe = Math.min(last, lo + step)
        if (lineClear(g, px, py, cx(path[probe]), cy(path[probe]))) { lo = probe; if (probe === last) break }
        else hi = probe
      }
      while (hi >= 0 && hi - lo > 1) {
        const mid = (lo + hi) >> 1
        if (lineClear(g, px, py, cx(path[mid]), cy(path[mid]))) lo = mid; else hi = mid
      }
      j = lo
    }
    out.push(path[j]); px = cx(path[j]); py = cy(path[j]); i = j
  }
  return out
}
