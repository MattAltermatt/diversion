import { mulberry32 } from '../../framework/rng'
import type { BoxfitConfig } from './schema'

// ─── Boxfit — space-filling packing ─────────────────────────────────────────
// Repeatedly drop a tiny shape on an EMPTY point and grow it (swelling its size
// each frame) until, one growth step before it would touch a frozen neighbour or
// the edge, it freezes. Big shapes claim the open plains; tiny ones fill the
// cracks. A uniform boolean collision test (box/circle/mixed) run against a
// spatial hash keeps it O(1)-ish as the plane fills, and — because a shape only
// ever COMMITS a non-colliding size — no two frozen shapes ever overlap (the gap
// is baked into the test, so it's respected too). Framework-agnostic: no DOM, so
// the whole packing is unit-testable and deterministic from the seed.

const SEED_HALF = 2 // px: the size a shape spawns at
const BUCKET = 48 // px: spatial-hash bucket size
const SPAWN_TRIES = 26 // candidate empty points probed per spawn before giving up
const STALL_LIMIT_MS = 500 // no-room-to-spawn + nothing growing this long → filled
const MIN_SHAPES_BEFORE_FILL = 24 // never declare "full" before this many are placed

export interface Shape {
  box: boolean // true = box, false = circle
  cx: number // centre, CSS px (fixed at spawn)
  cy: number
  half: number // size scalar: box half-height = half, half-width = half*ar; circle radius = half
  ar: number // box aspect ratio (width/height); ignored for circles
  colorT: number // 0..1 palette position (fixed for palette-cycle / random)
  order: number // spawn index (for palette-cycle)
}

export interface BoxfitState {
  cfg: BoxfitConfig
  w: number // CSS px
  h: number
  minDim: number
  maxHalf: number // px ceiling on any shape's half (from cfg.maxSize)
  shapes: Shape[] // frozen
  growing: Shape[]
  hash: Map<number, number[]> // bucket key → indices into `shapes`
  cols: number
  coverage: number // frozen area / canvas area (approximate)
  rng: () => number
  budget: number // fractional spawn budget carried across frames
  stalledMs: number
  filled: boolean
  filledMs: number
  // render hand-off: frozen THIS frame (drained by render); full redraw flag
  fresh: Shape[]
  needsFullRedraw: boolean
}

const bucketKey = (s: BoxfitState, bx: number, by: number) => by * s.cols + bx

/** Half-extents (px) of a shape at a given half-size. Circles are square-bounded. */
function extents(sh: Shape, half: number): [number, number] {
  return sh.box ? [half * sh.ar, half] : [half, half]
}

/** Do A (at half aH) and B (at half bH) come within `gap` of each other? Uniform
 *  over box/circle/mixed. Overlap ⇒ true (they'd be closer than gap). */
function overlaps(a: Shape, aH: number, b: Shape, bH: number, gap: number): boolean {
  const dx = Math.abs(a.cx - b.cx)
  const dy = Math.abs(a.cy - b.cy)
  const [ahw, ahh] = extents(a, aH)
  const [bhw, bhh] = extents(b, bH)
  if (a.box && b.box) {
    return dx < ahw + bhw + gap && dy < ahh + bhh + gap
  }
  if (!a.box && !b.box) {
    const rr = aH + bH + gap
    return dx * dx + dy * dy < rr * rr
  }
  // box ⇄ circle: closest point on the box to the circle centre.
  const box = a.box ? a : b
  const boxH = a.box ? aH : bH
  const circR = a.box ? bH : aH
  const [bxw, bxh] = extents(box, boxH)
  const qx = Math.max(dx - bxw, 0)
  const qy = Math.max(dy - bxh, 0)
  const rr = circR + gap
  return qx * qx + qy * qy < rr * rr
}

/** Register a frozen shape (index `i`) into every bucket its AABB touches. */
function addToHash(s: BoxfitState, sh: Shape, i: number): void {
  const [hw, hh] = extents(sh, sh.half)
  const bx0 = Math.floor((sh.cx - hw) / BUCKET)
  const bx1 = Math.floor((sh.cx + hw) / BUCKET)
  const by0 = Math.floor((sh.cy - hh) / BUCKET)
  const by1 = Math.floor((sh.cy + hh) / BUCKET)
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const key = bucketKey(s, bx, by)
      let list = s.hash.get(key)
      if (!list) { list = []; s.hash.set(key, list) }
      list.push(i)
    }
  }
}

/** Frozen-shape indices whose bucket overlaps a probe AABB (deduped). */
function queryNear(s: BoxfitState, cx: number, cy: number, hw: number, hh: number): number[] {
  const bx0 = Math.floor((cx - hw) / BUCKET)
  const bx1 = Math.floor((cx + hw) / BUCKET)
  const by0 = Math.floor((cy - hh) / BUCKET)
  const by1 = Math.floor((cy + hh) / BUCKET)
  const seen = new Set<number>()
  for (let by = by0; by <= by1; by++) {
    for (let bx = bx0; bx <= bx1; bx++) {
      const list = s.hash.get(bucketKey(s, bx, by))
      if (list) for (const i of list) seen.add(i)
    }
  }
  return [...seen]
}

/** Would `sh` at half `nh` collide with the edge, a frozen neighbour, or another
 *  growing shape (respecting the gap)? */
