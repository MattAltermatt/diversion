// arena.ts — the Evolving Foragers simulation. Pure and headless-testable. One
// population of neurally-driven steering bodies forages for food and dodges poison
// on a fixed toroidal world; a round runs for a fixed time, then the whole
// population breeds together (elitism + tournament + weight mutation). No
// adversary — fitness comes entirely from foraging (reward shaping + eating), so
// the population visibly gets better at the SAME task, round over round.
// Deterministic given the seeded rng. Rendering lives in render.ts.

import { mulberry32 } from '../../framework/rng'
import { randomBrain, forward, crossover, mutate, cloneBrain, type Brain, type NetDims } from './net'
import type { ForagersConfig } from './schema'

export const WORLD_W = 1200
export const WORLD_H = 800
const SENSE_RANGE = 380 // beyond this a pellet barely registers
const DRAG = 0.9 // per-second velocity bleed
const MIN_SPEED_FRAC = 0.12 // creatures never fully freeze → the world stays alive
const FOOD_VALUE = 6 // fitness gained per food pellet eaten
const POISON_PENALTY = 6 // fitness lost per poison pellet eaten
const FOOD_SHAPE = 0.6 // reward shaping: closeness to the nearest food pellet
const POISON_SHAPE = 0.6 // reward shaping: penalty for closeness to nearest poison
const EAT_FLASH_TIME = 0.3 // seconds a creature flashes after eating something

export interface Creature {
  x: number
  y: number
  heading: number
  speed: number
  fitness: number
  foodEaten: number
  poisonEaten: number
  flash: number // >0 after eating (food: white flash; poison: red flash — see render)
  flashBad: boolean
  brain: Brain
}

export interface Pellet { x: number; y: number }

export interface EatFx { x: number; y: number; ttl: number; bad: boolean }

export interface Arena {
  cfg: ForagersConfig
  w: number
  h: number
  pop: Creature[]
  dims: NetDims
  rng: () => number
  gen: number
  roundTime: number
  bestFitness: number // last completed round's best fitness
  avgFoodLastRound: number // last completed round's avg food eaten per creature
  foodEatenThisRound: number
  poisonEatenThisRound: number
  food: Pellet[]
  poison: Pellet[]
  fx: EatFx[]
  // scratch buffers for the forward pass (reused every tick, no per-tick alloc)
  inBuf: Float32Array
  hidBuf: Float32Array
  outBuf: Float32Array
}

function dims(cfg: ForagersConfig): NetDims {
  // Two sensed lists (food, poison), each contributing sensorCount * 3 inputs,
  // plus own speed + a constant bias.
  return { nIn: cfg.sensorCount * 3 * 2 + 2, nHid: cfg.hiddenNeurons, nOut: 2 }
}

function spawnCreature(brain: Brain, maxSpeed: number, rng: () => number): Creature {
  return {
    x: rng() * WORLD_W,
    y: rng() * WORLD_H,
    heading: rng() * Math.PI * 2,
    speed: (0.4 + rng() * 0.4) * maxSpeed,
    fitness: 0, foodEaten: 0, poisonEaten: 0, flash: 0, flashBad: false, brain,
  }
}

function spawnPellets(n: number, rng: () => number): Pellet[] {
  const list: Pellet[] = []
  for (let i = 0; i < n; i++) list.push({ x: rng() * WORLD_W, y: rng() * WORLD_H })
  return list
}

export function createArena(cfg: ForagersConfig, w: number, h: number): Arena {
  const rng = mulberry32(cfg.seed | 0)
  const d = dims(cfg)
  const pop: Creature[] = []
  for (let i = 0; i < cfg.creatureCount; i++) pop.push(spawnCreature(randomBrain(d, rng), cfg.maxSpeed, rng))
  return {
    cfg, w, h, pop, dims: d, rng,
    gen: 0, roundTime: 0, bestFitness: 0, avgFoodLastRound: 0,
    foodEatenThisRound: 0, poisonEatenThisRound: 0,
    food: spawnPellets(cfg.foodCount, rng),
    poison: spawnPellets(cfg.poisonCount, rng),
    fx: [],
    inBuf: new Float32Array(d.nIn),
    hidBuf: new Float32Array(cfg.hiddenNeurons),
    outBuf: new Float32Array(2),
  }
}

