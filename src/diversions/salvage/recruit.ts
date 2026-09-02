import { walkable, cellIndex, inBounds, neighbors4 } from './grid'
import { isExposed } from './chunks'
import { recruitColor, deposit } from './trails'
import {
  type SalvageState, type Drone, type Chunk, type TintField,
  BLANK, DRONE_SPEED, WANDER_TURN, TRAIL_DEPOSIT, CREW_PULL, HOME_PULL, HOME_NEAR,
} from './state'

const nb = new Int32Array(4)

export function spawnDrone(s: SalvageState, x: number, y: number): Drone {
  const d: Drone = {
    x, y, heading: s.rand() * Math.PI * 2, tint: BLANK, state: 'blank', target: -1, avoid: -1,
    path: [], pathPos: 0, immuneUntil: new Float64Array(Math.max(1, s.palette.length)),
    stolen: 0, seekTime: 0, legPhase: 0, retiring: false,
  }
  s.drones.push(d)
  return d
}

export function cellOf(s: SalvageState, d: Drone): number {
  const col = Math.min(s.cols - 1, Math.max(0, Math.floor(d.x)))
  const row = Math.min(s.rows - 1, Math.max(0, Math.floor(d.y)))
  return cellIndex(s.grid, col, row)
}

/** Can this piece be picked right now? Only during the dismantle, only from the
 *  picture, only if exposed (edge-only), not while a crew is already moving it, and
 *  not while it is cooling down after a failed drop-site search. */
export function eligible(s: SalvageState, c: Chunk): boolean {
  if (s.phase !== 'dismantle') return false
  if (c.where !== 'picture') return false
  if (c.crew && c.crew.moving) return false
  if (c.retryAt > s.time) return false
  if (c.exposedV !== s.fieldVersion) { c.exposed = isExposed(s.grid, c); c.exposedV = s.fieldVersion }
  return c.exposed
}

/** Carriers a piece needs, clamped to half the colony so it is always liftable. */
export function neededFor(s: SalvageState, c: Chunk): number {
  const raw = Math.ceil(c.mass / s.cfg.strength)
  return Math.max(1, Math.min(raw, Math.max(1, Math.floor(s.drones.length / 2))))
}

function immune(s: SalvageState, d: Drone, k: number): boolean {
  return k < d.immuneUntil.length && d.immuneUntil[k] > s.time
}

/** A drone left standing on a blocked cell (a site reserved under it, a piece it was
 *  inside when the picture changed) is nudged to the nearest walkable cell. */
export function snapToFree(s: SalvageState, d: Drone): void {
  const here = cellOf(s, d)
  if (walkable(s.grid.occ[here])) return
  const col = here % s.cols, row = (here - col) / s.cols
  for (let r = 1; r < 6; r++) {
    for (let dr = -r; dr <= r; dr++) for (let dc = -r; dc <= r; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== r) continue
      const c2 = col + dc, r2 = row + dr
      if (inBounds(s.grid, c2, r2) && walkable(s.grid.occ[cellIndex(s.grid, c2, r2)])) { d.x = c2 + 0.5; d.y = r2 + 0.5; return }
    }
  }
}

/** Does this drone's colour have ANY piece left in the picture? False means the
 *  colour is exhausted — the only case that earns immunity. */
export function colorRemains(s: SalvageState, k: number): boolean {
  for (const c of s.chunks) if (c.color === k && c.where === 'picture') return true
  return false
}

export function goBlank(s: SalvageState, d: Drone, immuneToTint: boolean): void {
  if (immuneToTint && d.tint !== BLANK && d.tint < d.immuneUntil.length) d.immuneUntil[d.tint] = s.time + s.cfg.immunity
  d.tint = BLANK
  d.state = 'blank'
  d.target = -1
  d.avoid = -1
  d.path = []
  d.stolen = 0
  d.seekTime = 0
}

function adopt(d: Drone, k: number): void {
  d.tint = k
  d.state = 'seeking'
  d.target = -1 // waits in the pick queue
  d.stolen = 0
  d.seekTime = 0
}

