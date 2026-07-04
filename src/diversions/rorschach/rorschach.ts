import { mulberry32 } from '../../framework/rng'
import type { RorschachConfig } from './schema'

// ─── Rorschach inkblot growth ────────────────────────────────────────────────
// Ink walkers wander a bounded region on ONE side of a central axis (the left half
// for bilateral symmetry, the top-left quadrant for quad) doing a correlated random
// walk, dropping a soft ink dot each hop. Every dot is deposited together with its
// mirror image(s) across the axis (and, for quad, the horizontal axis too), so the
// blot is EXACTLY symmetric by construction — for every mark there is a reflected
// mark. The walkers start on the seam so the mirrored halves fuse into one connected
// blot. The reachable radius grows with deposit count, so the ink visibly spreads
// outward. Lifecycle: grow → hold → fade → reseed, endlessly. Framework-agnostic (no
// DOM), so the walk is unit-testable.

const TAU = Math.PI * 2
const MARGIN_PX = 14
const GROW_BASE_MS = 5000 // grow duration at growthSpeed = 1
const FADE_MS = 2500 // dissolve duration
const TURN = 1.1 // heading jitter per hop (radians)
const MAX_DEPOSITS_PER_FRAME = 500 // guard so one frame never stalls on a huge dt

export type Phase = 'grow' | 'hold' | 'fade'

export interface Mark { x: number; y: number; r: number }
interface Walker { x: number; y: number; a: number }

export interface RorschachState {
  cfg: RorschachConfig
  w: number // CSS px
  h: number
  cx: number // blot centre (also the vertical mirror axis)
  cy: number // also the horizontal mirror axis for quad
  // generator region the walkers are confined to (reflected at these bounds)
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  maxReach: number // final reachable radius from centre (CSS px)
  dotR: number // ink-dot radius (CSS px)
  stepLen: number // walker hop length (CSS px)
  totalDeposits: number // generator dots in a finished blot (excl. mirrors)
  growMsTotal: number
  baseSeed: number
  gen: number // generation index (advances each reseed → fresh blot, still deterministic)
  rng: () => number
  walkers: Walker[]
  tick: number
  deposited: number
  phase: Phase
  growMs: number
  holdMs: number
  fadeMs: number
  alpha: number // fade opacity, 1 → 0
  marks: Mark[] // every mark in the current blot (incl. mirrors) — drives rebake + tests
  fresh: Mark[] // marks deposited since the last render (drained by render)
  needsClear: boolean // reseed / first frame: wipe the accumulation buffer
  needsFullRedraw: boolean // appearance edit: rebake all marks
}

const easeOut = (x: number) => 1 - (1 - x) * (1 - x)

function initWalkers(s: RorschachState): void {
  s.walkers = []
  s.tick = 0
  for (let i = 0; i < s.cfg.lobes; i++) {
    s.walkers.push({ x: s.cx, y: s.cy, a: (i / s.cfg.lobes) * TAU + s.rng() * 0.7 })
  }
}

export function createState(cfg: RorschachConfig, w: number, h: number): RorschachState {
  const cx = w / 2
  const cy = h / 2
  const quad = cfg.symmetry === 'quad'
  // Left-half (or top-left quadrant) generator region; walkers reflect off these.
  const xmin = MARGIN_PX
  const xmax = cx
  const ymin = MARGIN_PX
  const ymax = quad ? cy : h - MARGIN_PX
  const maxReach = cfg.blotSize * Math.max(8, Math.min(cx - MARGIN_PX, cy - MARGIN_PX))
  const dotR = Math.max(2.5, maxReach * 0.06)
  const totalDeposits = Math.max(200, Math.min(8000, Math.round((maxReach / dotR) ** 2 * 3.0)))
  const s: RorschachState = {
    cfg, w, h, cx, cy, xmin, xmax, ymin, ymax,
    maxReach, dotR,
    stepLen: dotR * (0.45 + cfg.spread * 1.1),
    totalDeposits,
    growMsTotal: GROW_BASE_MS / cfg.growthSpeed,
    baseSeed: cfg.seed >>> 0,
    gen: 0,
    rng: mulberry32(cfg.seed >>> 0),
    walkers: [],
    tick: 0,
    deposited: 0,
    phase: 'grow',
    growMs: 0,
    holdMs: 0,
    fadeMs: 0,
    alpha: 1,
    marks: [],
    fresh: [],
    needsClear: true,
    needsFullRedraw: false,
  }
  initWalkers(s)
  return s
}

/** Deposit one generator mark plus its exact mirror image(s). */
function depositAt(s: RorschachState, x: number, y: number, r: number): void {
  const push = (mx: number, my: number) => {
    const m = { x: mx, y: my, r }
    s.marks.push(m)
    s.fresh.push(m)
  }
  push(x, y)
  const rx = s.w - x // reflection across the vertical axis (x = w/2)
  push(rx, y)
  if (s.cfg.symmetry === 'quad') {
    const ry = s.h - y // reflection across the horizontal axis (y = h/2)
    push(x, ry)
    push(rx, ry)
  }
}

