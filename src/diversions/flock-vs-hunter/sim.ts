// sim.ts — the deterministic ecosystem. Fixed 1/60 timestep, seeded sub-streams,
// fixed 1600×900 virtual world with toroidal wrap. Task 5 = movement/catch/fitness;
// Task 6 adds the round scheduler + breeding.
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'
import { flockAccel, predatorAim, type FlockParams } from './steering'
import {
  FLOCK_SPEC, PRED_SPEC, F, P, randomGenome, randomGenome as rnd, type Genome,
} from './genome'
import { breedGeneration, annealedRate, type Scored } from './ga'

const wrapDelta = (d: number, L: number) => d - L * Math.round(d / L) // min-image torus delta

export const DT = 1 / 60
export const WORLD_W = 1600
export const WORLD_H = 900
// Perception radius (also the spatial-hash cell size). At 240 boids in a 1600×900
// world, a 140-radius circle holds ~10 neighbors on average — the density flocking
// needs to cohere into a murmuration. (64 gave only ~2 neighbors → a diffuse gas.)
const PERCEPTION = 140 // world units; == spatial-hash cell size
const CATCH_R = 8
const MAX_NEIGHBORS = 24
const MAX_FORCE = 500 // accel clamp (world units / s²) — a safety cap, not always active
const LUNGE_STEPS = 48 // ~0.8 s at 60 Hz
const FATIGUE_FRAC = 0.7
// Respawn immunity: a boid reborn at the flock centroid (where predators converge)
// gets a brief grace window during which it can't be caught, so the "dead slots
// refill" turnover can't instantly re-kill a fresh boid at spawn. ~0.33 s — a
// mechanism guard for the population-full invariant, imperceptible in motion.
const RESPAWN_GRACE = 20
// Continuous respawn: a caught boid reappears near the flock centroid after this
// delay (with spawn-immunity), so the flock density stays high and the screen never
// empties. The caught boid still forfeits the survival ticks (fitness) it would have
// earned. ~0.75 s reads as a brief "puff → rejoin the murmuration".
const RESPAWN_DELAY = 45
const SPAWN_JITTER = 40 // px radius of the respawn scatter around the flock centre

export interface SimConfig {
  boidCount: number
  predatorCount: number
  seed: number
  roundLength: number // seconds (used in Task 6)
  flockMutationRate: number
  predMutationRate: number
  flockElites: number
  predElites: number
  immigrateEvery: number
  seasons: boolean
}

// Test-only default fixture. The player-facing defaults live in schema.ts (the
// single source of truth); `seed` here is a conventional test seed, not that default.
export const DEFAULT_SIM_CONFIG: SimConfig = {
  boidCount: 240, predatorCount: 4, seed: 42, roundLength: 22,
  flockMutationRate: 0.12, predMutationRate: 0.15, flockElites: 6, predElites: 1,
  immigrateEvery: 6, seasons: true,
}

export interface Ecosystem {
  cfg: SimConfig
  n: number // flock count
  pn: number // predator count
  px: Float32Array; py: Float32Array; vx: Float32Array; vy: Float32Array
  alive: Uint8Array
  survival: Float32Array // ticks alive this round (fitness accumulator)
  flockGenomes: Genome[]
  ppx: Float32Array; ppy: Float32Array; pvx: Float32Array; pvy: Float32Array
  predGenomes: Genome[]
  predKills: Float32Array // kills this round (fitness)
  predTarget: Int32Array // current target boid index, or -1
  predLunge: Int32Array // remaining lunge steps, or 0
  respawnGrace: Int32Array // per-boid ticks of spawn-immunity remaining (no catch)
  respawnTimer: Int32Array // per-boid ticks until a caught boid reappears (0 = not respawning)
  totalKills: number
  tickCount: number
  generation: number
  rngSpawn: () => number
  rngEvo: () => number
  rngTick: () => number
  hash: SpatialHash
  _neigh: number[] // reused neighbor-index scratch (no per-tick alloc)
  _fp: FlockParams // reused flock-params scratch (no per-boid alloc)
  _acc: Float32Array // reused [ax,ay] accel scratch (no per-boid alloc)
  gen1Elite?: { flock: number[]; pred: number[] }
  gen3Elite?: { flock: number[]; pred: number[] }
}

