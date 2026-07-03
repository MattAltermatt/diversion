// arena.ts — the pursuit-evasion simulation. Pure and headless-testable. Two
// populations of neurally-driven steering bodies chase/flee on a fixed world; a
// round runs for a fixed time, then each side breeds independently. Deterministic
// given the seeded rng. Rendering lives in render.ts.

import { mulberry32 } from '../../framework/rng'
import { randomBrain, forward, crossover, mutate, cloneBrain, type Brain, type NetDims } from './net'
import type { PursuitEvasionConfig } from './schema'

export const WORLD_W = 1200
export const WORLD_H = 800
const SENSE_RANGE = 440 // beyond this an opponent barely registers
const DRAG = 0.9 // per-second velocity bleed
const MIN_SPEED_FRAC = 0.12 // creatures never fully freeze → the arena stays alive
const CATCH_BONUS = 8 // predator fitness per catch
const CATCH_PENALTY = 6 // prey fitness lost when caught
const SHAPE_PRED = 3 // predator reward shaping: closeness to nearest prey
const SHAPE_PREY = 0.5 // prey reward shaping: distance kept from nearest predator
const FLASH_TIME = 0.45 // seconds a caught prey flashes after respawning

export interface Creature {
  x: number
  y: number
  heading: number
  speed: number
  fitness: number
  catches: number // predators only
  flash: number // caught-flash timer (prey)
  brain: Brain
}

export interface CatchFx { x: number; y: number; ttl: number }

export interface Arena {
  cfg: PursuitEvasionConfig
  w: number
  h: number
  prey: Creature[]
  predators: Creature[]
  preyDims: NetDims
  predDims: NetDims
  rng: () => number
  gen: number
  roundTime: number
  bestPrey: number
  bestPred: number
  catchesThisRound: number
  fx: CatchFx[]
  // scratch buffers for the forward pass (reused every tick, no per-tick alloc)
  inBuf: Float32Array
  hidBuf: Float32Array
  outBuf: Float32Array
}

function dims(cfg: PursuitEvasionConfig): NetDims {
  return { nIn: cfg.sensorCount * 3 + 2, nHid: cfg.hiddenNeurons, nOut: 2 }
}

function spawn(brain: Brain, maxSpeed: number, rng: () => number): Creature {
  return {
    x: rng() * WORLD_W,
    y: rng() * WORLD_H,
    heading: rng() * Math.PI * 2,
    speed: (0.4 + rng() * 0.4) * maxSpeed,
    fitness: 0, catches: 0, flash: 0, brain,
  }
}

export function createArena(cfg: PursuitEvasionConfig, w: number, h: number): Arena {
  const rng = mulberry32(cfg.seed | 0)
  const preyDims = dims(cfg)
  const predDims = dims(cfg)
  const prey: Creature[] = []
  for (let i = 0; i < cfg.preyCount; i++) prey.push(spawn(randomBrain(preyDims, rng), cfg.preySpeed, rng))
  const predators: Creature[] = []
  for (let i = 0; i < cfg.predatorCount; i++) predators.push(spawn(randomBrain(predDims, rng), cfg.predatorSpeed, rng))
  const nIn = preyDims.nIn
  return {
    cfg, w, h, prey, predators, preyDims, predDims, rng,
    gen: 0, roundTime: 0, bestPrey: 0, bestPred: 0, catchesThisRound: 0, fx: [],
    inBuf: new Float32Array(nIn),
    hidBuf: new Float32Array(cfg.hiddenNeurons),
    outBuf: new Float32Array(2),
  }
}

// ── sensing ────────────────────────────────────────────────────────────────

/** Minimum-image delta (respects toroidal wrap when enabled). */
function delta(a: number, b: number, span: number, wrap: boolean): number {
  let d = b - a
  if (wrap) {
    if (d > span / 2) d -= span
    else if (d < -span / 2) d += span
  }
  return d
}

/** Fill `inBuf` for creature `self` sensing the `opponents` list: for each of the
 *  nearest K opponents [sin(relBearing), cos(relBearing), proximity], then own
 *  normalized speed, then a constant bias. Empty slots are zero. */
