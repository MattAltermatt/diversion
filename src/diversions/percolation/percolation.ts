import { mulberry32 } from '../../framework/rng'
import type { PercolationConfig } from './schema'

// ─── Site percolation on a square lattice ────────────────────────────────────
// Each site carries a fixed uniform threshold u ∈ [0,1) (the "landscape"); a site
// is OPEN iff u < p. Sweeping p is therefore a rising tide over a frozen landscape:
// as p grows, sites turn on MONOTONICALLY and coherently (never flickering), and the
// connected clusters of open sites merge until — right at p_c ≈ 0.5927 — a lacy
// fractal cluster abruptly bridges the whole grid. This monotone coupling is what
// makes the phase transition read as one continuous, watchable event instead of
// re-rolled noise. Framework-agnostic: no DOM, so the labelling is unit-testable.

/** Site-percolation critical probability, square lattice (Newman–Ziff). */
export const P_C = 0.5927

// Phase 0→1 (one full up+down breath) takes BASE_CYCLE_SEC at sweepSpeed = 1.
const BASE_CYCLE_SEC = 30

export interface PercolationState {
  cfg: PercolationConfig
  w: number // CSS px
  h: number
  gw: number // lattice columns
  gh: number // lattice rows
  thresh: Float32Array // per-site uniform threshold (the frozen landscape)
  open: Uint8Array // per-site open flag at the current p
  parent: Int32Array // union-find (root = minimum site index in the cluster)
  root: Int32Array // per-site → its cluster root; -1 when closed
  size: Int32Array // cluster size, valid at root indices
  isSpan: Uint8Array // 1 where the site belongs to a top↔bottom spanning cluster
  spanRoots: Set<number> // roots of the spanning clusters
  topRoots: Set<number> // scratch: roots present on the top row
  p: number // current density
  phase: number // sweep phase 0..1 (triangle wave)
  landscapeIndex: number // advances each reseed → a fresh landscape per loop
  rng: () => number
  clusterCount: number
  largestRoot: number
  largestSize: number
  spanCount: number // open sites in a spanning cluster (0 ⇒ no spanning cluster)
  lastLabelP: number
  needsRepaint: boolean
}

function find(parent: Int32Array, i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]] // path-halving
    i = parent[i]
  }
  return i
}

/** Union keeping the SMALLER site index as root — so a cluster's root is the
 *  minimum index it contains. Deterministic and stable under merges (colouring
 *  keyed on the root then follows the older/dominant cluster). */
function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a)
  const rb = find(parent, b)
  if (ra === rb) return
  if (ra < rb) parent[rb] = ra
  else parent[ra] = rb
}

/** Fill the landscape (fixed thresholds) deterministically from seed + landscape
 *  index. p is unchanged, so the tide keeps rising over the new terrain. */
function generateLandscape(s: PercolationState): void {
  const rng = mulberry32(((s.cfg.seed | 0) + Math.imul(s.landscapeIndex, 0x9e3779b1)) >>> 0)
  const t = s.thresh
  for (let i = 0; i < t.length; i++) t[i] = rng()
  s.lastLabelP = -1 // force a relabel
}

export function createState(cfg: PercolationConfig, w: number, h: number): PercolationState {
  const gw = Math.max(8, Math.floor(w / cfg.cellSize))
  const gh = Math.max(8, Math.floor(h / cfg.cellSize))
  const n = gw * gh
  const s: PercolationState = {
    cfg, w, h, gw, gh,
    thresh: new Float32Array(n),
    open: new Uint8Array(n),
    parent: new Int32Array(n),
    root: new Int32Array(n),
    size: new Int32Array(n),
    isSpan: new Uint8Array(n),
    spanRoots: new Set(),
    topRoots: new Set(),
    p: cfg.sweepMode === 'manual' ? cfg.p : cfg.pMin,
    phase: 0,
    landscapeIndex: 0,
    rng: mulberry32((cfg.seed | 0) >>> 0),
    clusterCount: 0,
    largestRoot: -1,
    largestSize: 0,
    spanCount: 0,
    lastLabelP: -1,
    needsRepaint: true,
  }
  generateLandscape(s)
  labelState(s)
  return s
}

/** Triangle wave: 0→1→0 as phase runs 0→0.5→1. */
function triangle(x: number): number {
  return 1 - Math.abs(2 * x - 1)
}

