// schelling.ts — Schelling's segregation model. Pure (no DOM-instantiating imports)
// so it unit-tests headless. A fixed square grid of `types` agent kinds plus empty
// cells; each round the unhappy agents (fewer than `tolerance` of their occupied
// 8-neighbours matching) relocate to an empty cell. From that mild local preference
// the grid sorts itself into large single-type blocks. The grid is rendered
// stretched-to-fill so a resize never rebuilds the world. When it settles, the sim
// holds, then reshuffles back to noise and sorts again — an endless calm loop.

import { mulberry32 } from '../../framework/rng'
import type { SchellingConfig } from './schema'

export const EMPTY = -1

// 8-neighbour (Moore) offsets.
const NB = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const

// Reseed / settle policy: an ABSOLUTE unhappy-count threshold (not proportional) —
// once this few agents are unhappy the configuration is treated as settled.
const SETTLE_UNHAPPY = 3

export type Phase = 'sorting' | 'holding'

export interface SchellingState {
  cfg: SchellingConfig
  w: number
  h: number
  n: number // grid side
  grid: Int8Array // n*n; EMPTY or 0..types-1
  empties: Int32Array // cell indices that are currently empty (first `emptyCount` valid)
  emptyCount: number
  emptyPos: Int32Array // cell -> index into `empties`, or -1 if occupied
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  phase: Phase
  holdAccum: number // ms spent holding a settled pattern
  unhappy: number // unhappy agents after the last completed round
  segregation: number // mean same-type fraction among occupied neighbours (0..1)
  // render scratch
  field: ImageData | null
  buf: OffscreenCanvas | HTMLCanvasElement | null
  lut: Uint8Array // (types+1)*3 rgb: [empty, A, B, C...]
}

// ── color ─────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** rgb LUT: slot 0 = background/empty, slots 1..types = type colours. */
export function buildLut(cfg: SchellingConfig): Uint8Array {
  const cols = [cfg.palette.background, cfg.palette.typeA, cfg.palette.typeB, cfg.palette.typeC]
  const lut = new Uint8Array(4 * 3)
  for (let i = 0; i < 4; i++) {
    const [r, g, b] = hexRgb(cols[i])
    lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b
  }
  return lut
}

// ── build / scramble ─────────────────────────────────────────────────────────

/** Fill the grid with a fresh random salt-and-pepper mix honouring the empty
 *  fraction and type count, and rebuild the empty-cell index. Uses the state's
 *  continuing rng stream so the whole loop stays deterministic from the seed. */
export function scramble(state: SchellingState): void {
  const { cfg, n, grid, rng } = state
  const total = n * n
  const wantEmpty = Math.min(total - 1, Math.max(1, Math.round(cfg.emptyFraction * total)))
  const occupied = total - wantEmpty
  const types = cfg.types

  // Lay down a deterministic composition, then Fisher–Yates shuffle it into the grid.
  for (let i = 0; i < total; i++) {
    if (i < wantEmpty) grid[i] = EMPTY
    else grid[i] = (i - wantEmpty) % types
  }
  for (let i = total - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = grid[i]; grid[i] = grid[j]; grid[j] = tmp
  }

  // Rebuild the empty index.
  state.emptyPos.fill(-1)
  let e = 0
  for (let i = 0; i < total; i++) {
    if (grid[i] === EMPTY) { state.empties[e] = i; state.emptyPos[i] = e; e++ }
  }
  state.emptyCount = e
  state.phase = 'sorting'
  state.holdAccum = 0
  void occupied
  recomputeStats(state)
}

export function createSchellingState(cfg: SchellingConfig, w: number, h: number): SchellingState {
  const n = cfg.gridSize
  const total = n * n
  const state: SchellingState = {
    cfg, w, h, n,
    grid: new Int8Array(total),
    empties: new Int32Array(total),
    emptyCount: 0,
    emptyPos: new Int32Array(total).fill(-1),
    rng: mulberry32(cfg.seed | 0),
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.speed,
    phase: 'sorting', holdAccum: 0,
    unhappy: 0, segregation: 0,
    field: null, buf: null, lut: buildLut(cfg),
  }
  scramble(state)
  return state
}