const wrap = (v: number, hi: number) => ((v % hi) + hi) % hi

export function createSim(cfg: SimConfig): Ecosystem {
  const rngSpawn = mulberry32((cfg.seed ^ 0x1a2b3c4d) >>> 0)
  const rngEvo = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const rngTick = mulberry32((cfg.seed ^ 0x517cc1b7) >>> 0)
  const n = cfg.boidCount, pn = cfg.predatorCount
  const s: Ecosystem = {
    cfg, n, pn,
    px: new Float32Array(n), py: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n),
    alive: new Uint8Array(n).fill(1),
    survival: new Float32Array(n),
    flockGenomes: Array.from({ length: n }, () => randomGenome(FLOCK_SPEC, rngSpawn)),
    ppx: new Float32Array(pn), ppy: new Float32Array(pn),
    pvx: new Float32Array(pn), pvy: new Float32Array(pn),
    predGenomes: Array.from({ length: pn }, () => randomGenome(PRED_SPEC, rngSpawn)),
    predKills: new Float32Array(pn),
    predTarget: new Int32Array(pn).fill(-1),
    predLunge: new Int32Array(pn),
    respawnGrace: new Int32Array(n),
    respawnTimer: new Int32Array(n),
    totalKills: 0, tickCount: 0, generation: 1,
    rngSpawn, rngEvo, rngTick,
    hash: new SpatialHash(WORLD_W, WORLD_H, PERCEPTION),
    _neigh: [],
    _fp: { separationW: 0, alignmentW: 0, cohesionW: 0, fearW: 0, fearRadius: 0, maxForce: MAX_FORCE },
    _acc: new Float32Array(2),
  }
  // Dispersed spawn: boids start scattered across the world with random headings.
  // A murmuration must SELF-ORGANIZE from this (proving the flocking is emergent,
  // driven by the steering forces + selection, not imposed by a clumped spawn).
  for (let i = 0; i < n; i++) {
    s.px[i] = rngSpawn() * WORLD_W
    s.py[i] = rngSpawn() * WORLD_H
    const a = rngSpawn() * Math.PI * 2
    s.vx[i] = Math.cos(a) * 60; s.vy[i] = Math.sin(a) * 60
  }
  for (let k = 0; k < pn; k++) {
    s.ppx[k] = rngSpawn() * WORLD_W; s.ppy[k] = rngSpawn() * WORLD_H
  }
  return s
}

/** Deterministic "seasons": ±10% predator-speed multiplier from tickCount. */
function seasonMul(s: Ecosystem): number {
  if (!s.cfg.seasons) return 1
  return 1 + 0.1 * Math.sin(s.tickCount / (60 * 180) * Math.PI * 2) // ~3 min period
}

