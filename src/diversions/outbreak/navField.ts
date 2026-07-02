// navField.ts — flow-field navigation so agents route through the maze instead of
// smearing against walls. Two multi-source BFS distance fields on a coarse grid:
//   humanDist  — distance to the nearest civilian/fighter  (zombies DESCEND it to chase)
//   zombieDist — distance to the nearest zombie            (civilians ASCEND to flee;
//                                                            fighters DESCEND to advance)
// Re-seeded from scratch each rebuild (moving targets need no incremental upkeep). The
// blocked mask is static (built once per arena). Pure of any sim import (takes the zombie
// faction value as a param) to avoid a circular dependency with sim.ts.
import { insideWall, type Arena } from './arena'

export const NAV_CELL = 20
const INF = 0x3fffffff

export interface NavGrid {
  cols: number
  rows: number
  cell: number
  blocked: Uint8Array // 1 = a wall covers this cell's center
  humanDist: Int32Array // BFS distance to nearest human (INF = unreachable)
  zombieDist: Int32Array // BFS distance to nearest zombie
  queue: Int32Array // preallocated BFS work buffer (each cell enqueued ≤ once)
}

/** Ecosystem fields the BFS reads (kept structural so tests can pass a stub). */
interface Agents {
  n: number
  px: Float32Array
  py: Float32Array
  faction: Uint8Array
  alive: Uint8Array
}

function clampi(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v }

/** Build the static nav grid for an arena. `blocked` samples each cell center against the
 *  walls; rebuild only when the arena changes (density / seed). */
export function createNavGrid(arena: Arena, worldW: number, worldH: number): NavGrid {
  const cell = NAV_CELL
  const cols = Math.max(1, Math.ceil(worldW / cell))
  const rows = Math.max(1, Math.ceil(worldH / cell))
  const n = cols * rows
  const blocked = new Uint8Array(n)
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const x = cx * cell + cell / 2, y = cy * cell + cell / 2
      blocked[cy * cols + cx] = insideWall(arena, x, y) ? 1 : 0
    }
  }
  return {
    cols, rows, cell, blocked,
    humanDist: new Int32Array(n), zombieDist: new Int32Array(n), queue: new Int32Array(n),
  }
}

/** Multi-source 4-connected BFS from every living agent whose zombie-ness matches
 *  `wantZombie`, filling `dist` in place (INF for unreachable / walled-off cells). */
function bfs(nav: NavGrid, dist: Int32Array, e: Agents, wantZombie: boolean, zombieFaction: number): void {
  const { cols, rows, cell, blocked, queue } = nav
  dist.fill(INF)
  let head = 0, tail = 0
  for (let i = 0; i < e.n; i++) {
    if (!e.alive[i]) continue
    if ((e.faction[i] === zombieFaction) !== wantZombie) continue
    const cx = clampi(Math.floor(e.px[i] / cell), 0, cols - 1)
    const cy = clampi(Math.floor(e.py[i] / cell), 0, rows - 1)
    const idx = cy * cols + cx
    if (blocked[idx] || dist[idx] === 0) continue // walled-in source, or cell already seeded
    dist[idx] = 0
    queue[tail++] = idx
  }
  while (head < tail) {
    const idx = queue[head++]
    const nd = dist[idx] + 1
    const cx = idx % cols, cy = (idx / cols) | 0
    if (cx > 0) { const j = idx - 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; queue[tail++] = j } }
    if (cx < cols - 1) { const j = idx + 1; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; queue[tail++] = j } }
    if (cy > 0) { const j = idx - cols; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; queue[tail++] = j } }
    if (cy < rows - 1) { const j = idx + cols; if (!blocked[j] && dist[j] === INF) { dist[j] = nd; queue[tail++] = j } }
  }
}

/** Rebuild both fields from the current agent positions. `zombieFaction` is passed in to
 *  keep this module free of a sim import. */
export function rebuildFields(nav: NavGrid, e: Agents, zombieFaction: number): void {
  bfs(nav, nav.humanDist, e, false, zombieFaction) // sources = civilians + fighters
  bfs(nav, nav.zombieDist, e, true, zombieFaction) // sources = zombies
}

/** Write a unit direction into `out` toward the 8-neighbour with the lowest (`descend`)
 *  or highest (`!descend`) finite distance strictly better than the current cell. Diagonal
 *  moves are allowed only when both orthogonal cells are open (no corner-cutting). Returns
 *  false when the current cell is blocked/unreachable or no neighbour improves (caller
 *  then falls back to direct-seek / local steering). */
export function sampleField(nav: NavGrid, dist: Int32Array, x: number, y: number, descend: boolean, out: Float32Array): boolean {
  const { cols, rows, cell, blocked } = nav
  const cx = clampi(Math.floor(x / cell), 0, cols - 1)
  const cy = clampi(Math.floor(y / cell), 0, rows - 1)
  const here = dist[cy * cols + cx]
  if (blocked[cy * cols + cx] || here >= INF) return false
  let bestVal = here, bdx = 0, bdy = 0
  for (let dy = -1; dy <= 1; dy++) {
    const ny = cy + dy
    if (ny < 0 || ny >= rows) continue
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const nx = cx + dx
      if (nx < 0 || nx >= cols) continue
      const j = ny * cols + nx
      if (blocked[j]) continue
      if (dx !== 0 && dy !== 0) { // no corner-cut: both orthogonals must be open
        if (blocked[cy * cols + nx] || blocked[ny * cols + cx]) continue
      }
      const nv = dist[j]
      if (nv >= INF) continue
      if (descend ? nv < bestVal : nv > bestVal) { bestVal = nv; bdx = dx; bdy = dy }
    }
  }
  if (bdx === 0 && bdy === 0) return false
  const m = Math.hypot(bdx, bdy) || 1
  out[0] = bdx / m; out[1] = bdy / m
  return true
}

/** True if the straight segment (ax,ay)→(bx,by) crosses no wall (sampled at ~10px steps;
 *  endpoints — the agent and target centers — are assumed already free). */
export function losClear(arena: Arena, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = bx - ax, dy = by - ay
  const len = Math.hypot(dx, dy)
  const steps = Math.max(1, Math.ceil(len / 10))
  for (let s = 1; s < steps; s++) {
    const t = s / steps
    if (insideWall(arena, ax + dx * t, ay + dy * t)) return false
  }
  return true
}
