import { FREE, cellIndex } from './grid'
import { type SalvageState, type Drone, BLANK, DRONE_SPEED, SEEK_TIMEOUT, STOLEN_LIMIT, PICK_BUDGET, FLOODS_PER_FRAME } from './state'
import { spawnDrone, eligible, recruit, pickTarget, goBlank, wander, followPath, cellOf, snapToFree, colorRemains } from './recruit'
import { latch, stepCrew } from './crew'

/** Nothing pickable for this drone's colour. Two different situations: the colour is
 *  EXHAUSTED (no piece of it left in the picture) → blank with immunity, so the
 *  colour's stale trails cannot pull it straight back; or its pieces are merely not
 *  exposed / in flight / cooling down → stay tinted in the queue and wander, waiting
 *  for one to open up. Conflating the two immunised drones against a colour still on
 *  the picture and cut the wave the trail was building. SEEK_TIMEOUT still bounds the
 *  wait. */
function settleNoPick(s: SalvageState, d: Drone): void {
  if (!colorRemains(s, d.tint) || d.seekTime > SEEK_TIMEOUT) goBlank(s, d, true)
}

/** The frame's pick budget, in WORK UNITS rather than wall-clock so a seed replays
 *  identically on any machine: at most FLOODS_PER_FRAME tint-field floods (the one
 *  expensive step, ~4 ms at the ceiling) and PICK_BUDGET cheap walks down a cached
 *  field. A drone that misses the window wanders one more frame, which is invisible. */
interface Picks { left: number; floods: number; canFlood: () => boolean }
function makePicks(): Picks {
  const p: Picks = { left: PICK_BUDGET, floods: FLOODS_PER_FRAME, canFlood: () => p.floods-- > 0 }
  return p
}

/** Try a pick within the budget. True when the drone is done for this frame. */
function tryPick(s: SalvageState, d: Drone, picks: Picks): boolean {
  if (picks.left <= 0) return false
  picks.left--
  const r = pickTarget(s, d, picks.canFlood)
  if (r === 'none') settleNoPick(s, d)
  return r === 'picked' || r === 'none'
}

function stepDrone(s: SalvageState, d: Drone, dt: number, picks: Picks): void {
  switch (d.state) {
    case 'blank':
      wander(s, d, dt)
      if (d.retiring) return
      recruit(s, d)
      // Recruited this frame: pick right away if the budget allows, so a touch answers now.
      if (d.tint !== BLANK) tryPick(s, d, picks)
      return
    case 'seeking': {
      d.seekTime += dt
      if (d.target < 0) {
        // In the pick queue. Wander until a pick lands.
        if (!tryPick(s, d, picks) || d.target < 0) { if (d.tint !== BLANK) wander(s, d, dt); return }
      }
      const c = s.chunks[d.target]
      if (!c || !eligible(s, c)) {
        d.target = -1
        if (++d.stolen >= STOLEN_LIMIT) goBlank(s, d, true)
        return
      }
      if (followPath(s, d, DRONE_SPEED, dt)) { latch(s, d, c); return }
      if (d.seekTime > SEEK_TIMEOUT) goBlank(s, d, true)
      return
    }
    case 'latched':
    case 'carrying':
      return // crews move these
  }
}

/** Advance the colony by `dt` seconds (already tempo-scaled). */
export function stepColony(s: SalvageState, dt: number): void {
  const picks = makePicks()
  const frame = { lifts: 1 }
  const before = s.fieldVersion
  for (const crew of s.crews.slice()) stepCrew(s, crew, dt, frame)
  // A lift or a drop already cost this frame its reach flood (and made every tint
  // field stale); keep the field rebuild for the next frame.
  if (s.fieldVersion !== before) picks.floods = 0
  for (const d of s.drones.slice()) {
    if (d.retiring && d.state === 'blank') { const j = s.drones.indexOf(d); if (j >= 0) s.drones.splice(j, 1); continue }
    stepDrone(s, d, dt, picks)
  }
}

/** Live `drones` slider / capacity: shrink by removing blank drones first, then seekers;
 *  a carrier is only marked and leaves when its crew disbands. Grow by spawning blank
 *  drones on reachable free cells. */
export function reconcileDrones(s: SalvageState, target: number): void {
  while (s.drones.length > target) {
    let i = s.drones.findIndex((d) => d.state === 'blank')
    if (i < 0) i = s.drones.findIndex((d) => d.state === 'seeking')
    if (i < 0) break
    s.drones.splice(i, 1)
  }
  let extra = s.drones.length - target
  for (const d of s.drones) { if (extra <= 0) break; if (!d.retiring) { d.retiring = true; extra-- } }
  if (s.drones.length <= target) for (const d of s.drones) d.retiring = false
  let guard = 0
  while (s.drones.length < target && guard++ < 20000) {
    const col = Math.floor(s.rand() * s.cols), row = Math.floor(s.rand() * s.rows)
    const i = cellIndex(s.grid, col, row)
    if (s.grid.occ[i] !== FREE || s.grid.reach[i] !== 1) continue
    spawnDrone(s, col + 0.5, row + 0.5)
  }
}

/** A phase flip: everyone blank, immunities cleared, crews gone. */
export function blankAll(s: SalvageState): void {
  for (const crew of s.crews) crew.chunk.crew = null
  s.crews = []
  for (const d of s.drones) {
    d.immuneUntil = new Float64Array(Math.max(1, s.palette.length))
    d.tint = BLANK; d.state = 'blank'; d.target = -1; d.avoid = -1; d.path = []; d.stolen = 0; d.seekTime = 0
  }
}

/** After a new picture is built, drones standing inside it are nudged out. */
export function relocateStranded(s: SalvageState): void {
  for (const d of s.drones) {
    snapToFree(s, d)
    const i = cellOf(s, d)
    if (s.grid.reach[i] !== 1) {
      // Still unreachable (inside a hole): respawn on a reachable cell.
      for (let guard = 0; guard < 20000; guard++) {
        const j = cellIndex(s.grid, Math.floor(s.rand() * s.cols), Math.floor(s.rand() * s.rows))
        if (s.grid.occ[j] === FREE && s.grid.reach[j] === 1) { d.x = (j % s.cols) + 0.5; d.y = Math.floor(j / s.cols) + 0.5; break }
      }
    }
  }
}