/** Recruitment for a blank drone. TRAIL FIRST: once a colour is flowing its trail keeps
 *  recruiting, which is what makes the colony sweep colour by colour. A touch only
 *  recruits where no trail speaks. */
export function recruit(s: SalvageState, d: Drone): void {
  const here = cellOf(s, d)
  const k = recruitColor(s.trails, here)
  if (k >= 0 && !immune(s, d, k)) { adopt(d, k); return }
  const n = neighbors4(s.grid, here, nb)
  for (let j = 0; j < n; j++) {
    const id = s.grid.owner[nb[j]]
    if (id < 0) continue
    const c = s.chunks[id]
    if (eligible(s, c) && !immune(s, d, c.color)) { adopt(d, c.color); return }
  }
}

/** The pickable pieces of one colour right now. */
function candidates(s: SalvageState, k: number, avoid: number): Chunk[] {
  const cands: Chunk[] = []
  for (const c of s.chunks) if (c.color === k && c.id !== avoid && eligible(s, c)) cands.push(c)
  return cands
}

/** ONE multi-source flood per tint, shared by every drone of that colour, instead of
 *  one full-grid BFS per drone per pick. Twelve per-drone floods in one frame was a
 *  50–85 ms stall at the ceiling; this is at most `colors` floods per lift, and
 *  usually one. Seeded from the stand cells of every pickable piece of the colour,
 *  half-crewed pieces first and the rest joining the frontier CREW_PULL levels later,
 *  which reproduces the per-drone score exactly (path distance minus the crew pull).
 *  `owner` carries the piece each cell's path leads to; `prev` points one step closer
 *  to it, so a drone reads its target at its own cell and walks `prev` to the source. */
function buildField(s: SalvageState, k: number, cands: Chunk[]): TintField {
  const g = s.grid
  const n = g.cols * g.rows
  let f = s.fields.get(k)
  if (!f || f.dist.length !== n) {
    f = { version: -1, dist: new Int32Array(n), prev: new Int32Array(n), owner: new Int32Array(n) }
    s.fields.set(k, f)
  }
  f.dist.fill(-1); f.prev.fill(-1); f.owner.fill(-1)
  const nb = new Int32Array(4)
  const wave: Chunk[] = [], later: Chunk[] = []
  for (const c of cands) (c.crew && !c.crew.moving && c.crew.carriers.length < neededFor(s, c) ? wave : later).push(c)
  let frontier: number[] = []
  const seed = (list: Chunk[], level: number) => {
    for (const c of list) for (const i of c.at!) {
      const m = neighbors4(g, i, nb)
      for (let j = 0; j < m; j++) {
        const q = nb[j]
        if (walkable(g.occ[q]) && g.reach[q] === 1 && f.dist[q] === -1) { f.dist[q] = level; f.owner[q] = c.id; frontier.push(q) }
      }
    }
  }
  seed(wave, 0)
  let level = 0
  let seededLater = wave.length === 0
  if (seededLater) seed(later, 0)
  while (frontier.length > 0 || !seededLater) {
    if (!seededLater && level >= CREW_PULL) { seed(later, level); seededLater = true }
    const next: number[] = []
    for (const i of frontier) {
      const m = neighbors4(g, i, nb)
      for (let j = 0; j < m; j++) {
        const q = nb[j]
        if (f.dist[q] !== -1 || !walkable(g.occ[q])) continue
        f.dist[q] = level + 1; f.prev[q] = i; f.owner[q] = f.owner[i]; next.push(q)
      }
    }
    frontier = next
    level++
    if (frontier.length === 0 && !seededLater) { seed(later, level); seededLater = true }
  }
  f.version = s.fieldVersion
  return f
}

/** Choose a target and a path for a tinted drone. Returns 'picked', 'none' (nothing
 *  pickable for this colour right now — the caller decides whether that is
 *  exhaustion, see `colorRemains`), or 'later' (the shared field for this colour is
 *  stale and the frame's pick budget is spent; try next frame). */
