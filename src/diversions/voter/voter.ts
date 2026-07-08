import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import type { VoterConfig } from './schema'

// Reseed policy: the voter model coarsens forever, so a run eventually drifts to (near)
// full consensus and nothing more will happen — re-noise it. We track the MINORITY cell
// count (grid size minus the largest opinion's count) with an ABSOLUTE threshold (not
// grid-proportional, matching Potts' grain-count trigger and the CA-quiescence gotcha): a
// handful of stray cells is "done" whether the screen is small or huge. Checking is O(N)
// so it only runs every CHECK_EVERY sweeps, and never before MIN_GENS (let it organize
// first). With Independence (noiseRate) > 0 the field never truly reaches this threshold —
// a trickle of random opinions keeps it perpetually unsettled, which is the intended
// alternative to reseeding.
const RESEED_MINORITY = 12
const MIN_GENS = 40
const CHECK_EVERY = 15

type RGB = [number, number, number]

// Von Neumann (4, orthogonal) and Moore (8, all-around) neighbour offsets, both toroidal.
const VON_X = [-1, 1, 0, 0]
const VON_Y = [0, 0, -1, 1]
const MOORE_X = [-1, 0, 1, -1, 1, -1, 0, 1]
const MOORE_Y = [-1, -1, -1, 0, 0, 1, 1, 1]

export type VoterState = {
  cfg: VoterConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  grid: Uint8Array // opinion 0..k-1 per site, row-major
  k: number
  rng: () => number
  reseeds: number
  gens: number // sweeps since the last (re)seed
  checkAcc: number // sweeps since the last minority check
  lut: RGB[] // k opinion colours
  offX: Int8Array // active neighbourhood offsets (first nbCount entries valid)
  offY: Int8Array
  nbCount: number
  hist: Int32Array // reused opinion histogram scratch (size >= k), avoids a per-check alloc
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  needBlit: boolean
}

/** Build the k-colour opinion LUT straight from the palette hex strings. */
export function buildLut(cfg: VoterConfig): RGB[] {
  return cfg.palette.map((hex) => {
    const { r, g, b } = parseHex6(hex)
    return [r, g, b] as RGB
  })
}

/** Swap the active neighbourhood (von Neumann/4 or Moore/8). Pure config, no grid
 *  reallocation needed, so this can apply live. */
export function setNeighborhood(st: VoterState, mode: VoterConfig['neighborhood']): void {
  const X = mode === 'moore' ? MOORE_X : VON_X
  const Y = mode === 'moore' ? MOORE_Y : VON_Y
  st.nbCount = X.length
  for (let i = 0; i < X.length; i++) { st.offX[i] = X[i]; st.offY[i] = Y[i] }
}

function seedGrid(st: VoterState): void {
  const rng = mulberry32((st.cfg.seed >>> 0) + st.reseeds * 0x9e3779b1)
  const { grid, k } = st
  for (let i = 0; i < grid.length; i++) grid[i] = (rng() * k) | 0
  st.rng = mulberry32(((st.cfg.seed >>> 0) ^ 0x1b56c4e9) + st.reseeds * 0x85ebca77)
  st.gens = 0
  st.checkAcc = 0
  st.needBlit = true
}

