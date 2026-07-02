// arena.ts — procgen MAZE walls. Grid-aligned recursive division: the interior is
// recursively split by thin dividing walls, each carrying a doorway gap, until regions
// hit the corridor-width floor (or an early "plaza" stop leaves a big open room). A light
// braiding pass punches extra doorways so the maze has loops (flanking routes), not only
// dead ends. Density is ONE knob: low = a couple of walls around vast plazas; high = a
// tight warren of corridors just wide enough for ~3 agents abreast, full of dead ends.
// Pure + deterministic; uses its OWN rng stream so wall generation never shifts agent
// spawns. Walls live in the interior only — the left/right spawn corridors stay clear.
import { mulberry32 } from '../../framework/rng'

export interface Rect { x: number; y: number; w: number; h: number }

// A static uniform grid over the whole world mapping each cell → indices of walls that
// overlap it, so insideWall / addWallAvoid touch only nearby walls (a maze has hundreds).
export interface WallGrid {
  size: number; cols: number; rows: number; buckets: number[][]
  stamp: Int32Array // per-wall visit marker (a wall spans multiple cells; dedupe per query)
  gen: number       // incremented each dedup'd query
}
export interface Arena { walls: Rect[]; grid?: WallGrid }

// Interior band that may hold walls; the margins are the clear spawn corridors.
export const ARENA_MX = 280 // left/right margin (fighters spawn <220, horde >1380)
export const ARENA_MY = 80

export function generateArena(seed: number, density: number, worldW: number, worldH: number): Arena {
  const walls: Rect[] = []
  if (density <= 0.02) return { walls, grid: buildWallGrid(walls, worldW, worldH) } // wide-open field
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  const d = density
  // corridor/doorway width: wide avenues (156) at d=0 → a 3-abreast floor (42) at d=1.
  const cw = Math.max(42, Math.min(156, 156 + (42 - 156) * d))
  const wt = 10 + 6 * d                    // wall thickness (mostly a look knob): 10 → 16
  const minRegion = 2 * cw + wt + 8        // a region splits only if it can hold two
  const pPlaza = 0.20 + (0.08 - 0.20) * d  // corridors + a wall → recursion depth = openness
  const PBRAID = 0.30                       // fraction of walls that get a 2nd doorway (loops)
  const x0 = ARENA_MX, y0 = ARENA_MY, x1 = worldW - ARENA_MX, y1 = worldH - ARENA_MY

  const divide = (rx0: number, ry0: number, rx1: number, ry1: number): void => {
    const w = rx1 - rx0, h = ry1 - ry0
    const canV = w >= minRegion // a vertical wall (split along x)
    const canH = h >= minRegion // a horizontal wall (split along y)
    if (!canV && !canH) return // leaf: a room / corridor / dead-end pocket
    if (rng() < pPlaza) return // early stop → a big open plaza leaf
    const vertical = canV && canH ? w >= h : canV
    if (vertical) {
      const lo = rx0 + cw, hi = rx1 - cw - wt
      const wallX = lo + rng() * (hi - lo)
      addGappedWall(walls, true, wallX, ry0, ry1, wt, cw, PBRAID, rng)
      divide(rx0, ry0, wallX, ry1)
      divide(wallX + wt, ry0, rx1, ry1)
    } else {
      const lo = ry0 + cw, hi = ry1 - cw - wt
      const wallY = lo + rng() * (hi - lo)
      addGappedWall(walls, false, wallY, rx0, rx1, wt, cw, PBRAID, rng)
      divide(rx0, ry0, rx1, wallY)
      divide(rx0, wallY + wt, rx1, ry1)
    }
  }
  divide(x0, y0, x1, y1)
  return { walls, grid: buildWallGrid(walls, worldW, worldH) }
}

/** Emit a wall along a line (vertical at coord=x spanning [a0,a1] in y, or horizontal at
 *  coord=y spanning [a0,a1] in x) as segments split by one doorway gap of width `cw`
 *  (and, with prob `pbraid`, a second). Doorways are inset ≥1px from the ends so a gap
 *  never lands flush against a perpendicular wall. */
function addGappedWall(
  walls: Rect[], vertical: boolean, coord: number, a0: number, a1: number,
  wt: number, cw: number, pbraid: number, rng: () => number,
): void {
  const gaps: [number, number][] = []
  const minStart = a0 + 1, maxStart = a1 - cw - 1
  if (maxStart <= minStart) {
    gaps.push([a0, a1]) // span too short for a wall + door → leave it fully open
  } else {
    const g1 = minStart + rng() * (maxStart - minStart)
    gaps.push([g1, g1 + cw])
    if (rng() < pbraid) {
      const g2 = minStart + rng() * (maxStart - minStart)
      gaps.push([g2, g2 + cw])
    }
  }
  gaps.sort((p, q) => p[0] - q[0])
  let cur = a0
  const push = (s: number, e: number) => {
    if (e - s <= 0.5) return
    walls.push(vertical ? { x: coord, y: s, w: wt, h: e - s } : { x: s, y: coord, w: e - s, h: wt })
  }
  for (const [gs, ge] of gaps) {
    push(cur, Math.min(gs, a1))
    cur = Math.max(cur, ge)
  }
  push(cur, a1)
}

