// canopy.ts — phototropic plant competition. Pure (no DOM-instantiating imports) so
// the light economy unit-tests headless. Each plant is a small L-system tree grown
// from evolvable genes; light rains from the top and is absorbed top-down through a
// per-column shadow accumulator, so a tall plant's leaves steal the sun from anything
// beneath it. Energy = light caught − a height² maintenance cost; energy buys growth
// and mutated seeds; starved plants die and reopen gaps. The height gene is the
// arms-race lever.

import { mulberry32 } from '../../framework/rng'
import type { CanopyConfig } from './schema'

const ABSORB = 0.5 // fraction of a column's remaining light a leaf takes (higher = fiercer shading)
const GAIN = 2.6 // absorbed light → energy per second
const BASE_MAINT = 0.4 // upkeep per plant per second
const HEIGHT_MAINT = 4.5 // scales heightCost × (h/H)² upkeep — the arms-race ceiling
const GROW_COST = 1 // energy per unit growth (× height fraction)
const BIRTH_ENERGY = 6 // surplus a mature plant needs to seed
const BIRTH_COST = 4 // energy spent seeding
const SEEDLING_ENERGY = 2.5
const COL_W = 6 // shadow-column width in px
const MAX_LEAVES = 130 // per-plant safety cap on tree expansion

export interface Leaf { x: number; y: number; col: number; light: number }
export interface Segment { x1: number; y1: number; x2: number; y2: number; w: number }

export interface Genes {
  height: number // 0..1 — internode length + central-leader frequency (the arms-race lever)
  angle: number // branch spread (radians)
  depth: number // branching depth (3..5)
}

export interface Plant {
  x: number
  genes: Genes
  wiggle: number // per-plant asymmetry seed (not evolved)
  growth: number // 0..1 maturity
  energy: number
  age: number
  segments: Segment[]
  leaves: Leaf[]
  topY: number // smallest y reached (highest point) — for maintenance + stats
  builtGrowth: number // growth at last geometry rebuild
  absorbed: number // light absorbed this tick (for energy update)
}

export interface CanopyState {
  cfg: CanopyConfig
  w: number
  h: number
  plants: Plant[]
  rng: () => number
  cols: number
  colLight: Float32Array
  tickAccum: number
  tickMs: number
  tick: number
  turnover: number // cumulative deaths (a rough "generation" counter)
  meanHeight: number
}

// ── genes / build ────────────────────────────────────────────────────────────

function randomGenes(rng: () => number, cfg: CanopyConfig): Genes {
  return {
    height: 0.25 + rng() * 0.5,
    angle: cfg.branchAngle * (0.7 + rng() * 0.6),
    depth: 3 + ((rng() * 3) | 0), // 3..5
  }
}

function mutate(g: Genes, rng: () => number, cfg: CanopyConfig): Genes {
  const m = cfg.mutationRate
  const jit = (v: number, s: number) => v + (rng() - 0.5) * 2 * s
  let depth = g.depth
  if (rng() < m) depth += rng() < 0.5 ? -1 : 1
  return {
    height: Math.max(0.08, Math.min(1, jit(g.height, m))),
    angle: Math.max(0.15, Math.min(1.1, jit(g.angle, m * 0.6))),
    depth: Math.max(3, Math.min(5, depth)),
  }
}

function makePlant(x: number, genes: Genes, wiggle: number, growth: number, energy: number): Plant {
  return { x, genes, wiggle, growth, energy, age: 0, segments: [], leaves: [], topY: 0, builtGrowth: -1, absorbed: 0 }
}

/** Expand a plant's L-system into segments + leaves at its current growth. Only the
 *  geometry — light is assigned later. Cheap enough to rebuild as growth creeps. */
export function expandTree(plant: Plant, h: number): void {
  const segs: Segment[] = []
  const leaves: Leaf[] = []
  const g = plant.genes
  const rng = mulberry32(plant.wiggle >>> 0)
  const baseLen = h * 0.09 * (0.4 + g.height * 1.2) * plant.growth
  let topY = h
  const leaderProb = g.height * 0.85

  const recurse = (x: number, y: number, angle: number, len: number, depth: number): void => {
    if (leaves.length >= MAX_LEAVES) return
    const nx = x + Math.sin(angle) * len
    const ny = y - Math.cos(angle) * len
    segs.push({ x1: x, y1: y, x2: nx, y2: ny, w: 0.5 + depth * 0.9 })
    if (ny < topY) topY = ny
    if (depth <= 0) {
      leaves.push({ x: nx, y: ny, col: 0, light: 0 })
      return
    }
    const wob = (rng() - 0.5) * 0.18
    recurse(nx, ny, angle - g.angle + wob, len * 0.72, depth - 1)
    recurse(nx, ny, angle + g.angle + wob, len * 0.72, depth - 1)
    // Central leader — gentle taper so a high-height plant drives a tall vertical shoot.
    if (rng() < leaderProb) recurse(nx, ny, angle + wob * 0.5, len * 0.9, depth - 1)
  }

  recurse(plant.x, h, 0, baseLen, g.depth)
  plant.segments = segs
  plant.leaves = leaves
  plant.topY = topY
  plant.builtGrowth = plant.growth
}

export function createCanopyState(cfg: CanopyConfig, w: number, h: number): CanopyState {
  const rng = mulberry32(cfg.seed | 0)
  const cols = Math.max(1, Math.ceil(w / COL_W))
  const plants: Plant[] = []
  const seedCount = Math.round(cfg.maxPlants * 0.5)
  for (let i = 0; i < seedCount; i++) {
    const x = rng() * w
    plants.push(makePlant(x, randomGenes(rng, cfg), (rng() * 1e9) | 0, 0.05 + rng() * 0.3, SEEDLING_ENERGY + rng() * 3))
  }
  for (const p of plants) expandTree(p, h)
  return {
    cfg, w, h, plants, rng, cols,
    colLight: new Float32Array(cols),
    tickAccum: 0, tickMs: 1000 / cfg.simSpeed, tick: 0, turnover: 0, meanHeight: 0,
  }
}

