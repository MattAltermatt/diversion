// antColony.ts — Ant Colony Optimization foraging. Pure (no DOM-instantiating
// imports at module scope) so it unit-tests headless. Ants live in a continuous
// normalized [0,1)×[0,1) world; two pheromone fields per colony (to-food /
// to-home) live on a fixed res×res grid that diffuses + decays each step. The
// grid is rendered stretched-to-fill (like sugarscape/strategy-ecology), so a
// resize never rebuilds the world (see gotcha-viewport-independent-geometry-resize).

import { mulberry32 } from '../../framework/rng'
import type { AntColonyConfig } from './schema'

export const FOOD_CAPACITY = 260
const FOOD_PICKUP = 1
const FOOD_REGEN_FRAC = 0.0008 // per-tick regen as a fraction of capacity
const NEST_RADIUS = 1.6 // in grid cells
const PICKUP_RADIUS = 1.6 // in grid cells
const MIN_FOOD_SEP = 0.16 // min normalized distance between food/nests when placing

export type AntMode = 0 | 1 // 0 = searching, 1 = returning

export interface Ant {
  x: number
  y: number
  heading: number
  mode: AntMode
  colony: number
}

export interface FoodSource {
  x: number
  y: number
  amount: number
  capacity: number
}

export interface ColonyField {
  toFood: Float32Array
  toHome: Float32Array
  toFoodTotal: number
  toHomeTotal: number
}

export interface AntColonyState {
  cfg: AntColonyConfig
  w: number
  h: number
  res: number
  numColonies: number
  nests: { x: number; y: number }[]
  food: FoodSource[]
  fields: ColonyField[]
  scratch: Float32Array // shared diffuse scratch buffer (res*res), reused across fields
  ants: Ant[]
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  collected: number[]
  lut: Uint8Array[] // per-colony 256×rgb background→trail ramp
  buf: OffscreenCanvas | HTMLCanvasElement | null
  img: ImageData | null
}

// ── color ─────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

/** Bake a 256-entry background→trail rgb ramp for one colony. */
function buildRamp(bg: [number, number, number], trail: [number, number, number]): Uint8Array {
  const lut = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    lut[i * 3] = mix(bg[0], trail[0], t)
    lut[i * 3 + 1] = mix(bg[1], trail[1], t)
    lut[i * 3 + 2] = mix(bg[2], trail[2], t)
  }
  return lut
}

export function buildTrailLuts(cfg: AntColonyConfig): Uint8Array[] {
  const bg = hexRgb(cfg.palette.background)
  return [buildRamp(bg, hexRgb(cfg.palette.trailA)), buildRamp(bg, hexRgb(cfg.palette.trailB))]
}

// ── build ─────────────────────────────────────────────────────────────────

/** Rejection-sample a point at least `minSep` from every point already in `avoid`. */
function placeAwayFrom(rng: () => number, avoid: { x: number; y: number }[], minSep: number): { x: number; y: number } {
  let best = { x: 0.5, y: 0.5 }
  let bestD = -1
  // A handful of tries; keep the best (furthest) candidate rather than looping
  // unboundedly, so placement is always deterministic-terminating.
  for (let i = 0; i < 40; i++) {
    const x = 0.08 + rng() * 0.84
    const y = 0.08 + rng() * 0.84
    let d = Infinity
    for (const p of avoid) {
      const dx = x - p.x, dy = y - p.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < d) d = dist
    }
    if (d >= minSep) return { x, y }
    if (d > bestD) { bestD = d; best = { x, y } }
  }
  return best
}

export function createAntColonyState(cfg: AntColonyConfig, w: number, h: number): AntColonyState {
  const res = cfg.gridResolution
  const numColonies = Number(cfg.colonies)
  const rng = mulberry32(cfg.seed | 0)

  const nests = numColonies === 2
    ? [{ x: 0.32, y: 0.5 }, { x: 0.68, y: 0.5 }]
    : [{ x: 0.5, y: 0.5 }]

  const food: FoodSource[] = []
  const placed: { x: number; y: number }[] = [...nests]
  for (let i = 0; i < cfg.foodSources; i++) {
    const p = placeAwayFrom(rng, placed, MIN_FOOD_SEP)
    placed.push(p)
    food.push({ x: p.x, y: p.y, amount: FOOD_CAPACITY, capacity: FOOD_CAPACITY })
  }

  const fields: ColonyField[] = []
  for (let c = 0; c < numColonies; c++) {
    fields.push({
      toFood: new Float32Array(res * res),
      toHome: new Float32Array(res * res),
      toFoodTotal: 0,
      toHomeTotal: 0,
    })
  }

  const ants: Ant[] = []
  const perColony = Math.max(1, Math.round(cfg.antCount / numColonies))
  for (let c = 0; c < numColonies; c++) {
    const nest = nests[c]
    for (let i = 0; i < perColony; i++) {
      ants.push({ x: nest.x, y: nest.y, heading: rng() * Math.PI * 2, mode: 0, colony: c })
    }
  }

  return {
    cfg, w, h, res, numColonies, nests, food, fields,
    scratch: new Float32Array(res * res),
    ants, rng, tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    collected: new Array(numColonies).fill(0),
    lut: buildTrailLuts(cfg), buf: null, img: null,
  }
}

