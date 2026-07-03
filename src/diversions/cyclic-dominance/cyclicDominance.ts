// cyclicDominance.ts — the Reichenbach–Mobilia–Frey lattice model of spatial
// rock-paper-scissors. Pure (no DOM-instantiating imports) so it unit-tests
// headless. Unlike a synchronous CA, this is an asynchronous Monte Carlo
// process: each "step" is one full sweep of n*n random cell/neighbour
// interactions, each mutating the grid in place immediately (not double-
// buffered) — that asynchrony is what lets local predation/reproduction
// fronts propagate into coherent rotating spiral waves once mobility mixes
// them just enough.

import { mulberry32 } from '../../framework/rng'
import type { CyclicDominanceConfig } from './schema'

export const EMPTY = -1
const SPECIES_COUNT = 3

const DX = [0, 0, -1, 1]
const DY = [-1, 1, 0, 0]

export interface Rates {
  p: number // cumulative threshold for predation
  pr: number // cumulative threshold for predation+reproduction (remainder is mobility)
}

export interface CDState {
  cfg: CyclicDominanceConfig
  w: number
  h: number
  n: number
  grid: Int8Array // -1 (empty) or 0/1/2 (species), toroidal n×n
  rng: () => number
  thresh: Rates
  lut: Uint8Array // 4×3 rgb: index 0 = empty, 1/2/3 = species A/B/C
  tick: number
  tickAccum: number
  tickMs: number
  fractions: Float32Array // [empty, A, B, C] population fractions
  extinctStreak: number // consecutive sweeps with a species at zero population
  field: ImageData | null
  buf: OffscreenCanvas | HTMLCanvasElement | null
}

// ── colour ──────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function buildLut(cfg: CyclicDominanceConfig): Uint8Array {
  const lut = new Uint8Array(4 * 3)
  const put = (i: number, hex: string) => {
    const [r, g, b] = hexRgb(hex)
    lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b
  }
  put(0, cfg.colors.background)
  put(1, cfg.colors.a)
  put(2, cfg.colors.b)
  put(3, cfg.colors.c)
  return lut
}

/** Normalize the three raw rate sliders into cumulative draw thresholds
 *  (predation, reproduction, mobility sum to 1 by construction). */
export function buildRates(cfg: CyclicDominanceConfig): Rates {
  const sum = cfg.predationRate + cfg.reproductionRate + cfg.mobility
  const p = cfg.predationRate / sum
  const r = cfg.reproductionRate / sum
  return { p, pr: p + r }
}

// ── build ──────────────────────────────────────────────────────────────────

/** Random initial soup: every cell is independently empty (~20%) or one of
 *  the three species (evenly split over the rest). */
function seedGrid(n: number, rng: () => number): Int8Array {
  const g = new Int8Array(n * n)
  const emptyFrac = 0.2
  for (let i = 0; i < g.length; i++) {
    const u = rng()
    if (u < emptyFrac) { g[i] = EMPTY; continue }
    g[i] = Math.min(SPECIES_COUNT - 1, (((u - emptyFrac) / (1 - emptyFrac)) * SPECIES_COUNT) | 0)
  }
  return g
}

export function createState(cfg: CyclicDominanceConfig, w: number, h: number): CDState {
  const n = cfg.gridResolution
  const rng = mulberry32(cfg.seed | 0)
  return {
    cfg, w, h, n,
    grid: seedGrid(n, rng),
    rng,
    thresh: buildRates(cfg),
    lut: buildLut(cfg),
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    fractions: new Float32Array(4),
    extinctStreak: 0,
    field: null, buf: null,
  }
}

// ── simulation ──────────────────────────────────────────────────────────────

/** One random pairwise interaction between cells `i` and `j`, given a single
 *  draw `u` in [0,1) and the normalized rate thresholds. Mutates `grid` in
 *  place. Exported standalone so the three reaction rules are directly
 *  testable without going through the RNG. */
export function applyInteraction(grid: Int8Array, i: number, j: number, u: number, thresh: Rates): void {
  const a = grid[i], b = grid[j]
  if (u < thresh.p) {
    // Predation: the predator's prey becomes empty. Check both directions —
    // whichever of the pair preys on the other (cyclically: s preys on (s+1)%3).
    if (a >= 0 && b >= 0) {
      if (b === (a + 1) % SPECIES_COUNT) grid[j] = EMPTY
      else if (a === (b + 1) % SPECIES_COUNT) grid[i] = EMPTY
    }
  } else if (u < thresh.pr) {
    // Reproduction: exactly one side empty → it copies the other's species.
    if (a === EMPTY && b !== EMPTY) grid[i] = b
    else if (b === EMPTY && a !== EMPTY) grid[j] = a
  } else {
    // Mobility: swap the pair outright, regardless of contents.
    grid[i] = b
    grid[j] = a
  }
}

/** One full Monte Carlo sweep: n*n random cell/neighbour interactions, each
 *  applied asynchronously (immediately visible to later draws in the same
 *  sweep) — the standard RMF update rule. Toroidal von Neumann neighbours. */
export function step(state: CDState): void {
  const { n, grid, rng, thresh } = state
  const total = n * n
  for (let k = 0; k < total; k++) {
    const x = (rng() * n) | 0
    const y = (rng() * n) | 0
    const dir = (rng() * 4) | 0
    const nx = (x + DX[dir] + n) % n
    const ny = (y + DY[dir] + n) % n
    const i = y * n + x
    const j = ny * n + nx
    applyInteraction(grid, i, j, rng(), thresh)
  }
  state.tick++

  // Tally population fractions (also the screensaver liveness signal: once a
  // species truly hits zero it's an absorbing state — nothing left to
  // reproduce it back — so the world is heading toward a two-species or
  // single-species collapse and should be reseeded).
  const frac = state.fractions
  frac.fill(0)
  for (let i = 0; i < total; i++) frac[grid[i] + 1]++
  for (let s = 0; s < 4; s++) frac[s] /= total
  const extinct = frac[1] === 0 || frac[2] === 0 || frac[3] === 0
  state.extinctStreak = extinct ? state.extinctStreak + 1 : 0
}

export function advance(state: CDState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 6
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
  }
}

// ── rendering ──────────────────────────────────────────────────────────────

function ensureBuf(state: CDState): void {
  if (state.buf && state.field) return
  const n = state.n
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.field = bctx.createImageData(n, n)
}

export function render(state: CDState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, grid, lut } = state
  ensureBuf(state)
  const img = state.field!
  const data = img.data
  for (let i = 0; i < n * n; i++) {
    const o = (grid[i] + 1) * 3
    const p = i * 4
    data[p] = lut[o]; data[p + 1] = lut[o + 1]; data[p + 2] = lut[o + 2]; data[p + 3] = 255
  }
  const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  bctx.putImageData(img, 0, 0)

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  if (cfg.showHud) {
    const f = state.fractions
    const labels = [`A ${(f[1] * 100) | 0}%`, `B ${(f[2] * 100) | 0}%`, `C ${(f[3] * 100) | 0}%`]
    ctx.globalAlpha = 0.9
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    let x = 14
    for (let k = 0; k < labels.length; k++) {
      const idx = k + 1
      ctx.fillStyle = `rgb(${lut[idx * 3]},${lut[idx * 3 + 1]},${lut[idx * 3 + 2]})`
      ctx.fillText(labels[k], x, 14)
      x += ctx.measureText(labels[k]).width + 16
    }
    ctx.globalAlpha = 1
  }
}