// ── light + step ─────────────────────────────────────────────────────────────

/** Top-down light pass. Resets each column to full sun, sorts every leaf by height,
 *  and lets higher leaves shade lower ones — the crux of the competition. */
export function lightPass(state: CanopyState): void {
  const { colLight, cols, cfg, w } = state
  colLight.fill(cfg.sunlight)
  // Gather leaves, tag columns, sort by y ascending (top of frame first).
  const all: Leaf[] = []
  for (const p of state.plants) {
    p.absorbed = 0
    for (const lf of p.leaves) {
      lf.col = Math.min(cols - 1, Math.max(0, (lf.x / w * cols) | 0))
      all.push(lf)
    }
  }
  all.sort((a, b) => a.y - b.y)
  // Attribute absorbed light back to plants via a leaf→plant map isn't needed:
  // accumulate on the leaf, then sum per plant below.
  for (const lf of all) {
    const c = lf.col
    lf.light = colLight[c]
    colLight[c] *= (1 - ABSORB)
  }
  for (const p of state.plants) {
    let a = 0
    for (const lf of p.leaves) a += lf.light * ABSORB
    p.absorbed = a
  }
}

export function step(state: CanopyState, dtMs: number): void {
  const { cfg, h } = state
  state.tick++
  const dt = (dtMs / 1000) * cfg.growthSpeed

  // Rebuild geometry for plants whose growth drifted enough since last build.
  for (const p of state.plants) {
    if (Math.abs(p.growth - p.builtGrowth) > 0.004) expandTree(p, h)
  }

  lightPass(state)

  const born: Plant[] = []
  const survivors: Plant[] = []
  let heightSum = 0
  for (const p of state.plants) {
    const hFrac = (h - p.topY) / h // 0..1 canopy height
    const maint = BASE_MAINT + cfg.heightCost * HEIGHT_MAINT * hFrac * hFrac
    p.energy += (p.absorbed * GAIN - maint) * dt
    p.age += dt

    // Grow toward maturity while in surplus.
    if (p.growth < 1 && p.energy > 0) {
      const g = Math.min(1 - p.growth, 0.5 * dt)
      p.growth += g
      p.energy -= g * GROW_COST * (0.4 + hFrac)
    }

    // Death: starved. (No hard age cap — shading does the culling.)
    if (p.energy < 0) {
      state.turnover++
      continue
    }
    survivors.push(p)
    heightSum += hFrac

    // Reproduce: a mature, well-fed plant seeds a mutated child into a nearby gap.
    if (p.growth >= 1 && p.energy > BIRTH_ENERGY && state.plants.length + born.length < cfg.maxPlants) {
      p.energy -= BIRTH_COST
      const off = (state.rng() - 0.5) * 2 * cfg.seedSpread
      let nx = p.x + off
      if (nx < 0) nx += state.w
      if (nx >= state.w) nx -= state.w
      born.push(makePlant(nx, mutate(p.genes, state.rng, cfg), (state.rng() * 1e9) | 0, 0.05, SEEDLING_ENERGY))
    }
  }
  for (const b of born) expandTree(b, h)
  state.plants = survivors.concat(born)
  state.meanHeight = survivors.length ? heightSum / survivors.length : 0
}

export function advance(state: CanopyState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state, state.tickMs)
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

export function render(state: CanopyState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  // Sky gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, cfg.color.skyTop)
  grad.addColorStop(1, cfg.color.skyBottom)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)

  // Light shafts: soft vertical rays where the canopy hasn't closed (column light high).
  if (cfg.lightShafts) {
    ctx.globalCompositeOperation = 'lighter'
    const cw = w / state.cols
    for (let c = 0; c < state.cols; c++) {
      const lit = state.colLight[c] / Math.max(0.001, cfg.sunlight)
      if (lit < 0.35) continue
      const a = (lit - 0.35) * 0.08
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.85)
      g.addColorStop(0, `rgba(255,244,200,${a})`)
      g.addColorStop(1, 'rgba(255,244,200,0)')
      ctx.fillStyle = g
      ctx.fillRect(c * cw, 0, cw + 1, h * 0.85)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  const trunk = cfg.color.trunk
  const [sr, sg, sb] = hexRgb(cfg.color.leafShade)
  const [ur, ug, ub] = hexRgb(cfg.color.leafSun)
  const sun = Math.max(0.001, cfg.sunlight)

  // Draw shortest (understory) first so canopy tops layer on top.
  const order = state.plants.slice().sort((a, b) => b.topY - a.topY)
  for (const p of order) {
    ctx.strokeStyle = trunk
    ctx.lineCap = 'round'
    for (const s of p.segments) {
      ctx.lineWidth = s.w
      ctx.beginPath()
      ctx.moveTo(s.x1, s.y1)
      ctx.lineTo(s.x2, s.y2)
      ctx.stroke()
    }
    const r = cfg.leafSize
    for (const lf of p.leaves) {
      const t = Math.min(1, lf.light / sun)
      ctx.fillStyle = `rgb(${mix(sr, ur, t)},${mix(sg, ug, t)},${mix(sb, ub, t)})`
      ctx.beginPath()
      ctx.arc(lf.x, lf.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (cfg.showHud) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#e6efe0'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`trees ${state.plants.length}   ·   mean height ${(state.meanHeight * 100).toFixed(0)}%`, 14, 14)
    ctx.globalAlpha = 1
  }
}
