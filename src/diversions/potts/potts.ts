import { mulberry32 } from '../../framework/rng'
import { hslToRgb } from '../../framework/color'
import type { PottsConfig } from './schema'

// Reseed policy: grain growth coarsens forever, so a run eventually reaches just a few
// enormous grains and nothing much more will happen — re-noise it. We count distinct
// grains (connected components) with an ABSOLUTE threshold (not grid-proportional): a
// handful of big grains is "done" whether the screen is small or huge. Checking is O(N)
// so we only do it every CHECK_EVERY generations, and never before MIN_GENS (let it
// organize first).
const RESEED_GRAINS = 14
const MIN_GENS = 60
const CHECK_EVERY = 20

type RGB = [number, number, number]

// 8-neighbour (Moore) offsets. Grain growth uses the Moore neighbourhood so boundaries
// migrate isotropically instead of pinning to the square lattice axes.
const OFF_X = [-1, 0, 1, -1, 1, -1, 0, 1]
const OFF_Y = [-1, -1, -1, 0, 0, 1, 1, 1]

// Reused scratch for the 8 neighbour orientations of the current cell — module-level so
// a hot sweep (N attempts × steps) never allocates.
const NB = new Uint8Array(8)

export type PottsState = {
  cfg: PottsConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  grid: Uint8Array // orientation 0..q-1 per site, row-major
  q: number
  accept: Float32Array // ΔE ∈ [-8,8] → flip probability at current T (index ΔE+8)
  rng: () => number
  reseeds: number
  gens: number // generations since the last (re)seed
  checkAcc: number // generations since the last grain-count check
  lut: RGB[] // q orientation colours
  wall: RGB
  bg: RGB
  off: HTMLCanvasElement
  offCtx: CanvasRenderingContext2D
  img: ImageData
  needBlit: boolean
}