// ── empty-cell bookkeeping (O(1) add/remove) ────────────────────────────────

function removeEmpty(state: SchellingState, cell: number): void {
  const pos = state.emptyPos[cell]
  const last = state.emptyCount - 1
  const lastCell = state.empties[last]
  state.empties[pos] = lastCell
  state.emptyPos[lastCell] = pos
  state.emptyPos[cell] = -1
  state.emptyCount = last
}

function addEmpty(state: SchellingState, cell: number): void {
  const pos = state.emptyCount
  state.empties[pos] = cell
  state.emptyPos[cell] = pos
  state.emptyCount = pos + 1
}

// ── happiness ───────────────────────────────────────────────────────────────

/** True if the agent at (col,row) of type `t` is happy: at least `tolerance` of its
 *  occupied 8-neighbours share its type. An agent with no occupied neighbour is happy
 *  (the classic convention). */
function isHappy(grid: Int8Array, n: number, col: number, row: number, t: number, tol: number): boolean {
  let same = 0, occ = 0
  for (let k = 0; k < 8; k++) {
    const c = col + NB[k][0]
    const r = row + NB[k][1]
    if (c < 0 || c >= n || r < 0 || r >= n) continue
    const v = grid[r * n + c]
    if (v === EMPTY) continue
    occ++
    if (v === t) same++
  }
  if (occ === 0) return true
  return same / occ >= tol
}

// ── one sorting round ─────────────────────────────────────────────────────────

/** Find the nearest empty cell (Chebyshev rings) where an agent of type `t` would be
 *  HAPPY — the classic "move to the closest spot that satisfies me" rule, which grows
 *  compact same-type blocks and actually converges (a plain nearest-empty move leaves
 *  the agent in the same hostile patch and it churns forever). `from` is assumed
 *  already vacated. Returns a cell index, or -1 if no satisfying empty exists. */
function nearestHappyEmpty(state: SchellingState, from: number, t: number, tol: number): number {
  const { n, grid } = state
  const c0 = from % n, r0 = (from / n) | 0
  const consider = (idx: number, c: number, r: number): boolean =>
    grid[idx] === EMPTY && isHappy(grid, n, c, r, t, tol)
  for (let rad = 1; rad < n * 2; rad++) {
    // Walk the ring at Chebyshev distance `rad`.
    for (let dr = -rad; dr <= rad; dr++) {
      const r = r0 + dr
      if (r < 0 || r >= n) continue
      const edge = Math.abs(dr) === rad
      if (edge) {
        for (let dc = -rad; dc <= rad; dc++) {
          const c = c0 + dc
          if (c < 0 || c >= n) continue
          const idx = r * n + c
          if (consider(idx, c, r)) return idx
        }
      } else {
        for (const dc of [-rad, rad]) {
          const c = c0 + dc
          if (c < 0 || c >= n) continue
          const idx = r * n + c
          if (consider(idx, c, r)) return idx
        }
      }
    }
  }
  return -1
}

/** Execute one Schelling round: identify the currently-unhappy agents from a snapshot
 *  of the grid, then relocate each (sequentially, so later movers see the updated
 *  grid). Returns the number of agents that were unhappy this round. */
