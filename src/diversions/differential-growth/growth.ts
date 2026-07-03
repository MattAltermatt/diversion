import { mulberry32 } from '../../framework/rng'
import type { DifferentialGrowthConfig } from './schema'

// ─── Differential growth simulation ──────────────────────────────────────────
// A closed self-avoiding polyline relaxed by an OVERDAMPED position-based model:
// every force is a bounded displacement, magnitude-clamped to `maxStep` before it
// is applied, so there is no velocity to accumulate and the sim structurally
// cannot blow up. Beauty is the balance of attraction (holds the strand together)
// + repulsion (buckles separate strands into folds) + insertion (grows length).
// All randomness is seeded so the same seed reproduces the same world.

export interface GrowthNode {
  x: number
  y: number
  born: number // global sub-step index at insertion → drives age coloring
  dx: number // scratch displacement accumulator (reused each sub-step)
  dy: number
}

export interface GrowthView {
  scale: number
  cx: number // world point mapped to canvas center
  cy: number
}

export interface GrowthState {
  nodes: GrowthNode[]
  rng: () => number
  step: number // global sub-step counter (monotonic; ages nodes)
  cfg: DifferentialGrowthConfig
  w: number
  h: number
  acc: number // fixed-timestep accumulator (ms)
  settledMs: number // ms spent at the node cap — drives the reset loop
  view: GrowthView // slow-lerped autofit transform (anti-drift, keeps it framed)
}

const N0 = 48 // initial ring node count
const MAX_STEP = 1.0 // px — the single hard stability rail (clamp per node per sub-step)
const BROWNIAN = 0.03 // px — perpetual micro-motion so it never freezes at the cap
const MAX_SUBSTEPS_PER_FRAME = 4 // caps a background-tab catch-up burst
const MAX_VIEW_SCALE = 3 // never magnify a tiny early ring more than this
const VIEW_TAU = 1200 // ms — autofit lerp time constant (slow, so the frame never swims)
const FIT_MARGIN = 0.9 // fit bounds into 90% of the frame

function initialRadius(w: number, h: number): number {
  return Math.min(w, h) * 0.05
}

export function createGrowthState(cfg: DifferentialGrowthConfig, w: number, h: number): GrowthState {
  const rng = mulberry32(cfg.seed >>> 0)
  const cx = w / 2
  const cy = h / 2
  const r0 = initialRadius(w, h)
  const nodes: GrowthNode[] = []
  for (let k = 0; k < N0; k++) {
    const a = (2 * Math.PI * k) / N0
    // Seeded jitter is load-bearing: a perfectly symmetric ring never buckles.
    const jx = (rng() * 2 - 1) * r0 * 0.12
    const jy = (rng() * 2 - 1) * r0 * 0.12
    nodes.push({ x: cx + Math.cos(a) * r0 + jx, y: cy + Math.sin(a) * r0 + jy, born: 0, dx: 0, dy: 0 })
  }
  const state: GrowthState = {
    nodes, rng, step: 0, cfg, w, h, acc: 0, settledMs: 0,
    view: { scale: 1, cx, cy },
  }
  // Snap the view to the initial fit so frame 1 is already framed (no zoom-in swim).
  const t = fitTarget(state)
  state.view = t
  return state
}

/** Local curvature at node i: |p_{i-1} - 2p_i + p_{i+1}|. Higher = tighter fold. */
export function curvatureAt(nodes: GrowthNode[], i: number): number {
  const n = nodes.length
  const a = nodes[(i - 1 + n) % n]
  const b = nodes[i]
  const c = nodes[(i + 1) % n]
  const vx = a.x - 2 * b.x + c.x
  const vy = a.y - 2 * b.y + c.y
  return Math.hypot(vx, vy)
}

// ─── Spatial hash (uniform grid, cell = repulsionRadius) ─────────────────────
// A node within R of node i is guaranteed to fall in the 3×3 block of cells
// around i's cell, so repulsion is effectively O(n) for a 1-D manifold at bounded
// local density. String keys → no hash-collision ambiguity (determinism).

export type Grid = Map<string, number[]>