function hexRGB(hex: string): RGB {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** Build the q-colour orientation LUT from the palette (evenly-spaced hues). */
export function buildLut(cfg: PottsConfig): RGB[] {
  const { hueStart, hueSpan, saturation, lightness } = cfg.palette
  const q = cfg.states
  const out: RGB[] = []
  for (let i = 0; i < q; i++) {
    const { r, g, b } = hslToRgb(hueStart + (hueSpan * i) / q, saturation, lightness)
    out.push([r, g, b])
  }
  return out
}

function seedGrid(st: PottsState): void {
  const rng = mulberry32((st.cfg.seed >>> 0) + st.reseeds * 0x9e3779b1)
  const { grid, q } = st
  for (let i = 0; i < grid.length; i++) grid[i] = (rng() * q) | 0
  st.rng = mulberry32(((st.cfg.seed >>> 0) ^ 0x1b56c4e9) + st.reseeds * 0x85ebca77)
  st.gens = 0
  st.checkAcc = 0
  st.needBlit = true
}

export function createPottsState(cfg: PottsConfig, w: number, h: number): PottsState {
  const cell = cfg.cellSize
  const gw = Math.max(2, Math.ceil(w / cell))
  const gh = Math.max(2, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Potts requires a 2D context for its offscreen buffer')
  const st: PottsState = {
    cfg, w, h, gw, gh, cell,
    grid: new Uint8Array(gw * gh),
    q: cfg.states,
    accept: new Float32Array(17),
    rng: mulberry32(cfg.seed >>> 0),
    reseeds: 0,
    gens: 0,
    checkAcc: 0,
    lut: buildLut(cfg),
    wall: hexRGB(cfg.boundaryColor),
    bg: hexRGB(cfg.background),
    off, offCtx, img: offCtx.createImageData(gw, gh),
    needBlit: true,
  }
  seedGrid(st)
  return st
}

/** Re-fit to a new display size. Like the other grid sims, only a genuine change of cell
 *  dimensions reallocates + reseeds; a same-dimension reflow (fullscreen toggle / drag)
 *  just re-blits so the anneal doesn't restart. */
export function resizePotts(st: PottsState, w: number, h: number): void {
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

/** Rebuild the Metropolis acceptance table for the current T. Flipping a cell to a
 *  neighbour's orientation changes the count of unlike bonds by ΔE ∈ [-8,8]; accept if
 *  ΔE ≤ 0 (crucially INCLUDING ΔE = 0 — those zero-energy moves are what let flat walls
 *  migrate and drive coarsening), else with probability exp(−ΔE/T). At T = 0 the invT is
 *  huge so every ΔE > 0 move is rejected: strict energy descent, crisp boundaries. */
export function buildAccept(st: PottsState, T: number): void {
  const acc = st.accept
  const invT = 1 / Math.max(1e-4, T)
  for (let dE = -8; dE <= 8; dE++) {
    acc[dE + 8] = dE <= 0 ? 1 : Math.exp(-dE * invT)
  }
}

/** One Monte-Carlo sweep: N single-cell reorientation attempts on the toroidal lattice.
 *  Each attempt draws exactly three randoms (site, proposal direction, accept) regardless
 *  of branch, so the evolution is fully deterministic for a seed. */
export function stepPotts(st: PottsState): void {
  const { grid, gw, gh, accept, rng } = st
  const N = gw * gh
  for (let n = 0; n < N; n++) {
    const i = (rng() * N) | 0
    const x = i % gw
    const y = (i / gw) | 0
    const cur = grid[i]
    // Gather the 8 wrapped neighbour orientations.
    for (let k = 0; k < 8; k++) {
      let nx = x + OFF_X[k]
      let ny = y + OFF_Y[k]
      if (nx < 0) nx = gw - 1; else if (nx >= gw) nx = 0
      if (ny < 0) ny = gh - 1; else if (ny >= gh) ny = 0
      NB[k] = grid[ny * gw + nx]
    }
    const dir = (rng() * 8) | 0
    const cand = NB[dir]
    const r = rng()
    if (cand === cur) continue // proposal is a no-op; draws already consumed
    // ΔE = (# neighbours unlike cand) − (# neighbours unlike cur).
    let dE = 0
    for (let k = 0; k < 8; k++) {
      const v = NB[k]
      if (v !== cand) dE++
      if (v !== cur) dE--
    }
    if (r < accept[dE + 8]) grid[i] = cand
  }
}

/** Total grain-boundary length: count of unlike right/down bonds (toroidal), each bond
 *  once. This is the lattice energy; it DECREASES as the polycrystal coarsens. */
export function boundaryEnergy(st: PottsState): number {
  const { grid, gw, gh } = st
  let e = 0
  for (let y = 0; y < gh; y++) {
    const y0 = y * gw
    const rowDn = (y === gh - 1 ? 0 : y + 1) * gw
    for (let x = 0; x < gw; x++) {
      const s = grid[y0 + x]
      if (grid[y0 + (x === gw - 1 ? 0 : x + 1)] !== s) e++
      if (grid[rowDn + x] !== s) e++
    }
  }
  return e
}

/** Number of distinct grains: connected components of equal orientation (4-connectivity,
 *  non-wrapped). Drops as small grains are swallowed — the coarsening headline. */
export function grainCount(st: PottsState): number {
  const { grid, gw, gh } = st
  const N = gw * gh
  const seen = new Uint8Array(N)
  const stack = new Int32Array(N)
  let count = 0
  for (let start = 0; start < N; start++) {
    if (seen[start]) continue
    count++
    const label = grid[start]
    let sp = 0
    stack[sp++] = start
    seen[start] = 1
    while (sp > 0) {
      const i = stack[--sp]
      const x = i % gw
      const y = (i / gw) | 0
      if (x > 0) { const j = i - 1; if (!seen[j] && grid[j] === label) { seen[j] = 1; stack[sp++] = j } }
      if (x < gw - 1) { const j = i + 1; if (!seen[j] && grid[j] === label) { seen[j] = 1; stack[sp++] = j } }
      if (y > 0) { const j = i - gw; if (!seen[j] && grid[j] === label) { seen[j] = 1; stack[sp++] = j } }
      if (y < gh - 1) { const j = i + gw; if (!seen[j] && grid[j] === label) { seen[j] = 1; stack[sp++] = j } }
    }
  }
  return count
}

/** Advance the model by `steps` sweeps at the config temperature. Periodically counts the
 *  grains and re-noises once the polycrystal has coarsened to a few big grains, so a run
 *  never dead-ends into a static frame. */
export function advancePotts(st: PottsState, steps: number): void {
  buildAccept(st, st.cfg.temperature)
  for (let s = 0; s < steps; s++) {
    stepPotts(st)
    st.gens++
    st.checkAcc++
    if (st.checkAcc >= CHECK_EVERY) {
      st.checkAcc = 0
      if (st.gens >= MIN_GENS && grainCount(st) <= RESEED_GRAINS) {
        st.reseeds++
        seedGrid(st)
      }
    }
  }
  st.needBlit = true
}

/** Rebuild the colour caches from config (a live palette / wall / bg edit — keeps grains). */
export function applyColors(st: PottsState, cfg: PottsConfig): void {
  st.lut = buildLut(cfg)
  st.wall = hexRGB(cfg.boundaryColor)
  st.bg = hexRGB(cfg.background)
  st.needBlit = true
}

/** Paint the lattice into the offscreen buffer and blit it upscaled crisply (nearest-
 *  neighbour). With Grain boundaries on, a cell whose right or bottom neighbour has a
 *  different orientation is drawn in the wall colour, outlining every grain. */
export function renderPotts(st: PottsState, ctx: CanvasRenderingContext2D): void {
  const { img, grid, lut, wall, gw, gh } = st
  const data = img.data
  const walls = st.cfg.boundary
  for (let y = 0; y < gh; y++) {
    const y0 = y * gw
    const rowDn = (y === gh - 1 ? 0 : y + 1) * gw
    for (let x = 0; x < gw; x++) {
      const i = y0 + x
      const s = grid[i]
      let c = lut[s]
      if (walls) {
        const right = grid[y0 + (x === gw - 1 ? 0 : x + 1)]
        const downN = grid[rowDn + x]
        if (right !== s || downN !== s) c = wall
      }
      const o = i * 4
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255
    }
  }
  st.offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(st.off, 0, 0, gw * st.cell, gh * st.cell)
  st.needBlit = false
}