export function step(state: SchellingState): number {
  const { cfg, n, grid, rng } = state
  const tol = cfg.tolerance
  state.tick++

  // Snapshot the unhappy set first (identify-then-move is the standard formulation).
  const movers: number[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const idx = r * n + c
      const t = grid[idx]
      if (t === EMPTY) continue
      if (!isHappy(grid, n, c, r, t, tol)) movers.push(idx)
    }
  }

  // Shuffle move order so no positional bias creeps in.
  for (let i = movers.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const tmp = movers[i]; movers[i] = movers[j]; movers[j] = tmp
  }

  const nearest = cfg.moveMode === 'nearest'
  for (const from of movers) {
    const t = grid[from]
    if (t === EMPTY) continue // moved into by a prior mover this round
    if (state.emptyCount === 0) break
    if (nearest) {
      // Vacate first so the target search sees `from` as free, then settle into the
      // nearest empty that makes this agent happy. If none exists, stay put.
      grid[from] = EMPTY
      addEmpty(state, from)
      const to = nearestHappyEmpty(state, from, t, tol)
      if (to >= 0) {
        grid[to] = t
        removeEmpty(state, to) // `from` stays empty
      } else {
        grid[from] = t
        removeEmpty(state, from) // put it back
      }
    } else {
      // Jump to any empty cell.
      const to = state.empties[(rng() * state.emptyCount) | 0]
      grid[to] = t
      removeEmpty(state, to)
      grid[from] = EMPTY
      addEmpty(state, from)
    }
  }

  state.unhappy = movers.length
  recomputeStats(state)
  return movers.length
}

/** Segregation index: mean over occupied cells of (same-type occupied neighbours /
 *  occupied neighbours). ~1/types for a random mix, → ~1 when fully segregated.
 *  (Also refreshes `unhappy` for the current grid.) */
export function recomputeStats(state: SchellingState): void {
  const { n, grid, cfg } = state
  const tol = cfg.tolerance
  let segSum = 0, segCount = 0, unhappy = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const idx = r * n + c
      const t = grid[idx]
      if (t === EMPTY) continue
      let same = 0, occ = 0
      for (let k = 0; k < 8; k++) {
        const cc = c + NB[k][0]
        const rr = r + NB[k][1]
        if (cc < 0 || cc >= n || rr < 0 || rr >= n) continue
        const v = grid[rr * n + cc]
        if (v === EMPTY) continue
        occ++
        if (v === t) same++
      }
      if (occ > 0) {
        segSum += same / occ
        segCount++
        if (same / occ < tol) unhappy++
      }
    }
  }
  state.segregation = segCount ? segSum / segCount : 0
  state.unhappy = unhappy
}

// ── time stepping (+ settle → hold → reshuffle loop) ─────────────────────────

export function advance(state: SchellingState, dt: number): void {
  state.tickMs = 1000 / state.cfg.speed

  if (state.phase === 'holding') {
    state.holdAccum += dt
    if (state.holdAccum >= state.cfg.holdSeconds * 1000) {
      scramble(state) // back to salt-and-pepper; sorts again
    }
    return
  }

  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
    if (state.unhappy <= SETTLE_UNHAPPY) {
      state.phase = 'holding'
      state.holdAccum = 0
      break
    }
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function ensureBuf(state: SchellingState): void {
  if (state.buf && state.field) return
  const n = state.n
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.field = bctx.createImageData(n, n)
}

export function render(state: SchellingState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, grid, lut } = state
  ensureBuf(state)
  const img = state.field!
  const data = img.data
  for (let i = 0; i < n * n; i++) {
    const slot = (grid[i] === EMPTY ? 0 : grid[i] + 1) * 3
    const p = i * 4
    data[p] = lut[slot]; data[p + 1] = lut[slot + 1]; data[p + 2] = lut[slot + 2]; data[p + 3] = 255
  }
  const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  bctx.putImageData(img, 0, 0)

  // Crisp blocky cells: nearest-neighbour upscale of the n×n grid image.
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  if (cfg.showHud) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#f0e9df'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    const status = state.phase === 'holding' ? 'settled' : `${state.unhappy} unhappy`
    ctx.fillText(`segregation ${(state.segregation * 100).toFixed(0)}%   ·   ${status}`, 14, 14)
    ctx.globalAlpha = 1
  }
}
