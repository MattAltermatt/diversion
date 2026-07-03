// traffic.ts — the Nagel–Schreckenberg cellular automaton + its rendering. Pure
// (no DOM-instantiating imports) so it unit-tests headless. One lane is a 1-D ring
// of `ring` cells holding cars that never overtake within a lane; the four NS rules
// run once per tick, and the framework's dt drives how often a tick fires. Cars are
// rendered at interpolated positions between ticks so motion reads as smooth, fluid
// light rather than a blocky CA.

import { mulberry32 } from '../../framework/rng'
import type { PhantomTrafficConfig } from './schema'

export interface Car {
  cell: number // current integer cell (0..ring-1)
  prev: number // pre-move cell (unwrapped start of this tick's slide) for interpolation
  speed: number // current speed in cells/tick (0..maxSpeed)
  next: number // scratch: next speed, computed from a frozen snapshot before anyone moves
}

export interface Lane {
  ring: number
  cars: Car[] // kept sorted ascending by cell; no overtaking, so order is stable modulo wrap
}

export interface TrafficState {
  cfg: PhantomTrafficConfig
  w: number
  h: number
  lanes: Lane[]
  tickAccum: number // ms accumulated toward the next tick
  tickMs: number // ms per tick (derived from cfg.simSpeed)
  lut: string[] // speed → color, length maxSpeed+1
  meanFlow: number // mean (speed / maxSpeed) over all cars, updated each tick
  painted: boolean // has the background been laid down once (for trail mode)
}

// ── color ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  const r = Math.round(ar + (br - ar) * t)
  const g = Math.round(ag + (bg - ag) * t)
  const bl = Math.round(ab + (bb - ab) * t)
  return `rgb(${r},${g},${bl})`
}

/** Speed → color LUT, jam (slow) hue at speed 0 up to the free (fast) hue at max. */
export function buildLut(cfg: PhantomTrafficConfig): string[] {
  const lut: string[] = []
  const max = Math.max(1, cfg.maxSpeed)
  for (let v = 0; v <= max; v++) {
    if (!cfg.colorBySpeed) lut.push(cfg.color.fast)
    else lut.push(lerpColor(cfg.color.slow, cfg.color.fast, v / max))
  }
  return lut
}

// ── build ────────────────────────────────────────────────────────────────────

function buildLane(ring: number, count: number, maxSpeed: number, rng: () => number): Lane {
  // Sample `count` distinct cells, then sort — cars never share a cell.
  const taken = new Set<number>()
  const target = Math.min(count, ring - 1) // leave at least one gap so nothing gridlocks solid
  while (taken.size < target) taken.add((rng() * ring) | 0)
  const cells = [...taken].sort((p, q) => p - q)
  const cars: Car[] = cells.map((cell) => {
    const speed = (rng() * (maxSpeed + 1)) | 0
    return { cell, prev: cell, speed, next: speed }
  })
  return { ring, cars }
}

export function createTrafficState(cfg: PhantomTrafficConfig, w: number, h: number): TrafficState {
  const ring = cfg.roadLength
  const perLane = Math.round(cfg.density * ring)
  const lanes: Lane[] = []
  for (let i = 0; i < cfg.lanes; i++) {
    // Distinct seed per lane so each ring-road jams differently.
    const rng = mulberry32((cfg.seed | 0) + i * 9973)
    lanes.push(buildLane(ring, perLane, cfg.maxSpeed, rng))
  }
  return {
    cfg,
    w,
    h,
    lanes,
    tickAccum: 0,
    tickMs: 1000 / cfg.simSpeed,
    lut: buildLut(cfg),
    meanFlow: 0,
    painted: false,
  }
}

// ── simulation ─────────────────────────────────────────────────────────────

/** One Nagel–Schreckenberg step for a single lane. Speeds are computed from a
 *  frozen snapshot (gaps read current positions) before any car moves — the CA is
 *  synchronous. Returns total speed moved (for the flow stat). */
