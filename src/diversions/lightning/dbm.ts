import { mulberry32 } from '../../framework/rng'
import type { LightningConfig } from './schema'

// ─── Dielectric Breakdown Model, on-lattice ─────────────────────────────────
// Niemeyer–Pietronero–Wiesmann (1984). Laplace's equation ∇²φ = 0 is solved on a
// coarse grid with the growing bolt pinned at φ=0 and the far electrode at φ=1;
// each step the bolt extends to a boundary-adjacent empty cell chosen with
// probability ∝ (local field φ)^η. η is the branchiness exponent: ≈1 → a dense
// space-filling fern, ≈4 → a sparse jagged one-dimensional bolt.
//
// The whole thing is a state machine: GROW the leader until it touches the far
// electrode, FLASH the completed channel white, FADE it to an ember, then respawn
// a fresh leader — the unattended screensaver loop. Framework-agnostic (no DOM),
// so the growth is unit-testable.

// Boundary code per cell.
const FREE = 0 // dielectric — φ relaxes here
const GROUND = 1 // the far electrode, pinned at φ=1
const TREE = 2 // part of the bolt, pinned at φ=0

const TARGET_CELLS = 190 // grid cells along the long axis (bounds Laplace cost)
const INIT_SWEEPS = 60 // relaxation sweeps to settle the field before growth
const FRAME_SWEEPS = 8 // baseline relaxation sweeps per frame while growing
const STEP_SWEEPS = 2 // extra sweeps after each cell is added (field changed locally)
const OMEGA = 1.7 // SOR over-relaxation factor (1<ω<2 → faster convergence)
const EPS = 1e-6 // field floor so freshly-exposed candidates keep a nonzero weight
const FLASH_MS = 180 // white-flash duration on strike completion
const MAX_STEPS_PER_FRAME = 4000 // hard ceiling so one frame never stalls

export type Phase = 'growing' | 'flashing' | 'fading'

export interface DBMState {
  cfg: LightningConfig
  w: number // CSS px
  h: number
  cellPx: number
  gw: number // grid cells
  gh: number
  phi: Float32Array // potential field, gw*gh
  bc: Int8Array // FREE | GROUND | TREE
  parent: Int32Array // parent cell index for stroke drawing, -1 at the root
  order: Int32Array // arrival index, -1 if empty (drives the ember gradient / tip glow)
  count: number // cells in the current bolt
  cands: number[] // candidate cell indices (empty, tree-adjacent)
  inCand: Uint8Array // membership flag for O(1) dedup
  rng: () => number
  budget: number // fractional grow budget carried across frames
  phase: Phase
  phaseMs: number // ms elapsed in the current phase
  strikes: number // completed bolts (for variety / debugging)
}

const idx = (s: DBMState, gx: number, gy: number) => gy * s.gw + gx
const inB = (s: DBMState, gx: number, gy: number) =>
  gx >= 0 && gy >= 0 && gx < s.gw && gy < s.gh

// 8-connected growth: diagonals let the bolt fork at natural angles instead of
// the pure horizontal/vertical staircase a 4-neighbourhood produces (which reads
// as a circuit trace, not lightning). The Laplace field stays 4-connected — only
// the growth adjacency is 8-way.
const N8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const