export function pickTarget(s: SalvageState, d: Drone, canFlood: () => boolean): 'picked' | 'none' | 'later' {
  const cands = candidates(s, d.tint, d.avoid)
  if (cands.length === 0) return 'none'
  const start = cellOf(s, d)
  let f = s.fields.get(d.tint)
  if (!f || f.version !== s.fieldVersion || f.dist.length !== s.grid.occ.length) {
    if (!canFlood()) return 'later'
    f = buildField(s, d.tint, candidates(s, d.tint, -1))
  }
  if (f.dist[start] < 0 || f.owner[start] < 0) return 'none'
  // A drone avoiding the piece it just gave up on wanders until the shared field
  // leads it somewhere else — no private flood for the rare release path.
  if (f.owner[start] === d.avoid) return 'later'
  // Walk `prev` from here to the source cell (prev === -1 there).
  const path: number[] = []
  let cur = f.prev[start]
  while (cur !== -1) { path.push(cur); cur = f.prev[cur] }
  d.target = f.owner[start]
  d.path = path
  d.pathPos = 0
  d.seekTime = 0
  return 'picked'
}

/** Wander: a random walk with a gentle pull toward the picture while far from it, so
 *  idle drones drift back to where the work is instead of milling around the mound —
 *  a bias, not a beeline: the jitter stays on top, and the pull switches off within
 *  HOME_NEAR cells of the picture's box so they browse its edge rather than pile on it. */
export function wander(s: SalvageState, d: Drone, dt: number): void {
  // A site reserved under a standing drone would wall it in: every step out of a
  // blocked cell fails the walkability check. Step off first.
  if (!walkable(s.grid.occ[cellOf(s, d)])) { snapToFree(s, d); return }
  if (s.hasPicture) {
    const cx = s.picOriginCol + s.picCols / 2, cy = s.picOriginRow + s.picRows / 2
    const outsideX = Math.max(0, Math.abs(d.x - cx) - s.picCols / 2), outsideY = Math.max(0, Math.abs(d.y - cy) - s.picRows / 2)
    if (Math.max(outsideX, outsideY) > HOME_NEAR) {
      const want = Math.atan2(cy - d.y, cx - d.x)
      let delta = want - d.heading
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      d.heading += Math.max(-HOME_PULL * dt, Math.min(HOME_PULL * dt, delta))
    }
  }
  d.heading += (s.rand() - 0.5) * 2 * WANDER_TURN * dt
  const step = DRONE_SPEED * dt
  const nx = d.x + Math.cos(d.heading) * step, ny = d.y + Math.sin(d.heading) * step
  const col = Math.floor(nx), row = Math.floor(ny)
  if (!inBounds(s.grid, col, row) || !walkable(s.grid.occ[cellIndex(s.grid, col, row)])) {
    d.heading += Math.PI + (s.rand() - 0.5)
    return
  }
  d.x = nx; d.y = ny; d.legPhase += step
}

/** Walk the path, laying the drone's tint as it goes; true on arrival at its end. */
export function followPath(s: SalvageState, d: Drone, speed: number, dt: number): boolean {
  let budget = speed * dt
  while (budget > 0 && d.pathPos < d.path.length) {
    const cell = d.path[d.pathPos]
    const tx = (cell % s.cols) + 0.5, ty = Math.floor(cell / s.cols) + 0.5
    const dx = tx - d.x, dy = ty - d.y
    const dist = Math.hypot(dx, dy)
    d.heading = Math.atan2(dy, dx)
    if (dist <= budget) { d.x = tx; d.y = ty; d.legPhase += dist; budget -= dist; d.pathPos++; continue }
    d.x += (dx / dist) * budget; d.y += (dy / dist) * budget; d.legPhase += budget
    budget = 0
  }
  if (d.tint !== BLANK) deposit(s.trails, d.tint, cellOf(s, d), TRAIL_DEPOSIT * dt)
  return d.pathPos >= d.path.length
}