function sense(arena: Arena, self: Creature, opponents: Creature[], maxSpeed: number): void {
  const { cfg, inBuf } = arena
  const wrap = cfg.arenaWrap
  const K = cfg.sensorCount
  inBuf.fill(0)
  // Collect distances² to all opponents, then pick the K nearest (small K, small N).
  // Track the K best by simple insertion.
  const bestIdx = new Int32Array(K).fill(-1)
  const bestD2 = new Float32Array(K).fill(Infinity)
  for (let o = 0; o < opponents.length; o++) {
    const op = opponents[o]
    const dx = delta(self.x, op.x, WORLD_W, wrap)
    const dy = delta(self.y, op.y, WORLD_H, wrap)
    const d2 = dx * dx + dy * dy
    // insert into the sorted K-best
    for (let s = 0; s < K; s++) {
      if (d2 < bestD2[s]) {
        for (let t = K - 1; t > s; t--) { bestD2[t] = bestD2[t - 1]; bestIdx[t] = bestIdx[t - 1] }
        bestD2[s] = d2; bestIdx[s] = o
        break
      }
    }
  }
  for (let s = 0; s < K; s++) {
    const oi = bestIdx[s]
    if (oi < 0) continue
    const op = opponents[oi]
    const dx = delta(self.x, op.x, WORLD_W, wrap)
    const dy = delta(self.y, op.y, WORLD_H, wrap)
    const dist = Math.sqrt(bestD2[s])
    const bearing = Math.atan2(dy, dx) - self.heading
    inBuf[s * 3] = Math.sin(bearing)
    inBuf[s * 3 + 1] = Math.cos(bearing)
    inBuf[s * 3 + 2] = Math.max(0, 1 - dist / SENSE_RANGE)
  }
  inBuf[K * 3] = self.speed / maxSpeed
  inBuf[K * 3 + 1] = 1 // bias
}

