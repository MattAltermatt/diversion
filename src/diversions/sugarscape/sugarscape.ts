// sugarscape.ts — the Epstein–Axtell agent economy. Pure (no DOM-instantiating
// imports) so it unit-tests headless. A fixed square grid holds a sugar capacity
// field (two Gaussian mountains) and a current sugar amount that regrows toward it;
// agents look along the four cardinal directions up to their vision, dart to the
// richest unoccupied cell, harvest it, and pay metabolism. The grid is rendered
// stretched-to-fill so a resize never rebuilds the world.

import { mulberry32 } from '../../framework/rng'
import type { SugarscapeConfig } from './schema'

const MAX_CAP = 8 // peak sugar capacity at a mountain summit
const SEASON_TICKS = 240 // period of the seasonal regrowth swing
const WINTER = 0.12 // regrowth multiplier for the out-of-season hemisphere

export interface Agent {
  col: number
  row: number
  prevCol: number
  prevRow: number
  vision: number
  metab: number
  sugar: number
  age: number
  maxAge: number // dies of old age at this many steps
}

export interface SugarState {
  cfg: SugarscapeConfig
  w: number
  h: number
  n: number // grid side
  cap: Float32Array // capacity per cell (n*n)
  sugar: Float32Array // current sugar per cell
  occupied: Int32Array // agent index occupying a cell, or -1
  agents: Agent[]
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  fieldLut: Uint8Array // 65×3 rgb ramp barren→low→high
  field: ImageData | null // offscreen n×n sugar image
  buf: OffscreenCanvas | HTMLCanvasElement | null
  meanWealth: number
  dirty: boolean // field needs a pixel rebuild (a step ran / colors edited); else just re-blit (#273)
}

// ── color ─────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t)

/** 65-entry barren→low→high ramp (t = sugar/MAX_CAP), packed rgb. */
export function buildFieldLut(cfg: SugarscapeConfig): Uint8Array {
  const bg = hexRgb(cfg.land.background)
  const lo = hexRgb(cfg.land.low)
  const hi = hexRgb(cfg.land.high)
  const lut = new Uint8Array(65 * 3)
  for (let i = 0; i <= 64; i++) {
    const t = i / 64
    // barren→low over first half, low→high over second — sugar reads as glowing hills.
    let r, g, b
    if (t < 0.5) {
      const u = t / 0.5
      r = mix(bg[0], lo[0], u); g = mix(bg[1], lo[1], u); b = mix(bg[2], lo[2], u)
    } else {
      const u = (t - 0.5) / 0.5
      r = mix(lo[0], hi[0], u); g = mix(lo[1], hi[1], u); b = mix(lo[2], hi[2], u)
    }
    lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b
  }
  return lut
}

// ── build ─────────────────────────────────────────────────────────────────

function gauss(dx: number, dy: number, sigma: number): number {
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma))
}

/** Two-mountain capacity field, opposite quadrants, normalized so summits hit MAX_CAP. */
function buildCapacity(n: number): Float32Array {
  const cap = new Float32Array(n * n)
  const sigma = n * 0.16
  const p1x = n * 0.28, p1y = n * 0.28
  const p2x = n * 0.72, p2y = n * 0.72
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const g = gauss(c - p1x, r - p1y, sigma) + gauss(c - p2x, r - p2y, sigma)
      cap[r * n + c] = Math.min(1, g) * MAX_CAP
    }
  }
  return cap
}

/** A lifespan drawn ±30% around the configured mean. */
function rollLifespan(cfg: SugarscapeConfig, rng: () => number): number {
  return Math.max(5, Math.round(cfg.lifespan * (0.7 + rng() * 0.6)))
}

export function createSugarState(cfg: SugarscapeConfig, w: number, h: number): SugarState {
  const n = cfg.gridResolution
  const rng = mulberry32(cfg.seed | 0)
  const cap = buildCapacity(n)
  const sugar = new Float32Array(cap) // start full
  const occupied = new Int32Array(n * n).fill(-1)

  const agents: Agent[] = []
  const wanted = Math.min(cfg.agentCount, n * n - 1)
  let guard = wanted * 40
  while (agents.length < wanted && guard-- > 0) {
    const c = (rng() * n) | 0
    const r = (rng() * n) | 0
    const idx = r * n + c
    if (occupied[idx] !== -1) continue
    occupied[idx] = agents.length
    agents.push({
      col: c, row: r, prevCol: c, prevRow: r,
      vision: 1 + ((rng() * cfg.visionMax) | 0),
      metab: 1 + ((rng() * cfg.metabolismMax) | 0),
      sugar: 5 + rng() * 20,
      age: 0,
      maxAge: rollLifespan(cfg, rng),
    })
  }

  return {
    cfg, w, h, n, cap, sugar, occupied, agents, rng,
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    fieldLut: buildFieldLut(cfg), field: null, buf: null, meanWealth: 0,
    dirty: true,
  }
}

