import { mulberry32 } from '../../framework/rng'
import type { ChemicalGardenConfig } from './schema'

// ─── Buoyant burst-branching tube-tips ──────────────────────────────────────
// Unlike Vines (whole L-system precomputed once, then progressively revealed),
// a chemical garden grows in REAL TIME: a budget of growth steps is spent each
// frame across all active tips (mirrors DLA's `advance` budget-per-frame walker
// loop), each step emitting one short, finished Segment that's baked once into
// an accumulation buffer (render.ts) — never redrawn wholesale. `stepTip` and
// the seed/salt assignment are pure + deterministic from the config's seed, so
// they're directly unit-testable without any frame timing.
//
// Segment shape mirrors Vines' {x0,y0,x1,y1,dStart,dEnd,depth,tip} plus one
// extra field (`seedIdx`) so a segment's whole subtree colours from its own
// seed crystal's salt, not a single global palette.

export interface Segment {
  x0: number
  y0: number
  x1: number
  y1: number
  dStart: number // path length from this tip's seed crystal
  dEnd: number
  depth: number // branch generation (0 = the stem straight off the crystal)
  tip: boolean // true once this segment ends a terminated tip (top/side bound or max length)
  seedIdx: number // which seed crystal (and thus which salt) this segment belongs to
}

export const SALTS = ['copper', 'iron', 'chrome', 'manganese'] as const
export type Salt = (typeof SALTS)[number]

// Dark mineral base → bright precipitate tip, one ramp per salt.
export const SALT_RAMPS: Record<Salt, string[]> = {
  copper: ['#0a2a3a', '#146b8c', '#3fc4e8', '#bdf3ff'],
  iron: ['#3a1408', '#8c3410', '#e8752f', '#ffd9a0'],
  chrome: ['#0c2a12', '#1f7a34', '#5fd97a', '#e3ffe0'],
  manganese: ['#210a2e', '#6a1f8c', '#b565e0', '#f2e0ff'],
}

export interface SeedCrystal {
  x: number
  y: number
  salt: Salt
}

export interface WorldBounds {
  minX: number
  maxX: number
  minY: number // negative — the top of the world, above the floor
  maxY: number // 0 — the floor
}

export interface GardenView {
  scale: number
  offsetX: number
  offsetY: number
}

export interface Tip {
  x: number
  y: number
  heading: number // radians; -PI/2 is straight up
  depth: number
  dist: number // path length since this tip's seed crystal
  seedIdx: number
}

export type Phase = 'growing' | 'settled' | 'fading'

export interface GardenState {
  cfg: ChemicalGardenConfig
  w: number // CSS px
  h: number
  bounds: WorldBounds
  seeds: SeedCrystal[]
  view: GardenView
  tips: Tip[] // active growing tips (FIFO — deterministic processing order)
  rng: () => number
  segmentCount: number
  bakedSegments: Segment[] // persistent source of truth for render.ts full rebuilds
  fresh: Segment[] // segments baked since the last render(), drained by render.ts
  budget: number // fractional growth-step budget carried across frames
  phase: Phase
  settledMs: number
  fadeMs: number
  t: number
  needsFullRedraw: boolean
}

// ─── World-space constants (a look/perf decision, mirrors vines/dla) ────────
const SEED_SPACING = 90 // world units between adjacent seed crystals along the floor
const SIDE_MARGIN = 140 // extra world-space margin either side of the seed line
const WORLD_HEIGHT = 640 // world units from the floor up to the top bound
export const COLOR_REF_DIST = WORLD_HEIGHT * 0.92 // path length at which a tube reads "fully bright"
const STEP_LEN = 8 // world units per growth step
const MAX_DEPTH = 6 // caps BRANCHING (not growth) — every tip still reaches the top;
// the true termination conditions are the world bounds and MAX_TIP_LEN below.
const MAX_TIP_LEN = WORLD_HEIGHT * 1.6 // per-tip path-length cap (world units)
const MAX_SEGMENTS = 5000 // perf ceiling, like Vines' MAX_SEGMENTS / DLA's grid
const BRANCH_ANGLE_DEG = 27 // half-angle divergence at a fork
const BRANCH_ANGLE_JITTER_DEG = 10
const BUOYANCY_MAX = 0.15 // rad/step pull-to-vertical coefficient at buoyancy = 1
const SETTLE_HOLD_MS = 5000 // hold the finished garden before it fades
const FADE_MS = 2600 // fade-out duration before reseeding
const DEG = Math.PI / 180
const TAU = Math.PI * 2
const UP = -Math.PI / 2