/** Reset the field + boundary for a fresh strike, seeding one leader cell. */
function initStrike(s: DBMState): void {
  s.phi.fill(0.5)
  s.bc.fill(FREE)
  s.order.fill(-1)
  s.parent.fill(-1)
  s.inCand.fill(0)
  s.cands.length = 0
  s.count = 0
  s.phase = 'growing'
  s.phaseMs = 0

  const { gw, gh } = s
  // Far electrode geometry + leader seed, per mode.
  if (s.cfg.mode === 'radial') {
    // Bounding ring at φ=1; leader seed at the centre → a Lichtenberg star.
    for (let gx = 0; gx < gw; gx++) { s.bc[idx(s, gx, 0)] = GROUND; s.bc[idx(s, gx, gh - 1)] = GROUND }
    for (let gy = 0; gy < gh; gy++) { s.bc[idx(s, 0, gy)] = GROUND; s.bc[idx(s, gw - 1, gy)] = GROUND }
    for (const b of [0, gw - 1]) for (let gy = 0; gy < gh; gy++) s.phi[idx(s, b, gy)] = 1
    for (const b of [0, gh - 1]) for (let gx = 0; gx < gw; gx++) s.phi[idx(s, gx, b)] = 1
    seed(s, gw >> 1, gh >> 1)
  } else if (s.cfg.mode === 'point-to-point') {
    // A single small ground electrode low-centre; insulating walls elsewhere.
    const ex = (gw >> 1) + Math.round((s.rng() - 0.5) * gw * 0.3)
    const ey = gh - 2
    const er = Math.max(1, Math.round(gw * 0.02))
    for (let gy = ey - er; gy <= ey + er; gy++)
      for (let gx = ex - er; gx <= ex + er; gx++)
        if (inB(s, gx, gy)) { s.bc[idx(s, gx, gy)] = GROUND; s.phi[idx(s, gx, gy)] = 1 }
    const lx = (gw >> 1) + Math.round((s.rng() - 0.5) * gw * 0.3)
    seed(s, Math.max(1, Math.min(gw - 2, lx)), 1)
  } else {
    // cloud-to-ground: the whole bottom row is ground; insulating top/side walls.
    for (let gx = 0; gx < gw; gx++) { const i = idx(s, gx, gh - 1); s.bc[i] = GROUND; s.phi[i] = 1 }
    const lx = (gw >> 1) + Math.round((s.rng() - 0.5) * gw * 0.5)
    seed(s, Math.max(1, Math.min(gw - 2, lx)), 1)
  }

  for (let i = 0; i < INIT_SWEEPS; i++) relax(s)
}

/** Pin a cell as the bolt's root and register its empty neighbours as candidates. */
function seed(s: DBMState, gx: number, gy: number): void {
  const i = idx(s, gx, gy)
  s.bc[i] = TREE
  s.phi[i] = 0
  s.order[i] = 0
  s.parent[i] = -1
  s.count = 1
  addNeighbours(s, gx, gy)
}

function addNeighbours(s: DBMState, gx: number, gy: number): void {
  for (const [dx, dy] of N8) {
    const nx = gx + dx, ny = gy + dy
    if (!inB(s, nx, ny)) continue
    const ni = idx(s, nx, ny)
    if (s.bc[ni] === TREE || s.inCand[ni]) continue
    s.inCand[ni] = 1
    s.cands.push(ni)
  }
}

/** One SOR sweep of Laplace relaxation over the free cells (Neumann walls via
 *  reflected neighbour access; ground/tree cells stay pinned). */
function relax(s: DBMState): void {
  const { gw, gh, phi, bc } = s
  for (let gy = 0; gy < gh; gy++) {
    const row = gy * gw
    for (let gx = 0; gx < gw; gx++) {
      const i = row + gx
      if (bc[i] !== FREE) continue
      const l = gx > 0 ? phi[i - 1] : phi[i]
      const r = gx < gw - 1 ? phi[i + 1] : phi[i]
      const u = gy > 0 ? phi[i - gw] : phi[i]
      const d = gy < gh - 1 ? phi[i + gw] : phi[i]
      phi[i] += OMEGA * ((l + r + u + d) * 0.25 - phi[i])
    }
  }
}

/** Is this newly-added cell touching the far electrode? (strike complete) */
function touchesGround(s: DBMState, gx: number, gy: number): boolean {
  for (const [dx, dy] of N8) {
    const nx = gx + dx, ny = gy + dy
    if (inB(s, nx, ny) && s.bc[idx(s, nx, ny)] === GROUND) return true
  }
  return false
}

