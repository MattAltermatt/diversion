// sim.ts — the Outbreak ecosystem. Struct-of-Arrays state, fixed-timestep stepping,
// the three-faction conversion cycle, and terminal/settle detection for reseed.
// Foundation (#233): no guns yet (fighters recruit + huddle but can't kill), so the
// horde ultimately wins or the arena settles — either way it reseeds. Combat (#234)
// adds bullets + fear/enrage; arena (#235) adds walls; juice (#236) the banner/rings.
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'
import { addSeek, addAvoid, addFlee, addCohesion, addSeparation } from './steering'
import { fireStep, bulletStep } from './combat'
import { generateArena, insideWall, resolveWall, addWallAvoid, type Arena } from './arena'
import { createNavGrid, rebuildFields, sampleField, losClear, type NavGrid } from './navField'

export const CIVILIAN = 0
export const FIGHTER = 1
export const ZOMBIE = 2

export const WORLD_W = 1600
export const WORLD_H = 900

export const DT = 1 / 60 // fixed sim timestep (seconds); `speed` runs N steps per frame
const TURN = 0.16 // velocity lerp toward desired heading (0..1) — smooth turning

// Interaction radii (world px). All are ≤ the hash cell so a clamped 3×3 block finds
// every neighbour within them (see spatialHash). Internal tuning for now; #238 exposes.
const CELL = 150
const ZOMBIE_PERCEPT = 150 // hunt range for the nearest non-zombie
const ZOMBIE_CLUMP_R = 90
const CIV_SEEK_R = 150 // a fighter's own range for spotting civilians to recruit
const FIGHTER_FORM_R = 120 // loose huddle
const WALL_AVOID_R = 14 // agents steer off a wall within this range — MUST stay well
// under the corridor width (see arena.ts street fraction) or narrow streets seal shut
const W_WALL_AVOID = 2.2 // strong — agents should skirt buildings, not clip them
const SEP_R = 7 // personal space — tight so crowds pack densely (still not a point)
const BITE_R = 5 // a zombie must be nearly on top of prey to bite
const RECRUIT_R = 14 // a fighter must be close to pull a civilian in
const INFECT_DELAY = 1.2 // seconds bitten → turned
const SETTLE_SECONDS = 14 // no conversion/death for this long → reseed by headcount

// Steering weights (unit-vector contributions).
const W_ZOMBIE_HUNT = 1.0
const W_ZOMBIE_CLUMP = 0.35
const W_CIV_FLEE = 1.4
const W_CIV_SEEK = 0.5
const W_FIGHTER_FORM = 0.5
const W_FIGHTER_ADVANCE = 1.0 // fighters close to engagement range
const W_FIGHTER_KITE = 1.3 // and back off if a zombie gets inside it
const W_FIGHTER_RECRUIT_SEEK = 0.4 // gentle drift toward civilians to recruit
const W_ZOMBIE_CHARGE = 1.6 // enraged: drive at the nearest fighter
const W_ZOMBIE_FEAR = 1.0 // calm: stand off from the guns
const ENRAGE_SPEED_MULT = 1.5 // enraged zombies surge — briefly outrunning the humans
const LUNGE_R = 100 // once a zombie closes within this of its target it LUNGES...
const LUNGE_SPEED_MULT = 1.5 // ...surging to run the prey down (a 7% edge never catches a fleer)
const W_SEP = 1.1 // personal-space shove — dominates only at genuine overlap
const NAV_REBUILD = 6 // rebuild the flow fields every N sim-steps (~10Hz) — cheap, ~1 cell stale

export interface SimConfig {
  civilianCount: number
  fighterCount: number
  zombieCount: number
  zombieSpeed: number
  humanSpeed: number
  civilianSight: number
  seed: number
  arenaDensity: number
  // combat (#234)
  fighterRange: number
  fireCooldown: number // seconds between shots (= 1 / fireRate)
  magazine: number
  reloadTime: number
  bulletSpeed: number
  zombieFearRadius: number
  enrageRadius: number
  enrageTime: number
}

export type Outcome = 'horde' | 'humans' | null