/** Wrap an angle to (-π, π]. */
function norm(a: number): number {
  let x = a
  while (x > Math.PI) x -= TAU
  while (x <= -Math.PI) x += TAU
  return x
}

// ─── Pure salt / seed-position assignment (independent of the growth RNG, so
// re-deriving on a live palette edit never disturbs already-grown geometry) ──

function saltPalette(cfg: ChemicalGardenConfig): Salt[] {
  switch (cfg.palette) {
    case 'copper':
      return ['copper']
    case 'ironManganese':
      return ['iron', 'manganese']
    case 'mono': {
      const rng = mulberry32((cfg.seed * 2654435761 + 0x9e3779b1) >>> 0)
      const i = Math.min(SALTS.length - 1, Math.floor(rng() * SALTS.length))
      return [SALTS[i]]
    }
    default:
      return [...SALTS]
  }
}

/** Per-seed salt assignment: round-robin across the config's allowed salts.
 *  Pure function of (seed, seeds, palette) — safe to re-derive on a live edit. */
export function assignSalts(cfg: ChemicalGardenConfig): Salt[] {
  const allowed = saltPalette(cfg)
  return Array.from({ length: cfg.seeds }, (_, i) => allowed[i % allowed.length])
}

/** Seed crystal x-positions + salts, deterministic from cfg alone (a dedicated
 *  RNG substream independent of the growth walk, so palette/geometry never
 *  cross-contaminate each other's determinism). All seeds sit on the floor (y=0). */
export function createSeeds(cfg: ChemicalGardenConfig): SeedCrystal[] {
  const n = cfg.seeds
  const salts = assignSalts(cfg)
  const posRng = mulberry32((cfg.seed * 1000003 + 7) >>> 0)
  const out: SeedCrystal[] = []
  for (let i = 0; i < n; i++) {
    const base = (i - (n - 1) / 2) * SEED_SPACING
    const jitter = (posRng() * 2 - 1) * SEED_SPACING * 0.18
    out.push({ x: base + jitter, y: 0, salt: salts[i] })
  }
  return out
}

export function computeWorldBounds(cfg: ChemicalGardenConfig): WorldBounds {
  const halfSpan = ((cfg.seeds - 1) / 2) * SEED_SPACING
  return {
    minX: -halfSpan - SIDE_MARGIN,
    maxX: halfSpan + SIDE_MARGIN,
    minY: -WORLD_HEIGHT,
    maxY: 0,
  }
}

/** Fit the (fixed, config-derived) world bounds into the canvas, floor-anchored. */
export function computeView(bounds: WorldBounds, w: number, h: number): GardenView {
  const bw = Math.max(1, bounds.maxX - bounds.minX)
  const bh = Math.max(1, bounds.maxY - bounds.minY)
  const bottomPad = h * 0.05
  const scale = Math.min((w * 0.86) / bw, (h * 0.9) / bh)
  const offsetX = w / 2 - (scale * (bounds.minX + bounds.maxX)) / 2
  const offsetY = h - bottomPad - scale * bounds.maxY // maxY = 0 → floor sits near the bottom
  return { scale, offsetX, offsetY }
}

// ─── The pure stochastic tip-walk step ──────────────────────────────────────

export interface StepResult {
  segment: Segment
  children: Tip[] // 0 = terminated, 1 = continues straight, 2 = forked
}

/** Advance one tip by a single growth step: steer (buoyancy + jitter), move,
 *  then decide termination (world bounds / max length) or a branch fork. Pure
 *  and deterministic given `rng` — the caller owns the RNG stream and its
 *  consumption order (GardenState processes tips FIFO for full determinism). */
export function stepTip(
  tip: Tip,
  cfg: ChemicalGardenConfig,
  bounds: WorldBounds,
  rng: () => number,
): StepResult {
  let heading = tip.heading + cfg.buoyancy * BUOYANCY_MAX * norm(UP - tip.heading)
  heading += (rng() * 2 - 1) * (cfg.wander * DEG)

  const x1 = tip.x + Math.cos(heading) * STEP_LEN
  const y1 = tip.y + Math.sin(heading) * STEP_LEN
  const dEnd = tip.dist + STEP_LEN
  const segment: Segment = {
    x0: tip.x, y0: tip.y, x1, y1,
    dStart: tip.dist, dEnd,
    depth: tip.depth, tip: false, seedIdx: tip.seedIdx,
  }

  const outOfBounds = y1 <= bounds.minY || x1 <= bounds.minX || x1 >= bounds.maxX
  const tooLong = dEnd >= MAX_TIP_LEN
  if (outOfBounds || tooLong) {
    segment.tip = true
    return { segment, children: [] }
  }

  if (tip.depth < MAX_DEPTH && rng() < cfg.branchRate) {
    const half = (BRANCH_ANGLE_DEG + (rng() * 2 - 1) * BRANCH_ANGLE_JITTER_DEG) * DEG
    return {
      segment,
      children: [
        { x: x1, y: y1, heading: heading - half, depth: tip.depth + 1, dist: dEnd, seedIdx: tip.seedIdx },
        { x: x1, y: y1, heading: heading + half, depth: tip.depth + 1, dist: dEnd, seedIdx: tip.seedIdx },
      ],
    }
  }

  return { segment, children: [{ x: x1, y: y1, heading, depth: tip.depth, dist: dEnd, seedIdx: tip.seedIdx }] }
}

