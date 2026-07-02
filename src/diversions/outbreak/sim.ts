// sim.ts — the Outbreak ecosystem. Struct-of-Arrays state, fixed-timestep stepping,
// the three-faction conversion cycle, and terminal/settle detection for reseed.
// Foundation (#233): no guns yet (fighters recruit + huddle but can't kill), so the
// horde ultimately wins or the arena settles — either way it reseeds. Combat (#234)
// adds bullets + fear/enrage; arena (#235) adds walls; juice (#236) the banner/rings.
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'
import { addSeek, addAvoid, addFlee, addCohesion, addSeparation } from './steering'

export const CIVILIAN = 0
export const FIGHTER = 1
export const ZOMBIE = 2

export const WORLD_W = 1600
export const WORLD_H = 900

const DT = 1 / 60 // fixed sim timestep (seconds); `speed` runs N steps per frame
const TURN = 0.16 // velocity lerp toward desired heading (0..1) — smooth turning

// Interaction radii (world px). All are ≤ the hash cell so a clamped 3×3 block finds
// every neighbour within them (see spatialHash). Internal tuning for now; #238 exposes.
const CELL = 150
const ZOMBIE_PERCEPT = 150 // hunt range for the nearest non-zombie
const ZOMBIE_CLUMP_R = 90
const CIV_FLEE_R = 110
const CIV_SEEK_R = 150 // sense a nearby fighter to run toward
const FIGHTER_FORM_R = 120 // loose huddle
const FIGHTER_BACK_R = 120 // back away from the nearest zombie (no guns yet)
const SEP_R = 15 // personal space — keeps a crowd a crowd, not a point
const BITE_R = 9
const RECRUIT_R = 32
const INFECT_DELAY = 1.2 // seconds bitten → turned
const SETTLE_SECONDS = 14 // no conversion/death for this long → reseed by headcount

// Steering weights (unit-vector contributions).
const W_ZOMBIE_HUNT = 1.0
const W_ZOMBIE_CLUMP = 0.35
const W_CIV_FLEE = 1.4
const W_CIV_SEEK = 0.5
const W_FIGHTER_FORM = 0.5
const W_FIGHTER_BACK = 0.9
const W_SEP = 1.1 // personal-space shove — dominates only at genuine overlap

export interface SimConfig {
  civilianCount: number
  fighterCount: number
  zombieCount: number
  zombieSpeed: number
  humanSpeed: number
  seed: number
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
  hash: SpatialHash
  rng: () => number
  simTime: number
  lastEventTime: number
  // live counts (recomputed each step) — HUD + terminal detection
  civAlive: number
  fighterAlive: number
  zombieAlive: number
  outcome: Outcome
  // scratch (reused; zero per-step alloc)
  neigh: number[]
  acc: Float32Array
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

  const seedHeading = (i: number, speed: number) => {
    const a = rng() * Math.PI * 2
    vx[i] = Math.cos(a) * speed * 0.5
    vy[i] = Math.sin(a) * speed * 0.5
  }

  let i = 0
  // Fighters cluster on the left edge.
  for (let k = 0; k < cfg.fighterCount; k++, i++) {
    faction[i] = FIGHTER
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
    px[i] = 280 + rng() * (WORLD_W - 560)
    py[i] = 60 + rng() * (WORLD_H - 120)
    seedHeading(i, cfg.humanSpeed)
  }

  const eco: Ecosystem = {
    cfg, n, px, py, vx, vy, faction, alive, infecting, infectTimer,
    hash: new SpatialHash(WORLD_W, WORLD_H, CELL, n),
    rng, simTime: 0, lastEventTime: 0,
    civAlive: cfg.civilianCount, fighterAlive: cfg.fighterCount, zombieAlive: cfg.zombieCount,
    outcome: null,
    neigh: [], acc: new Float32Array(2),
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

export function stepSim(e: Ecosystem): void {
  const { px, py, vx, vy, faction, alive, infecting, infectTimer, acc } = e
  e.hash.rebuild(px, py, e.n, alive)
  const zspeed = e.cfg.zombieSpeed, hspeed = e.cfg.humanSpeed

  // ── Loop 1: desired heading → velocity (reads only positions → order-independent).
  for (let i = 0; i < e.n; i++) {
    if (!alive[i]) continue
    acc[0] = 0; acc[1] = 0
    const f = faction[i]
    if (f === ZOMBIE) {
      const prey = nearestOf(e, i, ZOMBIE_PERCEPT, CIVILIAN, FIGHTER)
      if (prey !== -1) addSeek(px[i], py[i], px[prey], py[prey], W_ZOMBIE_HUNT, acc)
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, ZOMBIE_CLUMP_R, 24, e.neigh, faction, ZOMBIE)
      addCohesion(px, py, i, e.neigh, W_ZOMBIE_CLUMP, acc)
    } else if (f === CIVILIAN) {
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, CIV_FLEE_R, 24, e.neigh, faction, ZOMBIE)
      addFlee(px, py, i, e.neigh, CIV_FLEE_R, W_CIV_FLEE, acc)
      const safe = nearestOf(e, i, CIV_SEEK_R, FIGHTER)
      if (safe !== -1) addSeek(px[i], py[i], px[safe], py[safe], W_CIV_SEEK, acc)
    } else { // FIGHTER
      e.neigh.length = 0
      e.hash.neighborsWithin(px, py, i, FIGHTER_FORM_R, 24, e.neigh, faction, FIGHTER)
      addCohesion(px, py, i, e.neigh, W_FIGHTER_FORM, acc)
      const threat = nearestOf(e, i, FIGHTER_BACK_R, ZOMBIE)
      if (threat !== -1) addAvoid(px[i], py[i], px[threat], py[threat], W_FIGHTER_BACK, acc)
    }
    // Separation from ALL nearby agents (any faction) → crowds keep their volume.
    e.neigh.length = 0
    e.hash.neighborsWithin(px, py, i, SEP_R, 12, e.neigh)
    addSeparation(px, py, i, e.neigh, W_SEP, acc)
    const maxSpeed = f === ZOMBIE ? zspeed : hspeed
    const m = Math.hypot(acc[0], acc[1])
    let dvx: number, dvy: number
    if (m > 1e-6) { dvx = (acc[0] / m) * maxSpeed; dvy = (acc[1] / m) * maxSpeed }
    else { // coast in the current heading
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
  }

  // ── Conversion cycle. Bites first (mark infecting), then recruit (skips infecting),
  //    then tick infections to their flip. Any event resets the settle clock.
  let event = false
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
      if (alive[j] && !infecting[j]) { faction[j] = FIGHTER; event = true }
    }
  }
  // Infection tick: bitten agents keep their behaviour until the timer flips them.
  for (let i = 0; i < e.n; i++) {
    if (!alive[i] || !infecting[i]) continue
    infectTimer[i] -= DT
    if (infectTimer[i] <= 0) { faction[i] = ZOMBIE; infecting[i] = 0; event = true }
  }

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