export function buildGrid(nodes: GrowthNode[], cell: number): Grid {
  const grid: Grid = new Map()
  for (let i = 0; i < nodes.length; i++) {
    const key = `${Math.floor(nodes[i].x / cell)},${Math.floor(nodes[i].y / cell)}`
    const bucket = grid.get(key)
    if (bucket) bucket.push(i)
    else grid.set(key, [i])
  }
  return grid
}

/** Indices of nodes within radius R of node i (excludes i itself), via the grid.
 *  Distance-filtered, so it returns exactly the same set as a brute-force scan. */
export function neighborsWithin(nodes: GrowthNode[], grid: Grid, cell: number, i: number, R: number): number[] {
  const p = nodes[i]
  const cx = Math.floor(p.x / cell)
  const cy = Math.floor(p.y / cell)
  const out: number[] = []
  const R2 = R * R
  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const bucket = grid.get(`${gx},${gy}`)
      if (!bucket) continue
      for (const k of bucket) {
        if (k === i) continue
        const dx = nodes[k].x - p.x
        const dy = nodes[k].y - p.y
        if (dx * dx + dy * dy < R2) out.push(k)
      }
    }
  }
  return out
}

/** One relaxation pass: accumulate the four forces, clamp, integrate. */
function relax(state: GrowthState): void {
  const { nodes, cfg } = state
  const n = nodes.length
  const R = cfg.repulsionRadius
  const desired = 0.5 * cfg.splitLength
  const grid = buildGrid(nodes, R)

  for (let i = 0; i < n; i++) {
    const p = nodes[i]
    p.dx = 0
    p.dy = 0
    const prev = nodes[(i - 1 + n) % n]
    const next = nodes[(i + 1) % n]

    // (a) attraction — one-sided spacing spring to each chain-neighbor
    for (const nb of [prev, next]) {
      const ex = nb.x - p.x
      const ey = nb.y - p.y
      const d = Math.hypot(ex, ey)
      if (d > desired && d > 0) {
        const f = (cfg.attractionStrength * (d - desired)) / d
        p.dx += ex * f
        p.dy += ey * f
      }
    }

    // (b) repulsion — self-avoidance, linear falloff, excludes chain-neighbors
    const prevI = (i - 1 + n) % n
    const nextI = (i + 1) % n
    for (const k of neighborsWithin(nodes, grid, R, i, R)) {
      if (k === prevI || k === nextI) continue
      const vx = p.x - nodes[k].x
      const vy = p.y - nodes[k].y
      const d = Math.hypot(vx, vy)
      if (d > 0 && d < R) {
        const f = (cfg.repulsionStrength * (R - d)) / R / d
        p.dx += vx * f
        p.dy += vy * f
      }
    }

    // (c) alignment — Laplacian smoothing toward the neighbor midpoint
    const mx = (prev.x + next.x) / 2
    const my = (prev.y + next.y) / 2
    p.dx += (mx - p.x) * cfg.alignment
    p.dy += (my - p.y) * cfg.alignment

    // (d) brownian — tiny seeded jitter so it never fully freezes at the cap
    p.dx += (state.rng() * 2 - 1) * BROWNIAN
    p.dy += (state.rng() * 2 - 1) * BROWNIAN
  }

  // integrate: clamp magnitude then apply (the hard stability rail)
  for (let i = 0; i < n; i++) {
    const p = nodes[i]
    const len = Math.hypot(p.dx, p.dy)
    if (len > MAX_STEP) {
      const s = MAX_STEP / len
      p.dx *= s
      p.dy *= s
    }
    p.x += p.dx
    p.y += p.dy
  }
}