// ── simulation ──────────────────────────────────────────────────────────────

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** One synchronous-random-order Sugarscape step: move+harvest each agent, cull the
 *  starved, optionally breed the fed, then regrow the field. */
export function step(state: SugarState): void {
  const { cfg, n, cap, sugar, occupied, agents, rng } = state
  state.tick++

  // Random update order (Fisher–Yates on an index array).
  const order = agents.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  const dead: number[] = []
  const born: Agent[] = []
  const maxPop = cfg.agentCount * 3

  for (const ai of order) {
    const a = agents[ai]
    if (a.sugar < 0) continue // already culled this tick
    // Rule M: best visible unoccupied cell (own cell included), nearest wins ties.
    let bestC = a.col, bestR = a.row
    let bestS = sugar[a.row * n + a.col]
    for (const [dx, dy] of DIRS) {
      for (let d = 1; d <= a.vision; d++) {
        const c = a.col + dx * d
        const r = a.row + dy * d
        if (c < 0 || c >= n || r < 0 || r >= n) break
        const idx = r * n + c
        if (occupied[idx] !== -1) continue // occupied cells aren't candidates; keep scanning past them
        const s = sugar[idx]
        // Strictly-greater only → the nearest max wins (scan runs near→far, dir by dir).
        if (s > bestS) { bestS = s; bestC = c; bestR = r }
      }
    }
    // Move.
    occupied[a.row * n + a.col] = -1
    a.prevCol = a.col; a.prevRow = a.row
    a.col = bestC; a.row = bestR
    const nidx = bestR * n + bestC
    occupied[nidx] = ai
    // Harvest + metabolize + age.
    a.sugar += sugar[nidx]
    sugar[nidx] = 0
    a.sugar -= a.metab
    a.age++
    if (a.sugar < 0 || a.age >= a.maxAge) {
      occupied[nidx] = -1
      dead.push(ai)
      continue
    }
    // Reproduce: a fed, mature agent buds a mutated child onto an adjacent empty cell.
    // A high wealth bar keeps breeding gated on genuine surplus, so the population
    // grows toward a food-limited carrying capacity rather than slamming the cap.
    if (cfg.reproduction && a.sugar >= 24 && a.age >= 8 && agents.length + born.length < maxPop) {
      let placed = -1
      for (const [dx, dy] of DIRS) {
        const c = a.col + dx, r = a.row + dy
        if (c < 0 || c >= n || r < 0 || r >= n) continue
        const idx = r * n + c
        if (occupied[idx] === -1) { placed = idx; break }
      }
      if (placed !== -1) {
        const half = a.sugar / 2
        a.sugar = half
        const childIndex = agents.length + born.length
        occupied[placed] = childIndex
        const mut = (v: number, max: number) => Math.max(1, Math.min(max, v + ((rng() * 3) | 0) - 1))
        born.push({
          col: placed % n, row: (placed / n) | 0, prevCol: a.col, prevRow: a.row,
          vision: mut(a.vision, cfg.visionMax), metab: mut(a.metab, cfg.metabolismMax),
          sugar: half, age: 0, maxAge: rollLifespan(cfg, rng),
        })
      }
    }
  }

  // Cull the dead (mark, then compact so occupied indices stay valid).
  if (dead.length) {
    const deadSet = new Set(dead)
    // Reindex: build survivors + births, then rewrite occupied from scratch.
    const survivors = agents.filter((_, i) => !deadSet.has(i))
    const next = survivors.concat(born)
    occupied.fill(-1)
    for (let i = 0; i < next.length; i++) occupied[next[i].row * n + next[i].col] = i
    state.agents = next
  } else if (born.length) {
    const start = agents.length
    for (let i = 0; i < born.length; i++) occupied[born[i].row * n + born[i].col] = start + i
    state.agents = agents.concat(born)
  }

  // Regrow toward capacity, with a seasonal swing between hemispheres.
  const phase = cfg.seasons ? Math.sin((state.tick / SEASON_TICKS) * Math.PI * 2) : 0
  const rate = cfg.regrowthRate
  for (let r = 0; r < n; r++) {
    // Top hemisphere in season when phase>0, bottom when phase<0.
    let f = rate
    if (cfg.seasons) {
      const topInSeason = phase >= 0
      const isTop = r < n / 2
      f = rate * (isTop === topInSeason ? 1 : WINTER)
    }
    for (let c = 0; c < n; c++) {
      const idx = r * n + c
      const v = sugar[idx] + f
      sugar[idx] = v > cap[idx] ? cap[idx] : v
    }
  }

  // Mean wealth stat.
  let tot = 0
  for (const a of state.agents) tot += a.sugar
  state.meanWealth = state.agents.length ? tot / state.agents.length : 0
}