/** Build the static wall-index grid. Cell size ~120px so the 14px avoid radius spans at
 *  most a 3×3 block; each wall is registered in every cell its AABB overlaps. */
export function buildWallGrid(walls: Rect[], worldW: number, worldH: number): WallGrid {
  const size = 120
  const cols = Math.max(1, Math.ceil(worldW / size))
  const rows = Math.max(1, Math.ceil(worldH / size))
  const buckets: number[][] = Array.from({ length: cols * rows }, () => [])
  for (let i = 0; i < walls.length; i++) {
    const r = walls[i]
    const cx0 = clampi(Math.floor(r.x / size), 0, cols - 1)
    const cx1 = clampi(Math.floor((r.x + r.w) / size), 0, cols - 1)
    const cy0 = clampi(Math.floor(r.y / size), 0, rows - 1)
    const cy1 = clampi(Math.floor((r.y + r.h) / size), 0, rows - 1)
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) buckets[cy * cols + cx].push(i)
  }
  return { size, cols, rows, buckets, stamp: new Int32Array(walls.length), gen: 0 }
}

function clampi(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v }

/** The wall containing (x,y), or null. Uses the grid bucket when present. */
export function insideWall(a: Arena, x: number, y: number): Rect | null {
  const g = a.grid
  if (g) {
    const cx = clampi(Math.floor(x / g.size), 0, g.cols - 1)
    const cy = clampi(Math.floor(y / g.size), 0, g.rows - 1)
    for (const i of g.buckets[cy * g.cols + cx]) {
      const r = a.walls[i]
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r
    }
    return null
  }
  for (const r of a.walls) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r
  }
  return null
}

/** Push (x,y) — known to be inside rect r — out through its nearest edge. Returns the
 *  corrected position and which velocity axis to reflect (0 = x, 1 = y). */
export function resolveWall(r: Rect, x: number, y: number): [number, number, 0 | 1] {
  const dl = x - r.x, dr = r.x + r.w - x, dt = y - r.y, db = r.y + r.h - y
  const m = Math.min(dl, dr, dt, db)
  if (m === dl) return [r.x - 0.1, y, 0]
  if (m === dr) return [r.x + r.w + 0.1, y, 0]
  if (m === dt) return [x, r.y - 0.1, 1]
  return [x, r.y + r.h + 0.1, 1]
}

/** Repel (x,y) from every wall within `radius` (closest-point on the rect), accumulating
 *  a steering contribution into `out`. Closer walls push harder (linear falloff). Queries
 *  only the grid's 3×3 block around (x,y) when the grid is present. */
/** Accumulate one rect's linear-falloff repulsion into `out` (module-level so the hot
 *  addWallAvoid loop allocates no per-call closure). */
function accumulateAvoid(r: Rect, x: number, y: number, r2: number, radius: number, w: number, out: Float32Array): void {
  const cxp = x < r.x ? r.x : x > r.x + r.w ? r.x + r.w : x
  const cyp = y < r.y ? r.y : y > r.y + r.h ? r.y + r.h : y
  const dx = x - cxp, dy = y - cyp
  const d2 = dx * dx + dy * dy
  if (d2 < r2 && d2 > 1e-6) {
    const d = Math.sqrt(d2)
    const f = (1 - d / radius) * w
    out[0] += (dx / d) * f; out[1] += (dy / d) * f
  }
}

export function addWallAvoid(
  a: Arena, x: number, y: number, radius: number, w: number, out: Float32Array,
): void {
  const r2 = radius * radius
  const g = a.grid
  if (g) {
    const cx = clampi(Math.floor(x / g.size), 0, g.cols - 1)
    const cy = clampi(Math.floor(y / g.size), 0, g.rows - 1)
    if (g.gen >= 0x3fffffff) { g.stamp.fill(0); g.gen = 0 } // keep the stamp inside Int32 range
    const gen = ++g.gen // dedupe: a long wall spans multiple cells in the 3×3 block
    for (let yy = cy - 1; yy <= cy + 1; yy++) {
      if (yy < 0 || yy >= g.rows) continue
      for (let xx = cx - 1; xx <= cx + 1; xx++) {
        if (xx < 0 || xx >= g.cols) continue
        for (const i of g.buckets[yy * g.cols + xx]) {
          if (g.stamp[i] === gen) continue
          g.stamp[i] = gen
          accumulateAvoid(a.walls[i], x, y, r2, radius, w, out)
        }
      }
    }
    return
  }
  for (const r of a.walls) accumulateAvoid(r, x, y, r2, radius, w, out)
}
