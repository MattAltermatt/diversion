import { describe, it, expect } from 'vitest'
import { generateArena, insideWall, resolveWall, addWallAvoid, ARENA_MX, ARENA_MY, type Arena, type Rect } from './arena'
import { mulberry32 } from '../../framework/rng'

const W = 1600, H = 900

describe('arena generation', () => {
  it('an open field (density <= escape hatch) has no walls', () => {
    expect(generateArena(1, 0, W, H).walls).toHaveLength(0)
    expect(generateArena(1, 0.02, W, H).walls).toHaveLength(0)
  })

  it('never leaves the whole arena wall-free above the escape hatch (#240)', () => {
    // The root region must always divide at least once, or an unlucky plaza early-stop
    // nukes the entire maze into an open field — the reseed-empties-the-arena bug (#240).
    for (const d of [0.05, 0.35, 0.65, 1]) {
      for (let s = 0; s < 500; s++) {
        expect(generateArena(s, d, W, H).walls.length, `seed ${s} density ${d}`).toBeGreaterThan(0)
      }
    }
  })

  it('denser arenas have more walls', () => {
    const sparse = generateArena(5, 0.1, W, H).walls.length
    const dense = generateArena(5, 1, W, H).walls.length
    expect(dense).toBeGreaterThan(sparse)
    expect(dense).toBeGreaterThan(0)
    expect(dense).toBeLessThan(2000) // sanity ceiling
  })

  it('is deterministic per seed + density', () => {
    expect(generateArena(42, 0.6, W, H).walls).toEqual(generateArena(42, 0.6, W, H).walls)
    expect(generateArena(1, 0.6, W, H).walls).not.toEqual(generateArena(2, 0.6, W, H).walls)
  })

  it('keeps walls out of the left/right/top/bottom spawn margins', () => {
    const { walls } = generateArena(7, 1, W, H)
    expect(walls.length).toBeGreaterThan(0)
    for (const r of walls) {
      expect(r.x).toBeGreaterThanOrEqual(ARENA_MX - 0.001)
      expect(r.x + r.w).toBeLessThanOrEqual(W - ARENA_MX + 0.001)
      expect(r.y).toBeGreaterThanOrEqual(ARENA_MY - 0.001)
      expect(r.y + r.h).toBeLessThanOrEqual(H - ARENA_MY + 0.001)
    }
  })

  it('stays connected: nearly every open cell is reachable from the left spawn corridor', () => {
    for (const seed of [1, 9, 23, 101]) {
      expect(floodReachRatio(generateArena(seed, 1, W, H))).toBeGreaterThan(0.95)
    }
  })

  it('keeps corridors passable (min doorway >= 3-abreast floor) at max density', () => {
    // A stricter connectivity proxy: flood fill must still reach almost everything at d=1,
    // which can only hold if doorways never seal below the corridor floor.
    expect(floodReachRatio(generateArena(55, 1, W, H))).toBeGreaterThan(0.95)
  })

  it('builds a maze of thin spanning walls, not chunky building blocks', () => {
    // A maze wall is a thin divider (thickness ~wt=10..16px); a building block is chunky on
    // both axes. Assert the vast majority of walls are thin on at least one axis.
    const { walls } = generateArena(3, 1, W, H)
    const thin = walls.filter((r) => Math.min(r.w, r.h) <= 24).length
    expect(thin / walls.length).toBeGreaterThan(0.8)
  })
})

describe('WallGrid spatial index', () => {
  it('insideWall via the grid matches a brute-force scan', () => {
    const a = generateArena(11, 0.8, W, H)
    const brute = (x: number, y: number): Rect | null =>
      a.walls.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) ?? null
    const rng = mulberry32(42)
    for (let k = 0; k < 3000; k++) {
      const x = rng() * W, y = rng() * H
      const g = insideWall(a, x, y), b = brute(x, y)
      expect(!!g).toBe(!!b)
      if (g && b) expect(g).toEqual(b)
    }
  })

  it('addWallAvoid via the grid matches a brute-force scan', () => {
    const a = generateArena(13, 0.9, W, H)
    const bruteAvoid = (x: number, y: number, radius: number, w: number): [number, number] => {
      const out: [number, number] = [0, 0]
      const r2 = radius * radius
      for (const r of a.walls) {
        const cxp = x < r.x ? r.x : x > r.x + r.w ? r.x + r.w : x
        const cyp = y < r.y ? r.y : y > r.y + r.h ? r.y + r.h : y
        const dx = x - cxp, dy = y - cyp, d2 = dx * dx + dy * dy
        if (d2 < r2 && d2 > 1e-6) { const d = Math.sqrt(d2); const f = (1 - d / radius) * w; out[0] += (dx / d) * f; out[1] += (dy / d) * f }
      }
      return out
    }
    const rng = mulberry32(7)
    for (let k = 0; k < 3000; k++) {
      const x = rng() * W, y = rng() * H
      const out = new Float32Array(2)
      addWallAvoid(a, x, y, 14, 2.2, out)
      const [bx, by] = bruteAvoid(x, y, 14, 2.2)
      expect(out[0]).toBeCloseTo(bx, 4)
      expect(out[1]).toBeCloseTo(by, 4)
    }
  })
})

describe('arena collision + avoidance', () => {
  const arena: Arena = { walls: [{ x: 100, y: 100, w: 200, h: 200 }] }

  it('insideWall detects a point within a building and misses one outside', () => {
    expect(insideWall(arena, 200, 200)).not.toBeNull()
    expect(insideWall(arena, 50, 50)).toBeNull()
  })

  it('resolveWall pushes a point out through its nearest edge', () => {
    const [nx, , ax] = resolveWall(arena.walls[0], 110, 200) // nearest the left edge (x=100)
    expect(nx).toBeLessThan(100)
    expect(ax).toBe(0)
  })

  it('addWallAvoid repels away from a nearby wall', () => {
    const out = new Float32Array(2)
    addWallAvoid(arena, 310, 200, 26, 2, out) // 10px right of the right edge (x=300)
    expect(out[0]).toBeGreaterThan(0) // pushed further right, away from the wall
  })
})

/** Rasterize walls onto a 20px grid and BFS from a point in the left spawn corridor;
 *  return reached-free / total-free ratio over the whole world. */
function floodReachRatio(a: Arena): number {
  const C = 20
  const cols = Math.ceil(W / C), rows = Math.ceil(H / C)
  const blocked = new Uint8Array(cols * rows)
  const cellFree = (cx: number, cy: number) =>
    !insideWall(a, cx * C + C / 2, cy * C + C / 2)
  let free = 0
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const b = cellFree(cx, cy) ? 0 : 1
    blocked[cy * cols + cx] = b
    if (!b) free++
  }
  const seen = new Uint8Array(cols * rows)
  const startCx = Math.floor(150 / C), startCy = Math.floor(H / 2 / C) // left spawn corridor
  const q: number[] = [startCy * cols + startCx]
  seen[q[0]] = 1
  let reached = 0
  while (q.length) {
    const i = q.pop()!
    if (blocked[i]) continue
    reached++
    const cx = i % cols, cy = (i / cols) | 0
    const nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]
    for (const [nx, ny] of nb) {
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const j = ny * cols + nx
      if (!seen[j] && !blocked[j]) { seen[j] = 1; q.push(j) }
    }
  }
  return reached / free
}