/** Distance from a creature to the nearest of a list (toroidal-aware). */
function nearestDist(arena: Arena, self: Creature, list: Creature[]): number {
  const wrap = arena.cfg.arenaWrap
  let best = Infinity
  for (const o of list) {
    const dx = delta(self.x, o.x, WORLD_W, wrap)
    const dy = delta(self.y, o.y, WORLD_H, wrap)
    const d2 = dx * dx + dy * dy
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

// ── physics + round ──────────────────────────────────────────────────────────

function drive(arena: Arena, c: Creature, dims: NetDims, maxSpeed: number, dt: number): void {
  forward(c.brain, dims, arena.inBuf, arena.hidBuf, arena.outBuf)
  const turn = arena.outBuf[0]
  const accel = arena.outBuf[1]
  c.heading += turn * arena.cfg.turnRate * dt
  c.speed += accel * maxSpeed * 3 * dt
  c.speed *= 1 - DRAG * dt
  const minS = MIN_SPEED_FRAC * maxSpeed
  if (c.speed < minS) c.speed = minS
  else if (c.speed > maxSpeed) c.speed = maxSpeed
  c.x += Math.cos(c.heading) * c.speed * dt
  c.y += Math.sin(c.heading) * c.speed * dt
  if (arena.cfg.arenaWrap) {
    c.x = (c.x % WORLD_W + WORLD_W) % WORLD_W
    c.y = (c.y % WORLD_H + WORLD_H) % WORLD_H
  } else {
    // bounce off the walls (reflect heading), keep inside
    if (c.x < 0) { c.x = 0; c.heading = Math.PI - c.heading }
    else if (c.x > WORLD_W) { c.x = WORLD_W; c.heading = Math.PI - c.heading }
    if (c.y < 0) { c.y = 0; c.heading = -c.heading }
    else if (c.y > WORLD_H) { c.y = WORLD_H; c.heading = -c.heading }
  }
}

/** Advance the whole arena by dt seconds of sim time (already speed-scaled). */
export function stepArena(arena: Arena, dt: number): void {
  const { cfg, prey, predators } = arena

  // Prey act (flee predators) + survival reward shaping.
  for (const p of prey) {
    sense(arena, p, predators, cfg.preySpeed)
    drive(arena, p, arena.preyDims, cfg.preySpeed, dt)
    if (p.flash > 0) p.flash -= dt
    const d = predators.length ? nearestDist(arena, p, predators) : SENSE_RANGE
    p.fitness += dt * (1 + SHAPE_PREY * Math.min(1, d / SENSE_RANGE))
  }
  // Predators act (chase prey) + closeness reward shaping.
  for (const h of predators) {
    sense(arena, h, prey, cfg.predatorSpeed)
    drive(arena, h, arena.predDims, cfg.predatorSpeed, dt)
    const d = prey.length ? nearestDist(arena, h, prey) : SENSE_RANGE
    h.fitness += dt * SHAPE_PRED * Math.max(0, 1 - d / SENSE_RANGE)
  }

  // Catches: each predator tags the nearest prey within range (respawn it far away).
  const cr2 = cfg.catchRadius * cfg.catchRadius
  const wrap = cfg.arenaWrap
  for (const h of predators) {
    let victim = -1, vd2 = cr2
    for (let i = 0; i < prey.length; i++) {
      const p = prey[i]
      if (p.flash > 0) continue // just respawned, brief grace
      const dx = delta(h.x, p.x, WORLD_W, wrap), dy = delta(h.y, p.y, WORLD_H, wrap)
      const d2 = dx * dx + dy * dy
      if (d2 < vd2) { vd2 = d2; victim = i }
    }
    if (victim >= 0) {
      const p = prey[victim]
      h.fitness += CATCH_BONUS; h.catches++
      p.fitness -= CATCH_PENALTY
      arena.catchesThisRound++
      arena.fx.push({ x: p.x, y: p.y, ttl: 0.5 })
      respawnFar(arena, p)
    }
  }

  // Decay catch effects.
  for (const f of arena.fx) f.ttl -= dt
  if (arena.fx.length) arena.fx = arena.fx.filter((f) => f.ttl > 0)

  arena.roundTime += dt
  if (arena.roundTime >= cfg.roundSeconds) breed(arena)
}

/** Respawn a caught prey at a spot far from every predator (fresh survival run). */
function respawnFar(arena: Arena, p: Creature): void {
  const { rng, predators } = arena
  let bx = rng() * WORLD_W, by = rng() * WORLD_H, bestD = -1
  for (let tries = 0; tries < 6; tries++) {
    const x = rng() * WORLD_W, y = rng() * WORLD_H
    const d = predators.length ? nearestDist(arena, { ...p, x, y }, predators) : 1
    if (d > bestD) { bestD = d; bx = x; by = y }
  }
  p.x = bx; p.y = by
  p.heading = rng() * Math.PI * 2
  p.speed = 0.5 * arena.cfg.preySpeed
  p.flash = FLASH_TIME
}

// ── evolution ────────────────────────────────────────────────────────────────

function tournament(pop: Creature[], rng: () => number): Creature {
  const a = pop[(rng() * pop.length) | 0]
  const b = pop[(rng() * pop.length) | 0]
  return a.fitness >= b.fitness ? a : b
}

function breedPop(pop: Creature[], cfg: PursuitEvasionConfig, maxSpeed: number, rng: () => number): Creature[] {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness)
  const nElite = Math.max(1, Math.round(cfg.eliteFrac * sorted.length))
  const next: Creature[] = []
  for (let i = 0; i < nElite && i < sorted.length; i++) {
    next.push(spawn(cloneBrain(sorted[i].brain), maxSpeed, rng))
  }
  while (next.length < pop.length) {
    const pa = tournament(sorted, rng)
    const pb = tournament(sorted, rng)
    const child = mutate(crossover(pa.brain, pb.brain, rng), cfg.mutationRate, 0.35, rng)
    next.push(spawn(child, maxSpeed, rng))
  }
  return next
}

export function breed(arena: Arena): void {
  const { cfg } = arena
  arena.bestPrey = arena.prey.reduce((m, c) => Math.max(m, c.fitness), 0)
  arena.bestPred = arena.predators.reduce((m, c) => Math.max(m, c.catches), 0)
  arena.prey = breedPop(arena.prey, cfg, cfg.preySpeed, arena.rng)
  arena.predators = breedPop(arena.predators, cfg, cfg.predatorSpeed, arena.rng)
  arena.gen++
  arena.roundTime = 0
  arena.catchesThisRound = 0
  arena.fx = []
}

/** Index of the current highest-fitness creature (the round leader), or -1. */
export function leaderIndex(pop: Creature[], byCatches = false): number {
  let best = -1, bv = -Infinity
  for (let i = 0; i < pop.length; i++) {
    const v = byCatches ? pop[i].catches : pop[i].fitness
    if (v > bv) { bv = v; best = i }
  }
  return best
}