/** Advance one walker a hop (confined to its region + the current reach circle) and
 *  drop a mirrored ink dot. */
function stepDeposit(s: RorschachState): void {
  const wk = s.walkers[s.tick % s.walkers.length]
  s.tick++
  const localReach = s.maxReach * easeOut(s.deposited / s.totalDeposits)

  wk.a += (s.rng() - 0.5) * TURN
  wk.x += Math.cos(wk.a) * s.stepLen
  wk.y += Math.sin(wk.a) * s.stepLen

  // reflect off the generator-region walls (keeps the walk on one side of the axis)
  if (wk.x > s.xmax) { wk.x = 2 * s.xmax - wk.x; wk.a = Math.PI - wk.a }
  if (wk.x < s.xmin) { wk.x = 2 * s.xmin - wk.x; wk.a = Math.PI - wk.a }
  if (wk.y > s.ymax) { wk.y = 2 * s.ymax - wk.y; wk.a = -wk.a }
  if (wk.y < s.ymin) { wk.y = 2 * s.ymin - wk.y; wk.a = -wk.a }

  // confine within the (growing) reach circle so the blot spreads outward over time
  const dx = wk.x - s.cx
  const dy = wk.y - s.cy
  const d = Math.hypot(dx, dy)
  const rr = Math.max(1, localReach)
  if (d > rr) {
    wk.x = s.cx + (dx / d) * rr
    wk.y = s.cy + (dy / d) * rr
    wk.a += Math.PI * 0.75 // steer back inward
  }

  depositAt(s, wk.x, wk.y, s.dotR)
  s.deposited++
}

function reseed(s: RorschachState): void {
  s.gen++
  s.rng = mulberry32((s.baseSeed ^ Math.imul(s.gen, 0x9e3779b1)) >>> 0)
  s.marks.length = 0
  s.fresh.length = 0
  s.deposited = 0
  s.growMs = 0
  s.holdMs = 0
  s.fadeMs = 0
  s.alpha = 1
  s.phase = 'grow'
  s.needsClear = true
  initWalkers(s)
}

/** Advance the blot by dt ms through its grow → hold → fade → reseed lifecycle.
 *  The mark set is frame-rate independent: deposit count and each dot's reach are
 *  driven by the deposit index, not by wall-clock, so a given seed/size always
 *  produces the same blot regardless of dt granularity. */
export function advance(s: RorschachState, dt: number): void {
  if (s.phase === 'grow') {
    s.growMs += dt
    const frac = Math.min(1, s.growMs / s.growMsTotal)
    const target = Math.round(frac * s.totalDeposits)
    let guard = 0
    while (s.deposited < target && guard < MAX_DEPOSITS_PER_FRAME) { stepDeposit(s); guard++ }
    if (frac >= 1) {
      let g2 = 0
      const cap = s.totalDeposits + 10
      while (s.deposited < s.totalDeposits && g2 < cap) { stepDeposit(s); g2++ }
      s.phase = 'hold'
      s.holdMs = 0
    }
    return
  }
  if (s.phase === 'hold') {
    s.holdMs += dt
    if (s.holdMs >= s.cfg.holdSeconds * 1000) { s.phase = 'fade'; s.fadeMs = 0 }
    return
  }
  // fade
  s.fadeMs += dt
  s.alpha = Math.max(0, 1 - s.fadeMs / FADE_MS)
  if (s.fadeMs >= FADE_MS) reseed(s)
}

/** Live-apply config knobs that don't change the blot's structure. Returns false for
 *  a structural change (seed / symmetry / lobes / spread / size / growth speed) so the
 *  framework re-runs setup(). */
export function applyConfig(s: RorschachState, cfg: RorschachConfig): boolean {
  if (
    cfg.seed !== s.cfg.seed ||
    cfg.symmetry !== s.cfg.symmetry ||
    cfg.lobes !== s.cfg.lobes ||
    cfg.spread !== s.cfg.spread ||
    cfg.blotSize !== s.cfg.blotSize ||
    cfg.growthSpeed !== s.cfg.growthSpeed
  ) return false
  const rebake =
    cfg.blotColor !== s.cfg.blotColor ||
    cfg.accentColor !== s.cfg.accentColor ||
    cfg.edgeSoftness !== s.cfg.edgeSoftness ||
    cfg.twoTone !== s.cfg.twoTone
  s.cfg = cfg // background + holdSeconds apply live with no rebake
  if (rebake) s.needsFullRedraw = true
  return true
}

/** Run a fresh blot to the end of its grow phase and return the state (test helper). */
export function simulateBlot(cfg: RorschachConfig, w: number, h: number): RorschachState {
  const s = createState(cfg, w, h)
  let guard = 0
  while (s.phase === 'grow' && guard < 100000) { advance(s, 16); guard++ }
  return s
}