// ── sensing ────────────────────────────────────────────────────────────────

/** Minimum-image delta on a toroidal axis. */
function delta(a: number, b: number, span: number): number {
  let d = b - a
  if (d > span / 2) d -= span
  else if (d < -span / 2) d += span
  return d
}

/** Write [sin(relBearing), cos(relBearing), proximity] for the nearest K of
 *  `pellets` into `inBuf` starting at `offset`. Empty slots stay zero. */
function senseList(self: Creature, pellets: Pellet[], K: number, inBuf: Float32Array, offset: number): void {
  const bestIdx = new Int32Array(K).fill(-1)
  const bestD2 = new Float32Array(K).fill(Infinity)
  for (let o = 0; o < pellets.length; o++) {
    const p = pellets[o]
    const dx = delta(self.x, p.x, WORLD_W)
    const dy = delta(self.y, p.y, WORLD_H)
    const d2 = dx * dx + dy * dy
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
    const base = offset + s * 3
    if (oi < 0) continue
    const p = pellets[oi]
    const dx = delta(self.x, p.x, WORLD_W)
    const dy = delta(self.y, p.y, WORLD_H)
    const dist = Math.sqrt(bestD2[s])
    const bearing = Math.atan2(dy, dx) - self.heading
    inBuf[base] = Math.sin(bearing)
    inBuf[base + 1] = Math.cos(bearing)
    inBuf[base + 2] = Math.max(0, 1 - dist / SENSE_RANGE)
  }
}

/** Fill `inBuf` for creature `self`: nearest K food, then nearest K poison, then
 *  own normalized speed, then a constant bias. */
function sense(arena: Arena, self: Creature): void {
  const { cfg, inBuf, food, poison } = arena
  const K = cfg.sensorCount
  inBuf.fill(0)
  senseList(self, food, K, inBuf, 0)
  senseList(self, poison, K, inBuf, K * 3)
  inBuf[K * 6] = self.speed / cfg.maxSpeed
  inBuf[K * 6 + 1] = 1 // bias
}