/** Label every cluster (union-find), detect the top↔bottom spanning cluster(s),
 *  and record cluster statistics. Pure over (thresh, p) — the determinism keystone. */
export function labelState(s: PercolationState): void {
  const { gw, gh, thresh, open, parent, root, size } = s
  const n = gw * gh
  const p = s.p
  for (let i = 0; i < n; i++) {
    open[i] = thresh[i] < p ? 1 : 0
    parent[i] = i
  }
  // Union each open site with its open left / up neighbour (4-connectivity).
  for (let gy = 0; gy < gh; gy++) {
    const rowOff = gy * gw
    for (let gx = 0; gx < gw; gx++) {
      const i = rowOff + gx
      if (!open[i]) continue
      if (gx > 0 && open[i - 1]) union(parent, i, i - 1)
      if (gy > 0 && open[i - gw]) union(parent, i, i - gw)
    }
  }
  // Resolve roots + sizes.
  size.fill(0)
  let clusterCount = 0
  let largestRoot = -1
  let largestSize = 0
  for (let i = 0; i < n; i++) {
    if (!open[i]) { root[i] = -1; continue }
    const r = find(parent, i)
    root[i] = r
    const c = ++size[r]
    if (r === i) clusterCount++ // first time we see this root's own cell
    if (c > largestSize) { largestSize = c; largestRoot = r }
  }
  // Spanning: a root present on BOTH the top row and the bottom row bridges the grid.
  const { topRoots, spanRoots } = s
  topRoots.clear()
  spanRoots.clear()
  for (let gx = 0; gx < gw; gx++) {
    if (open[gx]) topRoots.add(root[gx])
  }
  const bottomOff = (gh - 1) * gw
  for (let gx = 0; gx < gw; gx++) {
    const i = bottomOff + gx
    if (open[i] && topRoots.has(root[i])) spanRoots.add(root[i])
  }
  // Mark spanning sites.
  const { isSpan } = s
  let spanCount = 0
  if (spanRoots.size === 0) {
    isSpan.fill(0)
  } else {
    for (let i = 0; i < n; i++) {
      const on = open[i] && spanRoots.has(root[i]) ? 1 : 0
      isSpan[i] = on
      spanCount += on
    }
  }
  s.clusterCount = clusterCount
  s.largestRoot = largestRoot
  s.largestSize = largestSize
  s.spanCount = spanCount
  s.lastLabelP = p
  s.needsRepaint = true
}

/** Advance the sweep by dt ms and relabel if the density changed. */
export function advance(s: PercolationState, dt: number): void {
  if (s.cfg.sweepMode === 'manual') {
    s.p = s.cfg.p
  } else {
    const vel = (s.cfg.sweepSpeed / BASE_CYCLE_SEC) * (dt / 1000)
    let ph = s.phase + vel
    if (ph >= 1) {
      // Completed a full breath at the bottom of the sweep — roll a fresh landscape
      // so the screensaver never loops the exact same crystallization.
      ph -= Math.floor(ph)
      s.landscapeIndex++
      generateLandscape(s)
    }
    s.phase = ph
    s.p = s.cfg.pMin + (s.cfg.pMax - s.cfg.pMin) * triangle(ph)
  }
  if (s.p !== s.lastLabelP) labelState(s)
}

/** Live-apply a config edit. Returns false for structural changes (grid resolution
 *  or seed) so the framework re-runs setup(); true when applied in place. */
export function applyConfig(s: PercolationState, cfg: PercolationConfig): boolean {
  const gw = Math.max(8, Math.floor(s.w / cfg.cellSize))
  const gh = Math.max(8, Math.floor(s.h / cfg.cellSize))
  if (gw !== s.gw || gh !== s.gh || (cfg.seed | 0) !== (s.cfg.seed | 0)) return false
  const wasManual = s.cfg.sweepMode === 'manual'
  s.cfg = cfg
  // Re-evaluate p immediately so a mode / manual-p / range edit shows at once.
  if (cfg.sweepMode === 'manual') {
    s.p = cfg.p
  } else if (wasManual) {
    // switched sweep→manual→sweep etc.: recompute from the live phase
    s.p = cfg.pMin + (cfg.pMax - cfg.pMin) * triangle(s.phase)
  }
  if (s.p !== s.lastLabelP) labelState(s)
  s.needsRepaint = true
  return true
}
