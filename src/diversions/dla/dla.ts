import { mulberry32 } from '../../framework/rng'
import type { DLAConfig } from './schema'

// ─── Diffusion-Limited Aggregation, on-lattice ──────────────────────────────
// A grid doubles as the occupancy structure (O(1) stick test) AND the age record
// (each cell stores the arrival order → drives the ring colouring). One walker at
// a time random-walks in from a birth circle just outside the cluster; adaptive
// long-jumps when far from the frozen mass keep it watchable as the cluster grows
// (a naive far-away walker would wander for millions of steps). Framework-agnostic:
// no DOM, so the walk is unit-testable.

export const CELL_PX = 3 // grid cell size in CSS px (a look/detail decision — see gotcha memory)
const BIRTH_MARGIN = 6 // cells the birth circle sits beyond the cluster radius
const FILL_FRAC = 0.47 // cluster radius / half-min-dimension at which the frame is "full"
const EST_FILL_FRAC = 0.12 // fraction of grid cells a filled dendrite occupies (ring-period estimate)
const WALKER_STEP_CAP = 4000 // a single walker respawns after this many fine steps (anti-orbit)
const MAX_STEPS_PER_FRAME = 60000 // hard ceiling so one frame never stalls

export interface DLAState {
  cfg: DLAConfig
  w: number // CSS px
  h: number
  gw: number // grid cells
  gh: number
  cx: number // seed centre, cells
  cy: number
  ages: Int32Array // -1 empty, else arrival index
  count: number // frozen particles so far
  maxR: number // furthest frozen cell from centre (cells)
  period: number // particles per full palette cycle (ring spacing)
  filled: boolean
  filledMs: number
  rng: () => number
  // active walker
  wx: number
  wy: number
  wsteps: number
  hasWalker: boolean
  budget: number // fractional particle budget carried across frames
  // render hand-off: packed [gx, gy, age, ...] frozen THIS frame (drained by render)
  fresh: number[]
  needsFullRedraw: boolean
}

const inBounds = (s: DLAState, gx: number, gy: number) =>
  gx >= 0 && gy >= 0 && gx < s.gw && gy < s.gh
const occupied = (s: DLAState, gx: number, gy: number) =>
  inBounds(s, gx, gy) && s.ages[gy * s.gw + gx] >= 0

function freeze(s: DLAState, gx: number, gy: number): void {
  const idx = gy * s.gw + gx
  s.ages[idx] = s.count
  s.fresh.push(gx, gy, s.count)
  s.count++
  const r = Math.hypot(gx - s.cx, gy - s.cy)
  if (r > s.maxR) s.maxR = r
}

/** Seed the initial frozen particle(s) for the chosen seed geometry. */
function seedCluster(s: DLAState): void {
  const cx = Math.round(s.cx), cy = Math.round(s.cy)
  switch (s.cfg.seedType) {
    case 'ring': {
      const rr = Math.max(6, Math.min(s.gw, s.gh) * 0.18)
      const steps = Math.max(24, Math.round(2 * Math.PI * rr))
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * 2 * Math.PI
        const gx = Math.round(s.cx + rr * Math.cos(a))
        const gy = Math.round(s.cy + rr * Math.sin(a))
        if (inBounds(s, gx, gy) && !occupied(s, gx, gy)) freeze(s, gx, gy)
      }
      break
    }
    case 'line': {
      // Half-width keyed to the SHORTER dimension: the "filled" test is radius-based
      // (maxR ≥ min(gw,gh)·FILL_FRAC), and a bar of half-width gw·0.32 already exceeds
      // that on any ≥16:9 grid → instant-fill, no spires. Keying to min(gw,gh) keeps the
      // seed radius safely below the fill threshold so the bilateral spires can grow in.
      const half = Math.round(Math.min(s.gw, s.gh) * 0.32)
      for (let gx = cx - half; gx <= cx + half; gx++) {
        if (inBounds(s, gx, cy) && !occupied(s, gx, cy)) freeze(s, gx, cy)
      }
      break
    }
    default: // point
      freeze(s, cx, cy)
  }
}

export function createState(cfg: DLAConfig, w: number, h: number): DLAState {
  const gw = Math.max(8, Math.floor(w / CELL_PX))
  const gh = Math.max(8, Math.floor(h / CELL_PX))
  const ages = new Int32Array(gw * gh).fill(-1)
  const s: DLAState = {
    cfg, w, h, gw, gh,
    cx: gw / 2, cy: gh / 2,
    ages, count: 0, maxR: 1,
    period: Math.max(80, (gw * gh * EST_FILL_FRAC) / Math.max(1, cfg.bands)),
    filled: false, filledMs: 0,
    rng: mulberry32(cfg.seed),
    wx: 0, wy: 0, wsteps: 0, hasWalker: false,
    budget: 0,
    fresh: [],
    needsFullRedraw: true,
  }
  seedCluster(s)
  return s
}