/** Grow the ring: split long edges (primary) + rate-limited curvature injection. */
function grow(state: GrowthState): void {
  const { nodes, cfg } = state
  if (nodes.length >= cfg.maxNodes) return

  // primary: split any edge longer than splitLength at its midpoint. Build a new
  // array in one O(n) pass (mid-walk splice would be O(n) each).
  const n = nodes.length
  const out: GrowthNode[] = []
  const split2 = cfg.splitLength * cfg.splitLength
  for (let i = 0; i < n; i++) {
    const a = nodes[i]
    out.push(a)
    if (out.length >= cfg.maxNodes) continue
    const b = nodes[(i + 1) % n]
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (dx * dx + dy * dy > split2) {
      out.push({ x: a.x + dx * 0.5, y: a.y + dy * 0.5, born: state.step, dx: 0, dy: 0 })
    }
  }
  state.nodes = out

  // secondary: expected `growthBias` injections/sub-step at the most-curved spot,
  // amplifying existing bumps into irregular, organic asymmetry.
  if (cfg.growthBias > 0 && state.nodes.length < cfg.maxNodes && state.rng() < cfg.growthBias) {
    injectAtCurvature(state)
  }
}

/** Insert one node next to a curvature-weighted random pick, on its longer edge. */
export function injectAtCurvature(state: GrowthState): void {
  const { nodes } = state
  const n = nodes.length
  let total = 0
  const weights: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const w = curvatureAt(nodes, i)
    weights[i] = w
    total += w
  }
  if (total <= 0) return
  let r = state.rng() * total
  let j = 0
  for (; j < n; j++) {
    r -= weights[j]
    if (r <= 0) break
  }
  if (j >= n) j = n - 1
  // pick the longer of j's two adjacent edges, insert its midpoint
  const p = nodes[j]
  const prev = nodes[(j - 1 + n) % n]
  const next = nodes[(j + 1) % n]
  const dPrev = Math.hypot(p.x - prev.x, p.y - prev.y)
  const dNext = Math.hypot(next.x - p.x, next.y - p.y)
  const mid: GrowthNode = dNext >= dPrev
    ? { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2, born: state.step, dx: 0, dy: 0 }
    : { x: (p.x + prev.x) / 2, y: (p.y + prev.y) / 2, born: state.step, dx: 0, dy: 0 }
  const insertAt = dNext >= dPrev ? j + 1 : j
  nodes.splice(insertAt, 0, mid)
}

/** One simulation sub-step: relax, then grow, then age the clock. */
export function stepGrowth(state: GrowthState): void {
  relax(state)
  grow(state)
  state.step++
}

/** Advance the sim by real elapsed `dt` (ms) at a fixed sub-step rate, so growth
 *  is frame-rate independent and reproducible per sub-step count. */
export function advanceGrowth(state: GrowthState, dt: number): void {
  const stepMs = 1000 / state.cfg.speed
  state.acc += dt
  let k = 0
  while (state.acc >= stepMs && k < MAX_SUBSTEPS_PER_FRAME) {
    stepGrowth(state)
    state.acc -= stepMs
    k++
  }
  if (state.acc > stepMs * MAX_SUBSTEPS_PER_FRAME) state.acc = 0 // drop backlog
  if (state.nodes.length >= state.cfg.maxNodes) state.settledMs += dt
  else state.settledMs = 0
}

// ─── Autofit view (anti-drift, keeps the piece framed) ───────────────────────

/** The view that frames the current node bounds into FIT_MARGIN of the canvas. */
export function fitTarget(state: GrowthState): GrowthView {
  const { nodes, w, h } = state
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of nodes) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const scale = Math.min((w * FIT_MARGIN) / bw, (h * FIT_MARGIN) / bh, MAX_VIEW_SCALE)
  return { scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

/** Slow-lerp the live view toward the fit target (frame never snaps/swims). */
export function updateView(state: GrowthState, dt: number): void {
  const t = fitTarget(state)
  const a = 1 - Math.exp(-dt / VIEW_TAU)
  state.view.scale += (t.scale - state.view.scale) * a
  state.view.cx += (t.cx - state.view.cx) * a
  state.view.cy += (t.cy - state.view.cy) * a
}

/** Apply a live config change without a full re-setup where possible. Structural
 *  changes (seed) need a fresh ring; everything else is read live from state.cfg. */
export function updateGrowthState(state: GrowthState, cfg: DifferentialGrowthConfig): boolean {
  if (cfg.seed !== state.cfg.seed) return false
  state.cfg = cfg
  return true
}