export function stepSim(s: Ecosystem): void {
  s.hash.rebuild(s.px, s.py, s.n, s.alive) // only alive boids are neighbor candidates
  const seas = seasonMul(s)
  const c = centroid(s) // start-of-tick flock centre, for melt-in respawns

  // — flock —
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) {
      // caught boids reappear near the flock after RESPAWN_DELAY → never empties
      if (s.respawnTimer[i] > 0 && --s.respawnTimer[i] === 0) {
        s.px[i] = wrap(c.x + (s.rngSpawn() * 2 - 1) * SPAWN_JITTER, WORLD_W)
        s.py[i] = wrap(c.y + (s.rngSpawn() * 2 - 1) * SPAWN_JITTER, WORLD_H)
        s.vx[i] = c.vx; s.vy[i] = c.vy
        s.alive[i] = 1
        s.respawnGrace[i] = RESPAWN_GRACE
      }
      continue
    }
    if (s.respawnGrace[i] > 0) s.respawnGrace[i] -= 1
    s.survival[i] += 1
    const g = s.flockGenomes[i]
    s._neigh.length = 0
    s.hash.neighborsWithin(s.px, s.py, i, PERCEPTION, MAX_NEIGHBORS, s._neigh)
    const fp = s._fp // reused scratch — no per-boid object
    fp.separationW = g[F.sep]; fp.alignmentW = g[F.ali]; fp.cohesionW = g[F.coh]
    fp.fearW = g[F.fear]; fp.fearRadius = g[F.fearR]
    flockAccel(s.px, s.py, s.vx, s.vy, i, s._neigh, s.pn, fp, s.ppx, s.ppy, WORLD_W, WORLD_H, s._acc)
    s.vx[i] += s._acc[0] * DT; s.vy[i] += s._acc[1] * DT
    const maxSpeed = g[F.spd]
    const sp = Math.hypot(s.vx[i], s.vy[i])
    if (sp > maxSpeed) { s.vx[i] = (s.vx[i] / sp) * maxSpeed; s.vy[i] = (s.vy[i] / sp) * maxSpeed }
    s.px[i] = wrap(s.px[i] + s.vx[i] * DT, WORLD_W)
    s.py[i] = wrap(s.py[i] + s.vy[i] * DT, WORLD_H)
  }

  // — predators —
  for (let k = 0; k < s.pn; k++) {
    const g = s.predGenomes[k]
    const fixation = g[P.fix], leadFactor = g[P.lead], lunge = g[P.lunge], burst = g[P.burst]
    const maxSpeed = g[P.spd] * seas
    let t = s.predTarget[k]
    const reTarget = t < 0 || !s.alive[t] || s.rngTick() > fixation
    if (reTarget) {
      let best = -1, bestD = Infinity
      for (let i = 0; i < s.n; i++) {
        if (!s.alive[i]) continue
        const dx = wrapDelta(s.px[i] - s.ppx[k], WORLD_W), dy = wrapDelta(s.py[i] - s.ppy[k], WORLD_H)
        const d2 = dx * dx + dy * dy
        if (d2 < bestD) { bestD = d2; best = i }
      }
      t = best
    }
    s.predTarget[k] = t
    if (t < 0) continue
    const aim = predatorAim(s.px[t], s.py[t], s.vx[t], s.vy[t], s.ppx[k], s.ppy[k], leadFactor)
    const dx = wrapDelta(aim.x - s.ppx[k], WORLD_W), dy = wrapDelta(aim.y - s.ppy[k], WORLD_H)
    const d = Math.hypot(dx, dy) || 1e-6
    const tdx = wrapDelta(s.px[t] - s.ppx[k], WORLD_W), tdy = wrapDelta(s.py[t] - s.ppy[k], WORLD_H)
    const distTarget = Math.hypot(tdx, tdy)
    if (s.predLunge[k] > 0) s.predLunge[k] -= 1
    else if (distTarget < lunge) s.predLunge[k] = LUNGE_STEPS
    const speed = s.predLunge[k] > 0 ? maxSpeed * burst : maxSpeed * FATIGUE_FRAC
    s.pvx[k] = (dx / d) * speed; s.pvy[k] = (dy / d) * speed
    s.ppx[k] = wrap(s.ppx[k] + s.pvx[k] * DT, WORLD_W)
    s.ppy[k] = wrap(s.ppy[k] + s.pvy[k] * DT, WORLD_H)
    for (let i = 0; i < s.n; i++) {
      if (!s.alive[i] || s.respawnGrace[i] > 0) continue
      const cdx = wrapDelta(s.px[i] - s.ppx[k], WORLD_W), cdy = wrapDelta(s.py[i] - s.ppy[k], WORLD_H)
      if (cdx * cdx + cdy * cdy <= CATCH_R * CATCH_R) {
        s.alive[i] = 0; s.respawnTimer[i] = RESPAWN_DELAY; s.predKills[k] += 1; s.totalKills += 1
        if (s.predTarget[k] === i) s.predTarget[k] = -1
        break
      }
    }
  }

  s.tickCount += 1
  if (s.tickCount % Math.round(s.cfg.roundLength * 60) === 0) endRound(s)
}

function centroid(s: Ecosystem): { x: number; y: number; vx: number; vy: number } {
  let x = 0, y = 0, vx = 0, vy = 0, c = 0
  for (let i = 0; i < s.n; i++) if (s.alive[i]) { x += s.px[i]; y += s.py[i]; vx += s.vx[i]; vy += s.vy[i]; c++ }
  if (c === 0) return { x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0 }
  return { x: x / c, y: y / c, vx: vx / c, vy: vy / c }
}