// ── simulation ──────────────────────────────────────────────────────────────

/** 4-neighbor blur-then-decay, clamped edges (no wrap — the world has fixed
 *  boundaries). Blends each cell toward its neighbor average by `diffusion`,
 *  then multiplies by (1-evaporation). Uses the state's shared scratch buffer. */
function diffuseDecay(field: Float32Array, scratch: Float32Array, res: number, diffusion: number, evaporation: number): void {
  const keep = 1 - evaporation
  for (let y = 0; y < res; y++) {
    const ym = y > 0 ? y - 1 : y
    const yp = y < res - 1 ? y + 1 : y
    const row = y * res
    const rowUp = ym * res
    const rowDown = yp * res
    for (let x = 0; x < res; x++) {
      const xm = x > 0 ? x - 1 : x
      const xp = x < res - 1 ? x + 1 : x
      const idx = row + x
      const c = field[idx]
      const avg = (field[row + xm] + field[row + xp] + field[rowUp + x] + field[rowDown + x]) * 0.25
      scratch[idx] = (c + (avg - c) * diffusion) * keep
    }
  }
  field.set(scratch)
}

/** Sample a field at a normalized point; off-world points read 0 (no wrap). */
function sampleField(field: Float32Array, res: number, x: number, y: number): number {
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return 0
  let xi = (x * res) | 0
  let yi = (y * res) | 0
  if (xi >= res) xi = res - 1
  if (yi >= res) yi = res - 1
  return field[yi * res + xi]
}