export function stepLane(lane: Lane, cfg: PhantomTrafficConfig, rng: () => number): number {
  const { cars, ring } = lane
  const n = cars.length
  if (n === 0) return 0
  // 1–3: accelerate, brake to the gap ahead, random dawdle → next speed.
  for (let i = 0; i < n; i++) {
    const ahead = cars[(i + 1) % n]
    let gap = ahead.cell - cars[i].cell
    if (i === n - 1) gap += ring // last car's leader is cars[0], across the seam
    gap -= 1 // free cells strictly between the two cars
    let v = Math.min(cars[i].speed + 1, cfg.maxSpeed)
    if (v > gap) v = gap
    if (v < 0) v = 0
    if (v > 0 && rng() < cfg.dawdle) v -= 1
    cars[i].next = v
  }
  // 4: move. Order is preserved (no overtaking); re-sort only fixes wrap rotation.
  let moved = 0
  for (let i = 0; i < n; i++) {
    const c = cars[i]
    c.prev = c.cell
    c.speed = c.next
    c.cell = (c.cell + c.speed) % ring
    moved += c.speed
  }
  cars.sort((a, b) => a.cell - b.cell)
  return moved
}

/** Advance the sim by dt ms, firing whole ticks as time accumulates. */
export function advance(state: TrafficState, dt: number): void {
  const { cfg } = state
  state.tickMs = 1000 / cfg.simSpeed
  state.tickAccum += dt
  // Cap catch-up so a long stall (tab throttle) doesn't fire hundreds of ticks.
  let budget = 6
  const maxV = Math.max(1, cfg.maxSpeed)
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    let moved = 0
    let total = 0
    for (let i = 0; i < state.lanes.length; i++) {
      const rng = mulberry32(((cfg.seed | 0) + i * 9973 + Math.floor(state.tickAccum) + budget * 131) >>> 0)
      moved += stepLane(state.lanes[i], cfg, rng)
      total += state.lanes[i].cars.length
    }
    state.meanFlow = total > 0 ? moved / (total * maxV) : 0
  }
}

// ── rendering ────────────────────────────────────────────────────────────────

/** Interpolated position of a car along its ring (0..ring), continuous through the
 *  tick: slides from `prev` to `prev + speed`. Caller mods by ring for placement. */
function renderPos(c: Car, alpha: number): number {
  return c.prev + c.speed * alpha
}

export function render(state: TrafficState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  // Trails: fade toward bg instead of clearing. Higher trailLength = lower alpha.
  if (cfg.fadeTrails && state.painted) {
    ctx.globalAlpha = Math.max(0.02, 0.6 - cfg.trailLength * 0.0058)
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
    ctx.globalAlpha = 1
  } else {
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)
  }
  state.painted = true

  const alpha = state.tickMs > 0 ? Math.min(1, state.tickAccum / state.tickMs) : 0
  const r = cfg.carSize

  if (cfg.layout === 'rings') {
    const cx = w / 2
    const cy = h / 2
    const outer = Math.min(w, h) * 0.46
    const inner = Math.min(w, h) * 0.12
    const lanes = state.lanes.length
    for (let i = 0; i < lanes; i++) {
      const lane = state.lanes[i]
      const rad = lanes === 1 ? (outer + inner) / 2
        : inner + (outer - inner) * (i / (lanes - 1))
      for (const c of lane.cars) {
        const p = renderPos(c, alpha)
        const theta = (p / lane.ring) * Math.PI * 2
        const x = cx + Math.cos(theta) * rad
        const y = cy + Math.sin(theta) * rad
        ctx.fillStyle = state.lut[c.speed]
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  } else {
    // highway: stacked horizontal lanes, flow left→right, jams slide left.
    const lanes = state.lanes.length
    const margin = Math.min(48, h * 0.08)
    const usable = h - margin * 2
    const spacing = lanes === 1 ? 0 : usable / (lanes - 1)
    const y0 = lanes === 1 ? h / 2 : margin
    for (let i = 0; i < lanes; i++) {
      const lane = state.lanes[i]
      const y = y0 + spacing * i
      for (const c of lane.cars) {
        const p = renderPos(c, alpha) % lane.ring
        const x = (p / lane.ring) * w
        ctx.fillStyle = state.lut[c.speed]
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  if (cfg.showHud) drawHud(state, ctx)
}

function drawHud(state: TrafficState, ctx: CanvasRenderingContext2D): void {
  ctx.globalAlpha = 0.85
  ctx.fillStyle = '#dfe6f0'
  ctx.font = '12px system-ui, sans-serif'
  ctx.textBaseline = 'top'
  const density = state.cfg.density.toFixed(2)
  const flow = state.meanFlow.toFixed(2)
  ctx.fillText(`density ${density}   ·   flow ${flow}`, 14, 14)
  ctx.globalAlpha = 1
}
