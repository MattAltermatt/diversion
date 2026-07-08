import { mulberry32 } from '../../framework/rng'
import type { VermiculateConfig } from './schema'
import { makeTurtle, stepTurtle, type Segment, type StepCfg, type Turtle } from './turtle'

// ─── Vermiculate simulation ──────────────────────────────────────────────────
// Multiple turtles crawl a toroidal plane (edges wrap — mirrors the original
// hack's wraparound), each turning by a rate that itself random-walks (see
// turtle.ts). Instead of literal pixel-buffer collision tests (the C original's
// xrec/yrec loop-closure check), density is tracked on a coarse occupancy grid:
// a worm that keeps landing on already-well-trodden ground accumulates a "stuck"
// streak and respawns at a fresh (least-dense-of-K-candidates) spot — the same
// "wander until boxed in, then relocate" behavior, without per-pixel bookkeeping.
// Once the grid crosses a fill fraction, the piece holds briefly then asks the
// framework to reseed (shouldRestart) — the same grow → hold → reseed screensaver
// loop as dla/vines.

export const GRID_CELL = 6 // px — coarse occupancy grid resolution
const STUCK_DENSITY = 3 // visits before a cell counts as "already trodden"
const STUCK_STREAK_LIMIT = 16 // consecutive dense landings before a worm relocates
const RESPAWN_CANDIDATES = 10 // random spots sampled; least-dense wins
const FILL_FRACTION = 0.9 // occupancy fraction that flags the plane as "filled"
const FILL_HOLD_MS = 3000 // hold the finished tangle before reseeding
const MAX_STEPS_PER_FRAME = 400 // hard ceiling so a stalled/backgrounded tab can't burst

export interface DrawSeg extends Segment {
  u: number // 0..1 palette position for this segment
}

export interface VermiculateState {
  cfg: VermiculateConfig
  w: number
  h: number
  rng: () => number
  turtles: Turtle[]
  colorOffset: number[] // per-turtle palette phase offset (0..1), parallel to turtles
  grid: Uint16Array // occupancy visit counts, gw × gh
  gw: number
  gh: number
  filledCells: number
  totalCells: number
  filled: boolean
  filledMs: number
  stepBudget: number // fractional steps carried across frames (frame-rate independence)
  fresh: DrawSeg[] // segments drawn since the last render() call; render drains it
}

function wrap(v: number, max: number): number {
  const r = v % max
  return r < 0 ? r + max : r
}

function gridIndex(s: VermiculateState, x: number, y: number): number {
  const gx = Math.min(s.gw - 1, Math.max(0, Math.floor(x / GRID_CELL)))
  const gy = Math.min(s.gh - 1, Math.max(0, Math.floor(y / GRID_CELL)))
  return gy * s.gw + gx
}

function densityAt(s: VermiculateState, x: number, y: number): number {
  return s.grid[gridIndex(s, x, y)]
}

function markVisited(s: VermiculateState, x: number, y: number): void {
  const idx = gridIndex(s, x, y)
  if (s.grid[idx] === 0) s.filledCells++
  if (s.grid[idx] < 65535) s.grid[idx]++
}

/** Place (or relocate) a turtle at the least-dense of K random candidate spots —
 *  a cheap Poisson-ish scatter that steers respawns toward open ground instead of
 *  reseeding directly on top of an already-dense tangle. */
function respawn(s: VermiculateState, t: Turtle): void {
  let bestX = s.rng() * s.w
  let bestY = s.rng() * s.h
  let bestDensity = densityAt(s, bestX, bestY)
  for (let i = 1; i < RESPAWN_CANDIDATES; i++) {
    const cx = s.rng() * s.w
    const cy = s.rng() * s.h
    const d = densityAt(s, cx, cy)
    if (d < bestDensity) {
      bestDensity = d
      bestX = cx
      bestY = cy
    }
  }
  t.x = bestX
  t.y = bestY
  t.heading = s.rng() * Math.PI * 2
  t.turnVel = 0
  t.pathDist = 0
  t.stuckStreak = 0
}