/** Distance from a creature to the nearest of a pellet list (toroidal). */
function nearestDist(self: Creature, list: Pellet[]): number {
  let best = Infinity
  for (const p of list) {
    const dx = delta(self.x, p.x, WORLD_W)
    const dy = delta(self.y, p.y, WORLD_H)
    const d2 = dx * dx + dy * dy
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

// ── physics + round ──────────────────────────────────────────────────────────

function drive(arena: Arena, c: Creature, dt: number): void {
  const { cfg } = arena
  forward(c.brain, arena.dims, arena.inBuf, arena.hidBuf, arena.outBuf)
  const turn = arena.outBuf[0]
  const accel = arena.outBuf[1]
  c.heading += turn * cfg.turnRate * dt
  c.speed += accel * cfg.maxSpeed * 3 * dt
  c.speed *= 1 - DRAG * dt
  const minS = MIN_SPEED_FRAC * cfg.maxSpeed
  if (c.speed < minS) c.speed = minS
  else if (c.speed > cfg.maxSpeed) c.speed = cfg.maxSpeed
  c.x += Math.cos(c.heading) * c.speed * dt
  c.y += Math.sin(c.heading) * c.speed * dt
  // Toroidal wrap — an open world with no walls to pin a creature in a corner.
  c.x = (c.x % WORLD_W + WORLD_W) % WORLD_W
  c.y = (c.y % WORLD_H + WORLD_H) % WORLD_H
}

/** Respawn a pellet at a fresh random spot (keeps density constant). */
function respawn(rng: () => number, p: Pellet): void {
  p.x = rng() * WORLD_W
  p.y = rng() * WORLD_H
}

/** Advance the whole arena by dt seconds of sim time (already speed-scaled). */
export function stepArena(arena: Arena, dt: number): void {
  const { cfg, pop, food, poison, rng } = arena
  const eatR2 = cfg.eatRadius * cfg.eatRadius

  for (const c of pop) {
    sense(arena, c)
    drive(arena, c, dt)
    if (c.flash > 0) c.flash -= dt

    // Reward shaping: dense gradient toward food, away from poison — a usable
    // signal from generation 0, well before any creature reliably eats.
    const df = food.length ? nearestDist(c, food) : SENSE_RANGE
    const dp = poison.length ? nearestDist(c, poison) : SENSE_RANGE
    c.fitness += dt * FOOD_SHAPE * Math.max(0, 1 - df / SENSE_RANGE)
    c.fitness -= dt * POISON_SHAPE * Math.max(0, 1 - dp / SENSE_RANGE)

    // Eating: nearest pellet of each kind within range is consumed and respawns.
    let bestFood = -1, bfd2 = eatR2
    for (let i = 0; i < food.length; i++) {
      const p = food[i]
      const dx = delta(c.x, p.x, WORLD_W), dy = delta(c.y, p.y, WORLD_H)
      const d2 = dx * dx + dy * dy
      if (d2 < bfd2) { bfd2 = d2; bestFood = i }
    }
    if (bestFood >= 0) {
      c.fitness += FOOD_VALUE
      c.foodEaten++
      c.flash = EAT_FLASH_TIME; c.flashBad = false
      arena.foodEatenThisRound++
      arena.fx.push({ x: food[bestFood].x, y: food[bestFood].y, ttl: 0.4, bad: false })
      respawn(rng, food[bestFood])
    }

    let bestPoison = -1, bpd2 = eatR2
    for (let i = 0; i < poison.length; i++) {
      const p = poison[i]
      const dx = delta(c.x, p.x, WORLD_W), dy = delta(c.y, p.y, WORLD_H)
      const d2 = dx * dx + dy * dy
      if (d2 < bpd2) { bpd2 = d2; bestPoison = i }
    }
    if (bestPoison >= 0) {
      c.fitness -= POISON_PENALTY
      c.poisonEaten++
      c.flash = EAT_FLASH_TIME; c.flashBad = true
      arena.poisonEatenThisRound++
      arena.fx.push({ x: poison[bestPoison].x, y: poison[bestPoison].y, ttl: 0.4, bad: true })
      respawn(rng, poison[bestPoison])
    }
  }

  // Decay eat effects.
  for (const f of arena.fx) f.ttl -= dt
  if (arena.fx.length) arena.fx = arena.fx.filter((f) => f.ttl > 0)

  arena.roundTime += dt
  if (arena.roundTime >= cfg.roundSeconds) breed(arena)
}

// ── evolution ────────────────────────────────────────────────────────────────

function tournament(pop: Creature[], rng: () => number): Creature {
  const a = pop[(rng() * pop.length) | 0]
  const b = pop[(rng() * pop.length) | 0]
  return a.fitness >= b.fitness ? a : b
}

function breedPop(pop: Creature[], cfg: ForagersConfig, rng: () => number): Creature[] {
  const sorted = [...pop].sort((a, b) => b.fitness - a.fitness)
  const nElite = Math.max(1, Math.round(cfg.eliteFrac * sorted.length))
  const next: Creature[] = []
  for (let i = 0; i < nElite && i < sorted.length; i++) {
    next.push(spawnCreature(cloneBrain(sorted[i].brain), cfg.maxSpeed, rng))
  }
  while (next.length < pop.length) {
    const pa = tournament(sorted, rng)
    const pb = tournament(sorted, rng)
    const child = mutate(crossover(pa.brain, pb.brain, rng), cfg.mutationRate, 0.35, rng)
    next.push(spawnCreature(child, cfg.maxSpeed, rng))
  }
  return next
}

export function breed(arena: Arena): void {
  const { cfg, pop } = arena
  arena.bestFitness = pop.reduce((m, c) => Math.max(m, c.fitness), 0)
  arena.avgFoodLastRound = pop.reduce((sum, c) => sum + c.foodEaten, 0) / pop.length
  arena.pop = breedPop(pop, cfg, arena.rng)
  arena.gen++
  arena.roundTime = 0
  arena.foodEatenThisRound = 0
  arena.poisonEatenThisRound = 0
  arena.fx = []
}

/** Index of the current highest-fitness creature (the round leader), or -1. */
export function leaderIndex(pop: Creature[]): number {
  let best = -1, bv = -Infinity
  for (let i = 0; i < pop.length; i++) {
    if (pop[i].fitness > bv) { bv = pop[i].fitness; best = i }
  }
  return best
}