// ─── Runtime state + lifecycle (grow in real time → settle → fade → reseed) ─

export function createGardenState(cfg: ChemicalGardenConfig, w: number, h: number): GardenState {
  const bounds = computeWorldBounds(cfg)
  const seeds = createSeeds(cfg)
  const rng = mulberry32((cfg.seed * 2246822519 + 12345) >>> 0)
  const tips: Tip[] = seeds.map((s, i) => ({
    x: s.x, y: s.y,
    heading: UP + (rng() * 2 - 1) * 0.12, // slight initial lean off vertical
    depth: 0, dist: 0, seedIdx: i,
  }))
  return {
    cfg, w, h, bounds, seeds,
    view: computeView(bounds, w, h),
    tips, rng,
    segmentCount: 0,
    bakedSegments: [],
    fresh: [],
    budget: 0,
    phase: 'growing', settledMs: 0, fadeMs: 0, t: 0,
    needsFullRedraw: true,
  }
}

/** Advance the sim by dt (ms): grow up to (growthSpeed·dt) steps this frame,
 *  each processing the oldest active tip (FIFO) so the same seed + dt sequence
 *  always reproduces the same garden. Growth stalls naturally once every tip
 *  has terminated (or the segment cap is hit) — either way the garden then
 *  settles, holds, fades, and the framework reseeds via shouldReseed. */
export function advanceGarden(state: GardenState, dt: number): void {
  state.t += dt
  if (state.phase === 'growing') {
    state.budget += (state.cfg.growthSpeed * dt) / 1000
    let steps = Math.floor(state.budget)
    state.budget -= steps
    while (steps > 0 && state.tips.length > 0 && state.segmentCount < MAX_SEGMENTS) {
      const tip = state.tips.shift()!
      const { segment, children } = stepTip(tip, state.cfg, state.bounds, state.rng)
      state.bakedSegments.push(segment)
      state.fresh.push(segment)
      state.segmentCount++
      for (const c of children) state.tips.push(c)
      steps--
    }
    if (state.tips.length === 0 || state.segmentCount >= MAX_SEGMENTS) {
      state.phase = 'settled'
      state.settledMs = 0
    }
  } else if (state.phase === 'settled') {
    state.settledMs += dt
    if (state.settledMs >= SETTLE_HOLD_MS) {
      state.phase = 'fading'
      state.fadeMs = 0
    }
  } else {
    state.fadeMs += dt
  }
}

/** 1 while growing/settled, ramps 1 → 0 during the fade. */
export function fadeAlpha(state: GardenState): number {
  if (state.phase !== 'fading') return 1
  return Math.max(0, 1 - state.fadeMs / FADE_MS)
}

/** True once the fade completes — the framework then reseeds a fresh garden. */
export function shouldReseed(state: GardenState): boolean {
  return state.phase === 'fading' && state.fadeMs >= FADE_MS
}

// Only the seed count and RNG seed require a full rebuild (they fix the seed
// crystals' positions and the growth walk). Buoyancy/branchRate/wander/
// growthSpeed/lineWidth/taper/glow/background all apply live: the growth loop
// and renderer read `state.cfg` fresh every step/frame. A palette edit keeps
// the already-grown geometry but reassigns each seed's salt and asks render.ts
// for a full rebake (mirrors DLA's colorByAge/bands live-appearance edits).
function needsRebuild(a: ChemicalGardenConfig, b: ChemicalGardenConfig): boolean {
  return a.seed !== b.seed || a.seeds !== b.seeds
}

export function updateGardenState(state: GardenState, cfg: ChemicalGardenConfig): boolean {
  if (needsRebuild(state.cfg, cfg)) return false
  const paletteChanged = cfg.palette !== state.cfg.palette
  state.cfg = cfg
  if (paletteChanged) {
    const salts = assignSalts(cfg)
    state.seeds = state.seeds.map((s, i) => ({ ...s, salt: salts[i] }))
    state.needsFullRedraw = true
  }
  return true
}