export function createVoterState(cfg: VoterConfig, w: number, h: number): VoterState {
  const cell = cfg.cellSize
  const gw = Math.max(2, Math.ceil(w / cell))
  const gh = Math.max(2, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Voter requires a 2D context for its offscreen buffer')
  const k = cfg.palette.length
  const st: VoterState = {
    cfg, w, h, gw, gh, cell,
    grid: new Uint8Array(gw * gh),
    k,
    rng: mulberry32(cfg.seed >>> 0),
    reseeds: 0,
    gens: 0,
    checkAcc: 0,
    lut: buildLut(cfg),
    offX: new Int8Array(8),
    offY: new Int8Array(8),
    nbCount: 4,
    hist: new Int32Array(Math.max(10, k)),
    off, offCtx, img: offCtx.createImageData(gw, gh),
    needBlit: true,
  }
  setNeighborhood(st, cfg.neighborhood)
  seedGrid(st)
  return st
}

/** Re-fit to a new display size. Like the other grid sims, only a genuine change of cell
 *  dimensions reallocates + reseeds; a same-dimension reflow (fullscreen toggle / drag)
 *  just re-blits so the drift doesn't restart. */
export function resizeVoter(st: VoterState, w: number, h: number): void {
  const gw = Math.max(2, Math.ceil(w / st.cell))
  const gh = Math.max(2, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  st.gw = gw
  st.gh = gh
  st.grid = new Uint8Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedGrid(st)
}

/** One sweep: N single-cell imitation attempts on the toroidal lattice (N = cell count).
 *  Each attempt draws exactly four randoms (site, neighbour direction, independence roll,
 *  independent-opinion roll) regardless of branch, so the evolution is fully deterministic
 *  for a seed. With `noiseRate` 0 this is the pure voter model: a cell simply copies a
 *  random neighbour's opinion — no energy, no surface tension. */
export function stepVoter(st: VoterState): void {
  const { grid, gw, gh, rng, offX, offY, nbCount, k } = st
  const noiseRate = st.cfg.noiseRate
  const N = gw * gh
  for (let n = 0; n < N; n++) {
    const i = (rng() * N) | 0
    const x = i % gw
    const y = (i / gw) | 0
    const dir = (rng() * nbCount) | 0
    const noiseRoll = rng()
    const opinionRoll = rng()
    if (noiseRoll < noiseRate) {
      grid[i] = (opinionRoll * k) | 0
      continue
    }
    let nx = x + offX[dir]
    let ny = y + offY[dir]
    if (nx < 0) nx = gw - 1; else if (nx >= gw) nx = 0
    if (ny < 0) ny = gh - 1; else if (ny >= gh) ny = 0
    grid[i] = grid[ny * gw + nx]
  }
}

/** grid size minus the largest opinion's count — how many cells disagree with the
 *  majority. Falls toward 0 as the field coarsens to consensus (the reseed trigger). */
export function minorityCount(st: VoterState): number {
  const { grid, k, hist } = st
  for (let j = 0; j < k; j++) hist[j] = 0
  for (let i = 0; i < grid.length; i++) hist[grid[i]]++
  let max = 0
  for (let j = 0; j < k; j++) if (hist[j] > max) max = hist[j]
  return grid.length - max
}

/** Advance the model by `sweeps` full passes. Periodically checks the minority count and
 *  re-noises once the field has drifted to (near) consensus, so a run never dead-ends into
 *  a static frame. */
export function advanceVoter(st: VoterState, sweeps: number): void {
  for (let s = 0; s < sweeps; s++) {
    stepVoter(st)
    st.gens++
    st.checkAcc++
    if (st.checkAcc >= CHECK_EVERY) {
      st.checkAcc = 0
      if (st.gens >= MIN_GENS && minorityCount(st) <= RESEED_MINORITY) {
        st.reseeds++
        seedGrid(st)
      }
    }
  }
  st.needBlit = true
}

/** Rebuild the colour cache from config (a live palette-colour edit — keeps the grid). */
export function applyColors(st: VoterState, cfg: VoterConfig): void {
  st.lut = buildLut(cfg)
  st.needBlit = true
}

/** Paint the lattice into the offscreen buffer and blit it upscaled crisply (nearest-
 *  neighbour). Color = opinion; the coarsening domains ARE the visual. */
export function renderVoter(st: VoterState, ctx: CanvasRenderingContext2D): void {
  const { img, grid, lut, gw, gh } = st
  const data = img.data
  for (let i = 0; i < grid.length; i++) {
    const c = lut[grid[i]]
    const o = i * 4
    data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}