/** Choose a candidate ∝ φ^η and extend the bolt to it. Returns true on completion. */
function growOne(s: DBMState): boolean {
  const cands = s.cands
  if (cands.length === 0) return true // nowhere left to grow → treat as done
  const eta = s.cfg.eta
  // Weighted pick over max(φ,ε)^η.
  let total = 0
  for (let k = 0; k < cands.length; k++) {
    const p = s.phi[cands[k]]
    total += Math.pow(p > EPS ? p : EPS, eta)
  }
  let r = s.rng() * total
  let pick = cands.length - 1
  for (let k = 0; k < cands.length; k++) {
    const p = s.phi[cands[k]]
    r -= Math.pow(p > EPS ? p : EPS, eta)
    if (r <= 0) { pick = k; break }
  }
  const ci = cands[pick]
  // swap-remove from the candidate list
  cands[pick] = cands[cands.length - 1]
  cands.pop()
  s.inCand[ci] = 0

  const gx = ci % s.gw
  const gy = (ci / s.gw) | 0
  // parent = the tree neighbour with the highest field (the strongest connection)
  let bestP = -1, bestPhi = -Infinity
  for (const [dx, dy] of N8) {
    const nx = gx + dx, ny = gy + dy
    if (inB(s, nx, ny)) { const ni = idx(s, nx, ny); if (s.bc[ni] === TREE && s.phi[ni] >= bestPhi) { bestPhi = s.phi[ni]; bestP = ni } }
  }
  s.bc[ci] = TREE
  s.phi[ci] = 0
  s.order[ci] = s.count
  s.parent[ci] = bestP
  s.count++

  if (touchesGround(s, gx, gy)) return true
  addNeighbours(s, gx, gy)
  for (let i = 0; i < STEP_SWEEPS; i++) relax(s)
  return false
}

export function createState(cfg: LightningConfig, w: number, h: number): DBMState {
  const long = Math.max(w, h)
  const cellPx = Math.max(2, Math.round(long / TARGET_CELLS))
  const gw = Math.max(8, Math.floor(w / cellPx))
  const gh = Math.max(8, Math.floor(h / cellPx))
  const n = gw * gh
  const s: DBMState = {
    cfg, w, h, cellPx, gw, gh,
    phi: new Float32Array(n),
    bc: new Int8Array(n),
    parent: new Int32Array(n),
    order: new Int32Array(n),
    count: 0,
    cands: [],
    inCand: new Uint8Array(n),
    rng: mulberry32(cfg.seed),
    budget: 0,
    phase: 'growing',
    phaseMs: 0,
    strikes: 0,
  }
  initStrike(s)
  return s
}

/** Advance the state machine by dt ms. */
export function advance(s: DBMState, dt: number): void {
  if (s.phase === 'flashing') {
    s.phaseMs += dt
    if (s.phaseMs >= FLASH_MS) { s.phase = 'fading'; s.phaseMs = 0 }
    return
  }
  if (s.phase === 'fading') {
    s.phaseMs += dt
    if (s.phaseMs >= s.cfg.afterglow * 1000) { s.strikes++; initStrike(s) }
    return
  }
  // growing
  for (let i = 0; i < FRAME_SWEEPS; i++) relax(s)
  s.budget += (s.cfg.strikeSpeed * dt) / 1000
  let target = Math.floor(s.budget)
  s.budget -= target
  let steps = 0
  while (target > 0 && steps < MAX_STEPS_PER_FRAME) {
    if (growOne(s)) { s.phase = 'flashing'; s.phaseMs = 0; return }
    target--
    steps++
  }
}

/** Live-apply config knobs that don't require rebuilding the grid. Returns false
 *  when the change is structural (seed / mode / geometry) so the framework re-setups. */
export function applyConfig(s: DBMState, cfg: LightningConfig): boolean {
  if (cfg.seed !== s.cfg.seed || cfg.mode !== s.cfg.mode) return false
  s.cfg = cfg // eta / strikeSpeed / afterglow / render + colour knobs all apply live
  return true
}
