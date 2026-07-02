// arena.ts — procgen "city block" walls (#235). A grid of rectangular buildings with
// streets between them, generated from the seed; density scales how many cells hold a
// building and how narrow the streets are (0 ≈ wide-open field, 1 ≈ dense office maze).
// Pure + deterministic; uses its OWN rng stream so wall generation never shifts agent
// spawn positions. Buildings live in the interior only — the left/right spawn corridors
// (fighters / horde) stay clear.
import { mulberry32 } from '../../framework/rng'

export interface Rect { x: number; y: number; w: number; h: number }
export interface Arena { walls: Rect[] }

// Interior band that may hold buildings; the margins are the clear spawn corridors.
export const ARENA_MX = 280 // left/right margin (fighters spawn <220, horde >1380)
export const ARENA_MY = 80

export function generateArena(seed: number, density: number, worldW: number, worldH: number): Arena {
  if (density <= 0.02) return { walls: [] } // wide-open field
  const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0)
  // Density adds MORE buildings (coverage), it does NOT pinch the streets shut —
  // corridors must stay wider than the wall-avoidance radius or agents can't thread
  // them. Grid stays coarse enough that even the densest streets are passable.
  const cols = 5 + Math.round(density * 4) // 5..9 columns of blocks
  const rows = 3 + Math.round(density * 3) // 3..6 rows
  const x0 = ARENA_MX, x1 = worldW - ARENA_MX, y0 = ARENA_MY, y1 = worldH - ARENA_MY
  const gw = (x1 - x0) / cols, gh = (y1 - y0) / rows
  const street = 0.34 // constant street fraction → passable-width corridors at any density
  const p = 0.15 + density * 0.8 // density = how built-up (0.15 → 0.95 of cells)
  const walls: Rect[] = []
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (rng() < p) {
        const padX = gw * street * 0.5, padY = gh * street * 0.5
        walls.push({ x: x0 + cx * gw + padX, y: y0 + cy * gh + padY, w: gw - 2 * padX, h: gh - 2 * padY })
      }
    }
  }
  return { walls }
}

/** The wall containing (x,y), or null. */
export function insideWall(a: Arena, x: number, y: number): Rect | null {
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
 *  a steering contribution into `out`. Closer walls push harder (linear falloff). */
export function addWallAvoid(
  a: Arena, x: number, y: number, radius: number, w: number, out: Float32Array,
): void {
  const r2 = radius * radius
  for (const r of a.walls) {
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
}