/** Spawn a walker on the birth circle (clamped inside the grid). */
function spawn(s: DLAState): void {
  const birthR = s.maxR + BIRTH_MARGIN
  const a = s.rng() * 2 * Math.PI
  s.wx = Math.max(1, Math.min(s.gw - 2, Math.round(s.cx + birthR * Math.cos(a))))
  s.wy = Math.max(1, Math.min(s.gh - 2, Math.round(s.cy + birthR * Math.sin(a))))
  s.wsteps = 0
  s.hasWalker = true
}

/** Advance the current walker one macro-step. Returns true if it froze. */
function stepWalker(s: DLAState): boolean {
  const d = Math.hypot(s.wx - s.cx, s.wy - s.cy)
  const killR = s.maxR * 2 + 80
  if (d > killR || s.wsteps > WALKER_STEP_CAP) { spawn(s); return false }

  // adaptive long-jump: the whole cluster lies within maxR of the centre, so a
  // walker at distance d can leap (d - maxR - 2) in ANY direction and still not
  // cross into the frozen mass. Far away → jump; near the surface → fine walk.
  const gap = Math.floor(d - s.maxR - 2)
  if (gap >= 2) {
    const a = s.rng() * 2 * Math.PI
    s.wx = Math.max(1, Math.min(s.gw - 2, s.wx + Math.round(gap * Math.cos(a))))
    s.wy = Math.max(1, Math.min(s.gh - 2, s.wy + Math.round(gap * Math.sin(a))))
    s.wsteps++
    return false
  }

  // fine step: unit move biased by drift (downward). If the target cell is frozen,
  // stick where we are (with stickProb); otherwise walk onto it.
  const drift = s.cfg.driftBias * 0.9
  const ang = s.rng() * 2 * Math.PI
  const sx = Math.cos(ang)
  const sy = Math.sin(ang) + drift
  let dx = sx > 0.33 ? 1 : sx < -0.33 ? -1 : 0
  let dy = sy > 0.33 ? 1 : sy < -0.33 ? -1 : 0
  if (dx === 0 && dy === 0) { if (Math.abs(sx) > Math.abs(sy)) dx = sx >= 0 ? 1 : -1; else dy = sy >= 0 ? 1 : -1 }
  const nx = s.wx + dx, ny = s.wy + dy
  s.wsteps++

  if (occupied(s, nx, ny)) {
    if (s.rng() < s.cfg.stickProb) {
      freeze(s, s.wx, s.wy)
      s.hasWalker = false
      return true
    }
    return false // bounced — try a new direction next step
  }
  if (inBounds(s, nx, ny)) { s.wx = nx; s.wy = ny }
  else spawn(s) // wandered off the grid — respawn on the birth circle
  return false
}

/** Advance the sim by dt ms, freezing up to (speed·dt) particles this frame. */
export function advance(s: DLAState, dt: number): void {
  if (s.filled) { s.filledMs += dt; return }
  s.budget += (s.cfg.speed * dt) / 1000
  let target = Math.floor(s.budget)
  s.budget -= target
  let frozen = 0
  let steps = 0
  while (frozen < target && steps < MAX_STEPS_PER_FRAME) {
    if (!s.hasWalker) spawn(s)
    if (stepWalker(s)) frozen++
    steps++
  }
  // couldn't keep up: carry the debt, but cap it at ~1s of growth so a perpetually
  // step-capped regime (e.g. very low stickProb) can't accumulate unbounded budget.
  if (frozen < target) s.budget = Math.min(s.budget + (target - frozen), s.cfg.speed)
  if (s.maxR >= Math.min(s.gw, s.gh) * FILL_FRAC) s.filled = true
}

/** Live-apply the config knobs that don't require rebuilding the cluster. Returns
 *  false when the change is structural (seed / seedType) so the framework re-setups. */
export function applyConfig(s: DLAState, cfg: DLAConfig): boolean {
  if (cfg.seed !== s.cfg.seed || cfg.seedType !== s.cfg.seedType) return false
  // background is composited live every frame (never baked), so it needs no rebake.
  const appearance =
    cfg.colorByAge !== s.cfg.colorByAge ||
    cfg.bands !== s.cfg.bands ||
    cfg.particleSize !== s.cfg.particleSize ||
    cfg.colors.join() !== s.cfg.colors.join()
  s.cfg = cfg
  s.period = Math.max(80, (s.gw * s.gh * EST_FILL_FRAC) / Math.max(1, cfg.bands))
  if (appearance) s.needsFullRedraw = true
  return true
}