export interface Ecosystem {
  cfg: SimConfig
  n: number
  px: Float32Array
  py: Float32Array
  vx: Float32Array
  vy: Float32Array
  faction: Uint8Array
  alive: Uint8Array
  infecting: Uint8Array
  infectTimer: Float32Array
  // combat (#234) — per-agent (fighters use ammo/reloadT/fireT; zombies use enrageT)
  ammo: Int16Array
  reloadT: Float32Array
  fireT: Float32Array
  enrageT: Float32Array
  // bullet pool
  bx: Float32Array
  by: Float32Array
  bvx: Float32Array
  bvy: Float32Array
  brange: Float32Array
  balive: Uint8Array
  bulletCursor: number
  arena: Arena
  navGrid: NavGrid
  hash: SpatialHash
  rng: () => number
  simTime: number
  stepCount: number
  lastEventTime: number
  // live counts (recomputed each step) — HUD + terminal detection
  civAlive: number
  fighterAlive: number
  zombieAlive: number
  outcome: Outcome
  // scratch (reused; zero per-step alloc)
  neigh: number[]
  acc: Float32Array
  navOut: Float32Array // sampleField writes a unit direction here
}

export function createSim(cfg: SimConfig): Ecosystem {
  const rng = mulberry32(cfg.seed >>> 0)
  const n = cfg.civilianCount + cfg.fighterCount + cfg.zombieCount
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const faction = new Uint8Array(n)
  const alive = new Uint8Array(n).fill(1)
  const infecting = new Uint8Array(n)
  const infectTimer = new Float32Array(n)
  const ammo = new Int16Array(n)
  const reloadT = new Float32Array(n)
  const fireT = new Float32Array(n)
  const enrageT = new Float32Array(n)
  const bulletCap = Math.max(1024, n)
  const arena = generateArena(cfg.seed, cfg.arenaDensity, WORLD_W, WORLD_H)
  const navGrid = createNavGrid(arena, WORLD_W, WORLD_H)

  const seedHeading = (i: number, speed: number) => {
    const a = rng() * Math.PI * 2
    vx[i] = Math.cos(a) * speed * 0.5
    vy[i] = Math.sin(a) * speed * 0.5
  }

  let i = 0
  // Fighters cluster on the left edge.
  for (let k = 0; k < cfg.fighterCount; k++, i++) {
    faction[i] = FIGHTER
    ammo[i] = cfg.magazine
    px[i] = 40 + rng() * 180
    py[i] = 80 + rng() * (WORLD_H - 160)
    seedHeading(i, cfg.humanSpeed)
  }
  // Zombies cluster on the right edge.
  for (let k = 0; k < cfg.zombieCount; k++, i++) {
    faction[i] = ZOMBIE
    px[i] = WORLD_W - 220 + rng() * 180
    py[i] = 80 + rng() * (WORLD_H - 160)
    seedHeading(i, cfg.zombieSpeed)
  }
  // Civilians scattered through the interior.
  for (let k = 0; k < cfg.civilianCount; k++, i++) {
    faction[i] = CIVILIAN
    let x = 800, y = 450
    for (let t = 0; t < 16; t++) { // resample out of buildings
      x = 280 + rng() * (WORLD_W - 560)
      y = 60 + rng() * (WORLD_H - 120)
      if (!insideWall(arena, x, y)) break
    }
    px[i] = x; py[i] = y
    seedHeading(i, cfg.humanSpeed)
  }

  const eco: Ecosystem = {
    cfg, n, px, py, vx, vy, faction, alive, infecting, infectTimer,
    ammo, reloadT, fireT, enrageT,
    bx: new Float32Array(bulletCap), by: new Float32Array(bulletCap),
    bvx: new Float32Array(bulletCap), bvy: new Float32Array(bulletCap),
    brange: new Float32Array(bulletCap), balive: new Uint8Array(bulletCap), bulletCursor: 0,
    arena,
    navGrid,
    hash: new SpatialHash(WORLD_W, WORLD_H, CELL, n),
    rng, simTime: 0, stepCount: 0, lastEventTime: 0,
    civAlive: cfg.civilianCount, fighterAlive: cfg.fighterCount, zombieAlive: cfg.zombieCount,
    outcome: null,
    neigh: [], acc: new Float32Array(2), navOut: new Float32Array(2),
  }
  return eco
}

/** Nearest live agent of faction `want` to i within r, or the nearest of EITHER of
 *  two wanted factions when `want2` is given. Returns -1 if none. */
