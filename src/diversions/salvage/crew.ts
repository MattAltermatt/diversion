import { cellIndex, inBounds, floodReach, walkable, neighbors4, type Grid } from './grid'
import { bfs, pathTo, approachCell } from './nav'
import { deposit } from './trails'
import { findDropSite, reserve, unreserve, place, lift } from './mound'
import { cellOf, neededFor, goBlank, snapToFree } from './recruit'
import {
  type SalvageState, type Drone, type Crew, type Chunk,
  DRONE_SPEED, TRAIL_DEPOSIT, WAIT_TIMEOUT, SETTLE, MIN_CARRY_FACTOR, RETRY_AFTER,
} from './state'

export function latch(s: SalvageState, d: Drone, c: Chunk): void {
  if (!c.crew) {
    c.crew = { chunk: c, carriers: [], moving: false, waitTime: 0, x: 0, y: 0, path: [], pathPos: 0,
               dest: null, settle: 0, fromX: 0, fromY: 0 }
    s.crews.push(c.crew)
  }
  c.crew.carriers.push(d)
  d.state = 'latched'
  d.path = []
}

function anchorOf(g: Grid, cells: Int32Array): [number, number] {
  let minC = Infinity, minR = Infinity
  for (const i of cells) { const c = i % g.cols, r = (i - c) / g.cols; if (c < minC) minC = c; if (r < minR) minR = r }
  return [minC, minR]
}

/** Spread the carriers evenly around the lifted piece's bounding box, facing out. */
function arrangeCarriers(crew: Crew): void {
  const c = crew.chunk
  const n = crew.carriers.length
  const per = (c.w + c.h) * 2
  crew.carriers.forEach((d, k) => {
    const t = ((k + 0.5) / n) * per
    let px: number, py: number, hd: number
    if (t < c.w) { px = t; py = -0.4; hd = -Math.PI / 2 }
    else if (t < c.w + c.h) { px = c.w + 0.4; py = t - c.w; hd = 0 }
    else if (t < c.w * 2 + c.h) { px = c.w * 2 + c.h - t; py = c.h + 0.4; hd = Math.PI / 2 }
    else { px = -0.4; py = per - t; hd = Math.PI }
    d.x = crew.x + px; d.y = crew.y + py; d.heading = hd
  })
}

/** Send the carriers back to seeking (queue a pick). A retiring drone leaves instead. */
function disband(s: SalvageState, crew: Crew, avoid: boolean): void {
  crew.chunk.crew = null
  const i = s.crews.indexOf(crew)
  if (i >= 0) s.crews.splice(i, 1)
  for (const d of crew.carriers) {
    if (d.retiring) { const j = s.drones.indexOf(d); if (j >= 0) s.drones.splice(j, 1); continue }
    d.state = 'seeking'; d.target = -1; d.path = []; d.pathPos = 0; d.seekTime = 0
    d.avoid = avoid ? crew.chunk.id : -1
    snapToFree(s, d)
  }
}

/** Timed out or failed: release. The waiters avoid this piece on their next pick. */
export function releaseCrew(s: SalvageState, crew: Crew): void {
  disband(s, crew, true)
}

/** Lift: find + reserve a drop site, free the source cells, path the crew as one. */
function liftCrew(s: SalvageState, crew: Crew): void {
  const c = crew.chunk
  const g = s.grid
  const dest = findDropSite(g, c, s.nestSeed, s.siteHint)
  if (!dest) { c.retryAt = s.time + RETRY_AFTER; releaseCrew(s, crew); return }
  const [ax, ay] = anchorOf(g, c.at!)
  const lead = crew.carriers[0]
  const start = cellOf(s, lead)
  reserve(g, dest)
  // Stop the flood the moment it reaches any cell the crew could stand on beside the
  // site; `approachCell` then reads the nearest of those it has already labelled.
  const stand = new Set<number>()
  const nb = new Int32Array(4)
  for (const i of dest) { const m = neighbors4(g, i, nb); for (let j = 0; j < m; j++) if (walkable(g.occ[nb[j]])) stand.add(nb[j]) }
  bfs(g, start, s.dist, s.prev, s.queue, (cell) => stand.has(cell))
  const a = approachCell(g, s.dist, dest)
  if (a < 0) { unreserve(g, dest); c.retryAt = s.time + RETRY_AFTER; releaseCrew(s, crew); return }
  lift(g, c)
  floodReach(g, s.queue)
  s.fieldVersion++
  s.dirty.push(c.id)
  crew.path = pathTo(s.prev, start, a)
  crew.pathPos = 0
  crew.dest = dest
  crew.moving = true
  crew.x = ax; crew.y = ay
  for (const d of crew.carriers) d.state = 'carrying'
}

function finishCrew(s: SalvageState, crew: Crew): void {
  place(s.grid, crew.chunk, crew.dest!)
  floodReach(s.grid, s.queue)
  s.fieldVersion++
  s.dirty.push(crew.chunk.id)
  disband(s, crew, false)
}

export function stepCrew(s: SalvageState, crew: Crew, dt: number, frame: { lifts: number }): void {
  const c = crew.chunk
  if (!crew.moving) {
    // Waiting for carriers. Strength is live, so re-evaluate each step. One lift per
    // frame: a lift is the expensive event (site search + path + reach flood), and a
    // full crew waiting one more frame is invisible.
    if (crew.carriers.length >= neededFor(s, c)) { if (frame.lifts > 0) { frame.lifts--; liftCrew(s, crew) } return }
    crew.waitTime += dt
    if (crew.waitTime > WAIT_TIMEOUT) {
      // Give up: everyone here goes blank and immune, so the trail cannot pull them
      // straight back, and the piece is avoided by anyone who re-tints to it.
      const carriers = crew.carriers.slice()
      releaseCrew(s, crew)
      for (const d of carriers) if (s.drones.includes(d)) goBlank(s, d, true)
    }
    return
  }
  if (crew.settle > 0) {
    crew.settle -= dt
    const [dx, dy] = anchorOf(s.grid, crew.dest!)
    const u = 1 - Math.max(0, crew.settle) / SETTLE
    crew.x = crew.fromX + (dx - crew.fromX) * u
    crew.y = crew.fromY + (dy - crew.fromY) * u
    arrangeCarriers(crew)
    if (crew.settle <= 0) finishCrew(s, crew)
    return
  }
  const factor = Math.max(MIN_CARRY_FACTOR, Math.min(1, s.cfg.strength / c.mass))
  const speed = DRONE_SPEED * factor
  let budget = speed * dt
  while (budget > 0 && crew.pathPos < crew.path.length) {
    const cell = crew.path[crew.pathPos]
    const tx = (cell % s.cols) + 0.5 - c.w / 2, ty = Math.floor(cell / s.cols) + 0.5 - c.h / 2
    const dx = tx - crew.x, dy = ty - crew.y
    const dist = Math.hypot(dx, dy)
    if (dist <= budget) { crew.x = tx; crew.y = ty; budget -= dist; crew.pathPos++; continue }
    crew.x += (dx / dist) * budget; crew.y += (dy / dist) * budget
    budget = 0
  }
  for (const d of crew.carriers) d.legPhase += speed * dt
  arrangeCarriers(crew)
  for (const d of crew.carriers) {
    const col = Math.floor(d.x), row = Math.floor(d.y)
    if (inBounds(s.grid, col, row)) deposit(s.trails, c.color, cellIndex(s.grid, col, row), TRAIL_DEPOSIT * dt)
  }
  if (crew.pathPos >= crew.path.length) { crew.settle = SETTLE; crew.fromX = crew.x; crew.fromY = crew.y }
}