function endRound(s: Ecosystem): void {
  const roundTicks = Math.round(s.cfg.roundLength * 60)
  const flockScored: Scored[] = s.flockGenomes.map((genome, i) => ({ genome, fitness: s.survival[i] / roundTicks }))
  const predScored: Scored[] = s.predGenomes.map((genome, k) => ({ genome, fitness: s.predKills[k] }))
  const fRate = annealedRate(s.cfg.flockMutationRate, s.generation)
  const pRate = annealedRate(s.cfg.predMutationRate, s.generation)
  const nextFlock = breedGeneration(flockScored, { eliteCount: s.cfg.flockElites, mutationRate: fRate, spec: FLOCK_SPEC }, s.rngEvo)
  const nextPred = breedGeneration(predScored, { eliteCount: s.cfg.predElites, mutationRate: pRate, spec: PRED_SPEC }, s.rngEvo)
  // immigration: overwrite the last-bred ~10% of slots with fresh random genomes
  // (rngEvo). Elites sit at the front of the bred pool, so they're never clobbered —
  // this refreshes diversity to keep an all-night run from converging and going static.
  // Clamp the immigrant count to the non-elite tail: at small pool sizes (e.g. a
  // single predator with predElites=1) an unclamped ~10% still rounds up to 1 and
  // would overwrite slot 0 — the sole elite's evolved genome — with a fresh random
  // one every immigration cycle.
  if (s.cfg.immigrateEvery > 0 && s.generation % s.cfg.immigrateEvery === 0) {
    const fImm = Math.min(Math.max(1, Math.floor(s.n * 0.1)), Math.max(0, s.n - s.cfg.flockElites))
    for (let m = 0; m < fImm; m++) nextFlock[s.n - 1 - m] = rnd(FLOCK_SPEC, s.rngEvo)
    const pImm = Math.min(Math.max(1, Math.floor(s.pn * 0.1)), Math.max(0, s.pn - s.cfg.predElites))
    for (let m = 0; m < pImm; m++) nextPred[s.pn - 1 - m] = rnd(PRED_SPEC, s.rngEvo)
  }
  // install: survivors keep bodies; dead slots respawn at the flock centroid
  const c = centroid(s)
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) {
      s.px[i] = wrap(c.x + (s.rngSpawn() * 2 - 1) * 30, WORLD_W)
      s.py[i] = wrap(c.y + (s.rngSpawn() * 2 - 1) * 30, WORLD_H)
      s.vx[i] = c.vx; s.vy[i] = c.vy
      s.alive[i] = 1
      s.respawnGrace[i] = RESPAWN_GRACE
      s.respawnTimer[i] = 0
    }
    s.flockGenomes[i] = nextFlock[i]
    s.survival[i] = 0
  }
  for (let k = 0; k < s.pn; k++) { s.predGenomes[k] = nextPred[k]; s.predKills[k] = 0 }
  s.generation += 1
  const elite = (gs: Genome[]) => Array.from(gs[0])
  if (s.generation === 2) s.gen1Elite = { flock: elite(nextFlock), pred: elite(nextPred) }
  if (s.generation === 4) s.gen3Elite = { flock: elite(nextFlock), pred: elite(nextPred) }
}

/** Cheap order-independent state hash for the determinism test. */
export function hashState(s: Ecosystem): string {
  let h = 2166136261 >>> 0
  const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0 }
  for (let i = 0; i < s.n; i++) {
    mix(s.px[i] * 1000); mix(s.py[i] * 1000); mix(s.vx[i] * 1000); mix(s.alive[i])
    for (let g = 0; g < FLOCK_SPEC.length; g++) mix(s.flockGenomes[i][g] * 1000)
  }
  for (let k = 0; k < s.pn; k++) { mix(s.ppx[k] * 1000); mix(s.ppy[k] * 1000); mix(s.predKills[k]) }
  mix(s.tickCount); mix(s.generation)
  return (h >>> 0).toString(16)
}