function nearestOf(e: Ecosystem, i: number, r: number, want: number, want2?: number): number {
  const a = e.hash.nearestWithin(e.px, e.py, i, r, e.alive, e.faction, want)
  if (want2 === undefined) return a
  const b = e.hash.nearestWithin(e.px, e.py, i, r, e.alive, e.faction, want2)
  if (a === -1) return b
  if (b === -1) return a
  const da = (e.px[a] - e.px[i]) ** 2 + (e.py[a] - e.py[i]) ** 2
  const db = (e.px[b] - e.px[i]) ** 2 + (e.py[b] - e.py[i]) ** 2
  return da <= db ? a : b
}

/** Nearest living human (civilian or fighter) to i, scanning the WHOLE arena — the
 *  long-range fallback so a zombie with no prey in local perception still advances on
 *  the brains instead of idling. Returns -1 only if no humans remain. */
function nearestHumanGlobal(e: Ecosystem, i: number): number {
  let best = -1, bestD2 = Infinity
  const xi = e.px[i], yi = e.py[i]
  for (let j = 0; j < e.n; j++) {
    if (!e.alive[j] || e.faction[j] === ZOMBIE) continue
    const dx = e.px[j] - xi, dy = e.py[j] - yi
    const d2 = dx * dx + dy * dy
    if (d2 < bestD2) { bestD2 = d2; best = j }
  }
  return best
}