function blocked(s: BoxfitState, sh: Shape, nh: number): boolean {
  const [hw, hh] = extents(sh, nh)
  const g = s.cfg.gap
  // edge (grout is kept from the border too)
  if (sh.cx - hw < g || sh.cx + hw > s.w - g || sh.cy - hh < g || sh.cy + hh > s.h - g) return true
  // frozen neighbours via the spatial hash
  const near = queryNear(s, sh.cx, sh.cy, hw + g, hh + g)
  for (const i of near) {
    if (overlaps(sh, nh, s.shapes[i], s.shapes[i].half, g)) return true
  }
  // other growing shapes (small set)
  for (const other of s.growing) {
    if (other !== sh && overlaps(sh, nh, other, other.half, g)) return true
  }
  return false
}

function freeze(s: BoxfitState, sh: Shape): void {
  const i = s.shapes.length
  s.shapes.push(sh)
  addToHash(s, sh, i)
  s.fresh.push(sh)
  const [hw, hh] = extents(sh, sh.half)
  s.coverage += (4 * hw * hh) / (s.w * s.h)
}

/** Try to drop a new tiny shape on an empty point. Returns true on success. */
function trySpawn(s: BoxfitState): boolean {
  const g = s.cfg.gap
  const box = s.cfg.shape === 'boxes' || (s.cfg.shape === 'mixed' && s.rng() < 0.5)
  // aspect ratio for boxes: 1..2.4, half the time portrait — Mondrian variety.
  let ar = 1 + s.rng() * 1.4
  if (s.rng() < 0.5) ar = 1 / ar
  for (let t = 0; t < SPAWN_TRIES; t++) {
    const cx = g + SEED_HALF + s.rng() * (s.w - 2 * (g + SEED_HALF))
    const cy = g + SEED_HALF + s.rng() * (s.h - 2 * (g + SEED_HALF))
    const probe: Shape = {
      box, cx, cy, half: SEED_HALF, ar,
      colorT: s.rng(), order: s.shapes.length + s.growing.length,
    }
    if (!blocked(s, probe, SEED_HALF)) {
      // palette-cycle sweeps hue slowly with spawn order; random keeps colorT.
      if (s.cfg.colorMode === 'palette-cycle') probe.colorT = (probe.order * 0.137) % 1
      s.growing.push(probe)
      return true
    }
  }
  return false
}

export function createState(cfg: BoxfitConfig, w: number, h: number): BoxfitState {
  const minDim = Math.min(w, h)
  const s: BoxfitState = {
    cfg, w, h, minDim,
    maxHalf: cfg.maxSize * minDim,
    shapes: [], growing: [], hash: new Map(),
    cols: Math.max(1, Math.ceil(w / BUCKET)),
    coverage: 0,
    rng: mulberry32(cfg.seed),
    budget: 0, stalledMs: 0, filled: false, filledMs: 0,
    fresh: [], needsFullRedraw: true,
  }
  // Seed a few shapes so the first frame isn't blank.
  for (let i = 0; i < 3; i++) trySpawn(s)
  return s
}

/** Advance the packing by dt ms: grow every live shape, then spawn to budget. */
export function advance(s: BoxfitState, dt: number): void {
  if (s.filled) { s.filledMs += dt; return }

  // ── grow ──
  const delta = (s.cfg.growthSpeed * dt) / 1000
  const survivors: Shape[] = []
  for (const sh of s.growing) {
    const nh = sh.half + delta
    if (nh >= s.maxHalf || blocked(s, sh, nh)) freeze(s, sh)
    else { sh.half = nh; survivors.push(sh) }
  }
  s.growing = survivors

  // ── spawn ──
  s.budget += (s.cfg.spawnRate * dt) / 1000
  let placedAny = false
  let roomRanOut = false
  while (s.budget >= 1 && s.growing.length < s.cfg.maxConcurrent) {
    s.budget -= 1
    if (trySpawn(s)) placedAny = true
    else { roomRanOut = true; break }
  }

  // ── fill detection ── the plane is "full" once nothing is growing and we
  // repeatedly can't find room to drop a new shape.
  if (s.growing.length === 0 && roomRanOut && !placedAny && s.shapes.length >= MIN_SHAPES_BEFORE_FILL) {
    s.stalledMs += dt
    if (s.stalledMs >= STALL_LIMIT_MS) s.filled = true
  } else if (placedAny || s.growing.length > 0) {
    s.stalledMs = 0
  }
  // never let unfillable budget accumulate unbounded
  if (roomRanOut) s.budget = Math.min(s.budget, s.cfg.spawnRate)
}

/** Live-apply the knobs that don't require repacking. Returns false for a
 *  structural change (shape / seed) so the framework re-runs setup(). */
export function applyConfig(s: BoxfitState, cfg: BoxfitConfig): boolean {
  if (cfg.shape !== s.cfg.shape || cfg.seed !== s.cfg.seed) return false
  const recolor =
    cfg.colorMode !== s.cfg.colorMode || cfg.colors.join() !== s.cfg.colors.join()
  s.cfg = cfg
  s.maxHalf = cfg.maxSize * s.minDim
  if (recolor) s.needsFullRedraw = true
  return true
}