function blendAngle(a: number, b: number, t: number): number {
  // Shortest-path angle blend (avoids the "always turn the long way" bug at the ±π seam).
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/** One synchronous ACO step: sense+steer+move+deposit every ant, resolve pickup/
 *  drop-off transitions, then diffuse+decay every colony's fields and regrow food. */
export function step(state: AntColonyState): void {
  const { cfg, res, fields, food, nests, ants, rng, scratch } = state
  state.tick++

  const moveStep = cfg.antSpeed / res
  const sensorDist = cfg.sensorDistance / res
  const sensorAngleRad = (cfg.sensorAngle * Math.PI) / 180
  const turnRad = (cfg.turnSpeed * Math.PI) / 180
  const jitterRad = (cfg.jitter * Math.PI) / 180
  const pickupR = PICKUP_RADIUS / res
  const nestR = NEST_RADIUS / res
  const deposit = cfg.depositAmount

  for (const ant of ants) {
    const field = fields[ant.colony]
    const nest = nests[ant.colony]
    const attractant = ant.mode === 0 ? field.toFood : field.toHome

    const h = ant.heading
    const valC = sampleField(attractant, res, ant.x + Math.cos(h) * sensorDist, ant.y + Math.sin(h) * sensorDist)
    const valL = sampleField(attractant, res, ant.x + Math.cos(h - sensorAngleRad) * sensorDist, ant.y + Math.sin(h - sensorAngleRad) * sensorDist)
    const valR = sampleField(attractant, res, ant.x + Math.cos(h + sensorAngleRad) * sensorDist, ant.y + Math.sin(h + sensorAngleRad) * sensorDist)

    if (valC >= valL && valC >= valR) {
      // straight — no turn
    } else if (valL > valR) {
      ant.heading -= turnRad
    } else {
      ant.heading += turnRad
    }
    ant.heading += (rng() * 2 - 1) * jitterRad

    if (ant.mode === 1 && cfg.homingBias > 0) {
      const desired = Math.atan2(nest.y - ant.y, nest.x - ant.x)
      ant.heading = blendAngle(ant.heading, desired, cfg.homingBias)
    }

    ant.x += Math.cos(ant.heading) * moveStep
    ant.y += Math.sin(ant.heading) * moveStep

    // Reflect off world bounds so nest/food stay fixed, meaningful landmarks.
    if (ant.x < 0) { ant.x = -ant.x; ant.heading = Math.PI - ant.heading }
    else if (ant.x >= 1) { ant.x = 2 - ant.x; ant.heading = Math.PI - ant.heading }
    if (ant.y < 0) { ant.y = -ant.y; ant.heading = -ant.heading }
    else if (ant.y >= 1) { ant.y = 2 - ant.y; ant.heading = -ant.heading }
    // Belt-and-suspenders clamp (large moveStep could in principle overshoot twice).
    if (ant.x < 0) ant.x = 0; else if (ant.x >= 1) ant.x = 0.999999
    if (ant.y < 0) ant.y = 0; else if (ant.y >= 1) ant.y = 0.999999

    let xi = (ant.x * res) | 0
    let yi = (ant.y * res) | 0
    if (xi >= res) xi = res - 1
    if (yi >= res) yi = res - 1
    const idx = yi * res + xi
    if (ant.mode === 0) {
      field.toHome[idx] += deposit
      field.toHomeTotal += deposit
    } else {
      field.toFood[idx] += deposit
      field.toFoodTotal += deposit
    }

    if (ant.mode === 0) {
      for (const f of food) {
        if (f.amount <= 0) continue
        const dx = f.x - ant.x, dy = f.y - ant.y
        if (dx * dx + dy * dy <= pickupR * pickupR) {
          f.amount -= Math.min(FOOD_PICKUP, f.amount) // never dip below 0 (amount can be fractional post-regen)
          ant.mode = 1
          ant.heading += Math.PI
          break
        }
      }
    } else {
      const dx = nest.x - ant.x, dy = nest.y - ant.y
      if (dx * dx + dy * dy <= nestR * nestR) {
        ant.mode = 0
        state.collected[ant.colony]++
        ant.heading += Math.PI
      }
    }
  }

  for (const field of fields) {
    diffuseDecay(field.toFood, scratch, res, cfg.diffusion, cfg.evaporation)
    diffuseDecay(field.toHome, scratch, res, cfg.diffusion, cfg.evaporation)
    field.toFoodTotal *= 1 - cfg.evaporation
    field.toHomeTotal *= 1 - cfg.evaporation
  }

  if (cfg.foodRegenerates) {
    for (const f of food) {
      if (f.amount < f.capacity) f.amount = Math.min(f.capacity, f.amount + f.capacity * FOOD_REGEN_FRAC)
    }
  }
}

export function advance(state: AntColonyState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function ensureBuf(state: AntColonyState): void {
  if (state.buf && state.img) return
  const n = state.res
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.img = bctx.createImageData(n, n)
}

// Compression constant for mapping unbounded pheromone density into 0..1 before
// LUT lookup (t = val/(val+K)); tuned so a handful of overlapping ant deposits
// already reads as a visible trail rather than needing hundreds to saturate.
const INTENSITY_K = 4

export function render(state: AntColonyState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, res, fields, numColonies, lut } = state
  ensureBuf(state)
  const img = state.img!
  const data = img.data
  const bg = hexRgb(cfg.palette.background)

  for (let i = 0; i < res * res; i++) {
    let r = bg[0], g = bg[1], b = bg[2]
    for (let c = 0; c < numColonies; c++) {
      const f = fields[c]
      const val = f.toFood[i] + f.toHome[i] * 0.5 // to-home trail reads dimmer (secondary)
      if (val <= 0) continue
      const t = val / (val + INTENSITY_K)
      let o = (t * 255) | 0
      if (o > 255) o = 255
      o *= 3
      const l = lut[c]
      r += (l[o] - r) * t
      g += (l[o + 1] - g) * t
      b += (l[o + 2] - b) * t
    }
    const p = i * 4
    data[p] = r | 0; data[p + 1] = g | 0; data[p + 2] = b | 0; data[p + 3] = 255
  }
  const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  bctx.putImageData(img, 0, 0)

  ctx.imageSmoothingEnabled = true
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, res, res, 0, 0, w, h)

  // Food blobs: brighter + larger while abundant, dim + small once depleted.
  const foodLow = hexRgb(cfg.palette.foodLow)
  const foodHigh = hexRgb(cfg.palette.foodHigh)
  const minDim = Math.min(w, h)
  for (const f of state.food) {
    const t = f.capacity > 0 ? f.amount / f.capacity : 0
    const fr = mix(foodLow[0], foodHigh[0], t), fg = mix(foodLow[1], foodHigh[1], t), fb = mix(foodLow[2], foodHigh[2], t)
    const radius = (0.005 + 0.018 * t) * minDim
    ctx.fillStyle = `rgb(${fr},${fg},${fb})`
    ctx.beginPath()
    ctx.arc(f.x * w, f.y * h, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // Nests.
  const nestColors = [cfg.palette.nestA, cfg.palette.nestB]
  for (let c = 0; c < numColonies; c++) {
    const nest = state.nests[c]
    ctx.fillStyle = nestColors[c]
    ctx.beginPath()
    ctx.arc(nest.x * w, nest.y * h, 0.018 * minDim, 0, Math.PI * 2)
    ctx.fill()
  }

  if (cfg.showAnts) {
    const trailColors = [hexRgb(cfg.palette.trailA), hexRgb(cfg.palette.trailB)]
    for (const ant of state.ants) {
      const col = trailColors[ant.colony]
      ctx.fillStyle = ant.mode === 1
        ? `rgb(${col[0]},${col[1]},${col[2]})`
        : `rgba(${col[0]},${col[1]},${col[2]},0.45)`
      ctx.beginPath()
      ctx.arc(ant.x * w, ant.y * h, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (cfg.showHud) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#f0e9df'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    const parts = [`foraged A ${state.collected[0]}`]
    if (numColonies === 2) parts.push(`foraged B ${state.collected[1]}`)
    ctx.fillText(parts.join('   ·   '), 14, 14)
    ctx.globalAlpha = 1
  }
}