export function stepSim(e: Ecosystem): void {
  const { px, py, vx, vy, faction, alive, infecting, infectTimer, acc } = e
  e.hash.rebuild(px, py, e.n, alive)
  // Refresh the flow fields every NAV_REBUILD steps (keyed off stepCount so slow-mo /
  // fast-forward stay correct). Agents route these when their target is behind a wall.
  if (e.stepCount % NAV_REBUILD === 0) rebuildFields(e.navGrid, e, ZOMBIE)
  e.stepCount++
  const zspeed = e.cfg.zombieSpeed, hspeed = e.cfg.humanSpeed

  // ── Loop 1: desired heading → velocity (reads only positions → order-independent).
  for (let i = 0; i < e.n; i++) {
    if (!alive[i]) continue
    acc[0] = 0; acc[1] = 0
    const f = faction[i]
    let civAlert = true // civilians only move when they've spotted a zombie or fighter
    let lunge = false // a zombie surging in for the kill
    if (f === ZOMBIE) {
      // Pick a target: enraged → nearest fighter (charge); else nearest local civilian
      // (wary of guns); else the nearest human ANYWHERE (never idle).
      let target = -1, targetW = W_ZOMBIE_HUNT
      if (e.enrageT[i] > 0) {
        const fgt = nearestOf(e, i, ZOMBIE_PERCEPT, FIGHTER)
        if (fgt !== -1) { target = fgt; targetW = W_ZOMBIE_CHARGE }
      }
      if (target === -1) {
        const prey = nearestOf(e, i, ZOMBIE_PERCEPT, CIVILIAN)
        if (prey !== -1) {
          target = prey
          const fgt = nearestOf(e, i, e.cfg.zombieFearRadius, FIGHTER) // wary of guns near easy prey
          if (fgt !== -1) addAvoid(px[i], py[i], px[fgt], py[fgt], W_ZOMBIE_FEAR, acc)
        } else {
          target = nearestHumanGlobal(e, i)
        }
      }
      if (target !== -1) {
        // Direct-seek when the prey is in sight (lunge on the straightaway); otherwise
        // descend the human field to route around the wall between them.
        if (losClear(e.arena, px[i], py[i], px[target], py[target])) {
          addSeek(px[i], py[i], px[target], py[target], targetW, acc)
          const d2 = (px[target] - px[i]) ** 2 + (py[target] - py[i]) ** 2
          if (d2 < LUNGE_R * LUNGE_R) lunge = true // close enough to run it down
        } else if (sampleField(e.navGrid, e.navGrid.humanDist, px[i], py[i], true, e.navOut)) {
          acc[0] += e.navOut[0] * targetW; acc[1] += e.navOut[1] * targetW
        } else {
          addSeek(px[i], py[i], px[target], py[target], targetW, acc) // no gradient → best effort
        }
      }
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, ZOMBIE_CLUMP_R, 24, e.neigh, faction, ZOMBIE)
      addCohesion(px, py, i, e.neigh, W_ZOMBIE_CLUMP, acc)
    } else if (f === CIVILIAN) {
      const sight = e.cfg.civilianSight // adjustable eyesight — flee + seek share it
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, sight, 24, e.neigh, faction, ZOMBIE)
      const nearZ = nearestOf(e, i, sight, ZOMBIE)
      if (nearZ !== -1) {
        // Flee directly from every visible zombie; if the nearest is behind a wall, ascend
        // the zombie field instead so panic routes down a corridor (not into the wall).
        if (losClear(e.arena, px[i], py[i], px[nearZ], py[nearZ])) {
          addFlee(px, py, i, e.neigh, sight, W_CIV_FLEE, acc)
        } else if (sampleField(e.navGrid, e.navGrid.zombieDist, px[i], py[i], false, e.navOut)) {
          acc[0] += e.navOut[0] * W_CIV_FLEE; acc[1] += e.navOut[1] * W_CIV_FLEE
        } else {
          addFlee(px, py, i, e.neigh, sight, W_CIV_FLEE, acc)
        }
      }
      const safe = nearestOf(e, i, sight, FIGHTER)
      if (safe !== -1) addSeek(px[i], py[i], px[safe], py[safe], W_CIV_SEEK, acc)
      civAlert = nearZ !== -1 || safe !== -1 // saw a zombie (flee) or a fighter (seek)
    } else { // FIGHTER — advance on the horde to engagement range, hold, kite if overrun
      const z = nearestOf(e, i, ZOMBIE_PERCEPT, ZOMBIE)
      if (z !== -1) {
        const d = Math.hypot(px[z] - px[i], py[z] - py[i])
        const R = e.cfg.fighterRange
        if (d > R * 0.75) {
          // Advance toward the horde — direct when in sight, else descend the zombie field
          // so fighters thread corridors toward the front (and pin at a chokepoint mouth).
          if (losClear(e.arena, px[i], py[i], px[z], py[z])) addSeek(px[i], py[i], px[z], py[z], W_FIGHTER_ADVANCE, acc)
          else if (sampleField(e.navGrid, e.navGrid.zombieDist, px[i], py[i], true, e.navOut)) { acc[0] += e.navOut[0] * W_FIGHTER_ADVANCE; acc[1] += e.navOut[1] * W_FIGHTER_ADVANCE }
          else addSeek(px[i], py[i], px[z], py[z], W_FIGHTER_ADVANCE, acc)
        } else if (d < R * 0.45) addAvoid(px[i], py[i], px[z], py[z], W_FIGHTER_KITE, acc)
      }
      const civ = nearestOf(e, i, CIV_SEEK_R, CIVILIAN) // drift toward civilians to recruit
      if (civ !== -1) addSeek(px[i], py[i], px[civ], py[civ], W_FIGHTER_RECRUIT_SEEK, acc)
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, FIGHTER_FORM_R, 16, e.neigh, faction, FIGHTER)
      addCohesion(px, py, i, e.neigh, W_FIGHTER_FORM, acc)
    }
    // Separation is SAME-FACTION only — each crowd keeps its volume, but a zombie is
    // never pushed off the prey it's biting (personal space > bite range would otherwise
    // make it impossible to catch anyone). Skipped for a RESTING civilian so it holds still.
    if (f !== CIVILIAN || civAlert) {
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, SEP_R, 12, e.neigh, faction, f)
      addSeparation(px, py, i, e.neigh, W_SEP, acc)
      addWallAvoid(e.arena, px[i], py[i], WALL_AVOID_R, W_WALL_AVOID, acc)
    }
    let maxSpeed = f === ZOMBIE ? zspeed : hspeed
    if (f === ZOMBIE) { // enrage surge and the closing lunge both let a zombie outrun a fleer
      const mult = Math.max(e.enrageT[i] > 0 ? ENRAGE_SPEED_MULT : 1, lunge ? LUNGE_SPEED_MULT : 1)
      maxSpeed *= mult
    }
    const m = Math.hypot(acc[0], acc[1])
    let dvx: number, dvy: number
    if (m > 1e-6) { dvx = (acc[0] / m) * maxSpeed; dvy = (acc[1] / m) * maxSpeed }
    else if (f === CIVILIAN) { dvx = 0; dvy = 0 } // nothing in sight → settle to a stop
    else { // zombie/fighter with no input → coast in the current heading
      const vm = Math.hypot(vx[i], vy[i]) || 1e-6
      dvx = (vx[i] / vm) * maxSpeed; dvy = (vy[i] / vm) * maxSpeed
    }
    vx[i] += (dvx - vx[i]) * TURN
    vy[i] += (dvy - vy[i]) * TURN
    const vm = Math.hypot(vx[i], vy[i])
    if (vm > maxSpeed) { vx[i] = (vx[i] / vm) * maxSpeed; vy[i] = (vy[i] / vm) * maxSpeed }
  }

  // ── Loop 2: integrate + bounce off arena bounds.
  for (let i = 0; i < e.n; i++) {
    if (!alive[i]) continue
    px[i] += vx[i] * DT
    py[i] += vy[i] * DT
    if (px[i] < 6) { px[i] = 6; vx[i] = -vx[i] * 0.5 }
    else if (px[i] > WORLD_W - 6) { px[i] = WORLD_W - 6; vx[i] = -vx[i] * 0.5 }
    if (py[i] < 6) { py[i] = 6; vy[i] = -vy[i] * 0.5 }
    else if (py[i] > WORLD_H - 6) { py[i] = WORLD_H - 6; vy[i] = -vy[i] * 0.5 }
    const wall = insideWall(e.arena, px[i], py[i])
    if (wall) {
      const [nx, ny, ax] = resolveWall(wall, px[i], py[i])
      px[i] = nx; py[i] = ny
      if (ax === 0) vx[i] = -vx[i] * 0.3; else vy[i] = -vy[i] * 0.3
    }
  }

  // ── Combat: rebuild the hash on post-move positions, then fighters fire and bullets
  //    resolve (kills + enrage bursts). The conversions below reuse this same hash.
  e.hash.rebuild(px, py, e.n, alive)
  fireStep(e)
  const kills = bulletStep(e)

  // ── Conversion cycle. Bites first (mark infecting), then recruit (skips infecting),
  //    then tick infections to their flip. Any event resets the settle clock.
  let event = kills > 0
  // Bite: each zombie marks nearby non-zombies for infection.
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || faction[i] !== ZOMBIE) continue
    e.neigh.length = 0
    e.hash.neighborsWithin(px, py, i, BITE_R, 8, e.neigh)
    for (const j of e.neigh) {
      if (alive[j] && faction[j] !== ZOMBIE && !infecting[j]) {
        infecting[j] = 1; infectTimer[j] = INFECT_DELAY; event = true
      }
    }
  }
  // Recruit: each fighter converts nearby uninfected civilians to fighters.
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || faction[i] !== FIGHTER) continue
    e.neigh.length = 0
    e.hash.neighborsWithin(px, py, i, RECRUIT_R, 8, e.neigh, faction, CIVILIAN)
    for (const j of e.neigh) {
      if (alive[j] && !infecting[j]) {
        faction[j] = FIGHTER; e.ammo[j] = e.cfg.magazine; e.reloadT[j] = 0; e.fireT[j] = 0
        event = true
      }
    }
  }
  // Infection tick: bitten agents keep their behaviour until the timer flips them.
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || !infecting[i]) continue
    infectTimer[i] -= DT
    if (infectTimer[i] <= 0) { faction[i] = ZOMBIE; infecting[i] = 0; event = true }
  }

  for (let i = 0; i < e.n; i++) if (e.enrageT[i] > 0) e.enrageT[i] -= DT

  e.simTime += DT
  if (event) e.lastEventTime = e.simTime

  // ── Recount + terminal/settle outcome (read by shouldRestart).
  let civ = 0, fig = 0, zom = 0
  for (let i = 0; i < e.n; i++) {
    if (!alive[i]) continue
    const fc = faction[i]
    if (fc === CIVILIAN) civ++; else if (fc === FIGHTER) fig++; else zom++
  }
  e.civAlive = civ; e.fighterAlive = fig; e.zombieAlive = zom
  if (zom === 0) e.outcome = 'humans'
  else if (civ + fig === 0) e.outcome = 'horde'
  else if (e.simTime - e.lastEventTime > SETTLE_SECONDS) {
    e.outcome = zom > civ + fig ? 'horde' : 'humans'
  }
}

/** True once the outbreak has resolved (terminal or settled) → framework reseeds. */
export function isResolved(e: Ecosystem): boolean {
  return e.outcome !== null
}
