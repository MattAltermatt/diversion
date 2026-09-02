import { type Grid, walkable, neighbors4 } from './grid'

const nb = new Int32Array(4)

/** Breadth-first distances over WALKABLE cells from `start` (`dist` -1 = unreachable).
 *  The start is expanded even if it is not free: a drone may stand on a cell that was
 *  reserved under it. One call answers "how far is every candidate" at once, which is
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