export function advance(state: SugarState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
    state.dirty = true // the field changed → it needs a pixel rebuild this frame
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function agentColor(state: SugarState, a: Agent): string {
  const { cfg } = state
  const base = cfg.land.agent
  if (cfg.agentColor === 'fixed') return base
  if (cfg.agentColor === 'wealth') {
    // Strong inequality read: the poor are dim & desaturated, the rich burn toward
    // white. dim (0.3) → full base color (mid) → white (top quarter of wealth).
    const t = Math.min(1, a.sugar / 40)
    const [br, bg, bb] = hexRgb(base)
    const dim = 0.3 + 0.7 * t
    const wht = Math.max(0, (t - 0.6) / 0.4) * 0.85
    const r = Math.round(mix(Math.round(br * dim), 255, wht))
    const g = Math.round(mix(Math.round(bg * dim), 255, wht))
    const b = Math.round(mix(Math.round(bb * dim), 255, wht))
    return `rgb(${r},${g},${b})`
  }
  // vision: hue-ish ramp from base toward magenta by eyesight.
  const t = a.vision / cfg.visionMax
  const [br, bg, bb] = hexRgb(base)
  const r = mix(br, 255, t), g = mix(bg, 90, t), b = mix(bb, 200, t)
  return `rgb(${r},${g},${b})`
}

/** ensureBuf builds/keeps an n×n offscreen canvas for the sugar field. */
function ensureBuf(state: SugarState): void {
  if (state.buf && state.field) return
  const n = state.n
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.field = bctx.createImageData(n, n)
  state.dirty = true // fresh (blank) field must be painted before the first blit
}

export function render(state: SugarState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, sugar, fieldLut } = state
  ensureBuf(state)
  // Only rebuild the n×n field when it actually changed (a step ran / colors edited);
  // otherwise the offscreen buffer already holds it and we just re-blit it (#273).
  if (state.dirty) {
    const img = state.field!
    const data = img.data
    const scale = 64 / MAX_CAP
    for (let i = 0; i < n * n; i++) {
      let li = (sugar[i] * scale) | 0
      if (li > 64) li = 64
      const o = li * 3
      const p = i * 4
      data[p] = fieldLut[o]; data[p + 1] = fieldLut[o + 1]; data[p + 2] = fieldLut[o + 2]; data[p + 3] = 255
    }
    const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
    bctx.putImageData(img, 0, 0)
    state.dirty = false
  }

  ctx.imageSmoothingEnabled = cfg.softField
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  // Agents, at interpolated cell positions.
  const alpha = state.tickMs > 0 ? Math.min(1, state.tickAccum / state.tickMs) : 0
  const sx = w / n
  const sy = h / n
  const rad = cfg.agentSize
  for (const a of state.agents) {
    const cx = (a.prevCol + (a.col - a.prevCol) * alpha + 0.5) * sx
    const cy = (a.prevRow + (a.row - a.prevRow) * alpha + 0.5) * sy
    ctx.fillStyle = agentColor(state, a)
    ctx.beginPath()
    ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.fill()
  }

  if (cfg.showHud) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#f0e9df'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`pop ${state.agents.length}   ·   mean wealth ${state.meanWealth.toFixed(1)}`, 14, 14)
    ctx.globalAlpha = 1
  }
}