export function createState(cfg: VermiculateConfig, w: number, h: number): VermiculateState {
  const rng = mulberry32(cfg.seed)
  const gw = Math.max(1, Math.ceil(w / GRID_CELL))
  const gh = Math.max(1, Math.ceil(h / GRID_CELL))
  const s: VermiculateState = {
    cfg, w, h, rng,
    turtles: [],
    colorOffset: [],
    grid: new Uint16Array(gw * gh),
    gw, gh,
    filledCells: 0,
    totalCells: gw * gh,
    filled: false,
    filledMs: 0,
    stepBudget: 0,
    fresh: [],
  }
  for (let i = 0; i < cfg.worms; i++) {
    const t = makeTurtle()
    respawn(s, t) // grid is empty here, so this is just a uniform random placement
    s.turtles.push(t)
    s.colorOffset.push(rng())
  }
  return s
}

function stepCfgFor(cfg: VermiculateConfig): StepCfg {
  return {
    stepSize: cfg.stepSize,
    turnJitter: (cfg.wander * Math.PI) / 180,
    turnClamp: (cfg.curlLimit * Math.PI) / 180,
  }
}

/** Advance the sim by dt ms: run `speed` discrete steps per second, across every
 *  worm, until the plane fills. Frame-rate independent via a carried fractional
 *  step budget (mirrors dla.ts / squiral.ts). */
export function advance(s: VermiculateState, dt: number): void {
  if (s.filled) {
    s.filledMs += dt
    return
  }
  const stepCfg = stepCfgFor(s.cfg)
  s.stepBudget += (s.cfg.speed * dt) / 1000
  let steps = Math.floor(s.stepBudget)
  s.stepBudget -= steps
  if (steps > MAX_STEPS_PER_FRAME) {
    s.stepBudget = 0 // drop the debt rather than burst-catch-up after a stall
    steps = MAX_STEPS_PER_FRAME
  }
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < s.turtles.length; i++) {
      const t = s.turtles[i]
      const seg = stepTurtle(t, stepCfg, s.rng)
      t.x = wrap(t.x, s.w)
      t.y = wrap(t.y, s.h)
      const density = densityAt(s, t.x, t.y)
      markVisited(s, t.x, t.y)
      t.stuckStreak = density >= STUCK_DENSITY ? t.stuckStreak + 1 : 0
      if (t.stuckStreak > STUCK_STREAK_LIMIT) respawn(s, t)
      const cycle = Math.max(1, s.cfg.hueCycleLength)
      const u = (((t.pathDist / cycle) + s.colorOffset[i]) % 1 + 1) % 1
      s.fresh.push({ x0: seg.x0, y0: seg.y0, x1: seg.x1, y1: seg.y1, u })
    }
    if (s.filledCells / s.totalCells >= FILL_FRACTION) {
      s.filled = true
      break
    }
  }
}

export function shouldReseed(s: VermiculateState): boolean {
  return s.filled && s.filledMs >= FILL_HOLD_MS
}

/** Live-apply a config edit. Only `seed` requires a full rebuild (it reseeds the
 *  rng stream + initial placement); everything else — including `worms`, which
 *  adds/removes turtles in place — applies without disturbing the existing tangle. */
export function applyConfig(s: VermiculateState, cfg: VermiculateConfig): boolean {
  if (cfg.seed !== s.cfg.seed) return false
  if (cfg.worms !== s.turtles.length) {
    if (cfg.worms > s.turtles.length) {
      for (let i = s.turtles.length; i < cfg.worms; i++) {
        const t = makeTurtle()
        respawn(s, t)
        s.turtles.push(t)
        s.colorOffset.push(s.rng())
      }
    } else {
      s.turtles.length = cfg.worms
      s.colorOffset.length = cfg.worms
    }
  }
  s.cfg = cfg
  return true
}
