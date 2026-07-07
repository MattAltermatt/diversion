// termites.ts — Resnick/Deneubourg brood-sorting. Pure (no DOM-instantiating
// imports) so it unit-tests headless. A toroidal chip grid (−1 empty, else a chip
// type 0..colorCount-1) and a swarm of blind termites: each step a termite wanders
// one cell, and by Deneubourg's density-dependent probabilities picks up an isolated
// chip or drops a carried one where its kind already gathers. Scattered chips
// self-organize into a few color-sorted piles.

import { mulberry32 } from '../../framework/rng'
import type { TermiteSortingConfig } from './schema'

const K1 = 0.1 // pick-up sensitivity — lower f (isolated chip) → near-certain pick
const K2 = 0.15 // drop sensitivity — higher f (crowded) → near-certain drop
const SETTLE_TICKS = 1800 // no improvement for this long → the mess is sorted, reseed

// 8-neighborhood offsets.
const NB = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
] as const

export interface Termite {
  col: number
  row: number
  prevCol: number
  prevRow: number
  dir: number // index into NB — current heading
  carry: number // chip type carried, or -1
}

export interface TermiteState {
  cfg: TermiteSortingConfig
  w: number
  h: number
  n: number
  chips: Int8Array // chip type per cell, or -1
  termites: Termite[]
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  piles: number // last computed pile count
  minPiles: number // best (fewest) seen — drives the settle/reseed detector
  lastImprove: number
  wantReseed: boolean
  field: ImageData | null
  buf: OffscreenCanvas | HTMLCanvasElement | null
  dirty: boolean // field needs a pixel rebuild (a step ran / colors edited); else just re-blit (#273)
}

// ── build ─────────────────────────────────────────────────────────────────

export function createTermiteState(cfg: TermiteSortingConfig, w: number, h: number): TermiteState {
  const n = cfg.gridResolution
  const rng = mulberry32(cfg.seed | 0)
  const chips = new Int8Array(n * n).fill(-1)
  const cells = n * n
  const target = Math.floor(cfg.chipDensity * cells)
  let placed = 0
  let guard = target * 40
  while (placed < target && guard-- > 0) {
    const idx = (rng() * cells) | 0
    if (chips[idx] !== -1) continue
    chips[idx] = (rng() * cfg.colorCount) | 0
    placed++
  }

  const termites: Termite[] = []
  for (let i = 0; i < cfg.termiteCount; i++) {
    const c = (rng() * n) | 0
    const r = (rng() * n) | 0
    termites.push({ col: c, row: r, prevCol: c, prevRow: r, dir: (rng() * 8) | 0, carry: -1 })
  }

  return {
    cfg, w, h, n, chips, termites, rng,
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    piles: target, minPiles: cells, lastImprove: 0, wantReseed: false,
    field: null, buf: null, dirty: true,
  }
}

// ── simulation ──────────────────────────────────────────────────────────────

/** Local same-kind density around (c,r) for chip type `t`, blended toward
 *  any-chip density by (1 - sameColorBias). Range 0..1 over the 8 neighbors. */
function density(state: TermiteState, c: number, r: number, t: number): number {
  const { chips, n, cfg } = state
  let same = 0
  let any = 0
  for (const [dx, dy] of NB) {
    const cc = (c + dx + n) % n
    const rr = (r + dy + n) % n
    const v = chips[rr * n + cc]
    if (v !== -1) {
      any++
      if (v === t) same++
    }
  }
  const fSame = same / 8
  const fAny = any / 8
  return fAny + (fSame - fAny) * cfg.sameColorBias
}

export function step(state: TermiteState): void {
  const { cfg, n, chips, termites, rng } = state
  state.tick++

  for (const tm of termites) {
    // Wander: occasionally re-pick heading, then step one cell (toroidal).
    if (rng() < cfg.wanderStrength) tm.dir = (rng() * 8) | 0
    const [dx, dy] = NB[tm.dir]
    tm.prevCol = tm.col
    tm.prevRow = tm.row
    tm.col = (tm.col + dx + n) % n
    tm.row = (tm.row + dy + n) % n
    const idx = tm.row * n + tm.col
    const here = chips[idx]

    if (tm.carry === -1) {
      // Not carrying: an isolated chip is likely picked up.
      if (here !== -1) {
        const f = density(state, tm.col, tm.row, here)
        const p = (K1 / (K1 + f)) ** 2
        if (rng() < p) {
          tm.carry = here
          chips[idx] = -1
        }
      }
    } else {
      // Carrying: an empty cell amid its own kind is a likely drop.
      if (here === -1) {
        const f = density(state, tm.col, tm.row, tm.carry)
        const p = (f / (K2 + f)) ** 2
        if (rng() < p) {
          chips[idx] = tm.carry
          tm.carry = -1
        }
      }
    }
  }

  // Periodic pile recount + settle/reseed detection (flood fill is cheap at 20 Hz).
  if (state.tick % 20 === 0) {
    state.piles = countPiles(chips, n)
    if (state.piles < state.minPiles) {
      state.minPiles = state.piles
      state.lastImprove = state.tick
    } else if (state.tick - state.lastImprove > SETTLE_TICKS) {
      state.wantReseed = true
    }
  }
}

/** 4-connected components of non-empty cells (color-agnostic) — the pile count. */
export function countPiles(chips: Int8Array, n: number): number {
  const seen = new Uint8Array(n * n)
  const stack: number[] = []
  let piles = 0
  for (let start = 0; start < n * n; start++) {
    if (chips[start] === -1 || seen[start]) continue
    piles++
    stack.length = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const idx = stack.pop()!
      const c = idx % n
      const r = (idx / n) | 0
      // 4-neighbors, non-toroidal (piles that wrap the seam read as two — acceptable).
      if (c > 0 && chips[idx - 1] !== -1 && !seen[idx - 1]) { seen[idx - 1] = 1; stack.push(idx - 1) }
      if (c < n - 1 && chips[idx + 1] !== -1 && !seen[idx + 1]) { seen[idx + 1] = 1; stack.push(idx + 1) }
      if (r > 0 && chips[idx - n] !== -1 && !seen[idx - n]) { seen[idx - n] = 1; stack.push(idx - n) }
      if (r < n - 1 && chips[idx + n] !== -1 && !seen[idx + n]) { seen[idx + n] = 1; stack.push(idx + n) }
    }
  }
  return piles
}

export function advance(state: TermiteState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 12
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
    state.dirty = true // chips changed → the field needs a pixel rebuild this frame
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function ensureBuf(state: TermiteState): void {
  if (state.buf && state.field) return
  const n = state.n
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(n, n)
    : (() => { const c = document.createElement('canvas'); c.width = n; c.height = n; return c })()
  state.buf = canvas as OffscreenCanvas
  const bctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  state.field = bctx.createImageData(n, n)
  state.dirty = true // fresh (blank) field must be painted before the first blit
}

export function render(state: TermiteState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, chips } = state
  ensureBuf(state)
  // Only rebuild the n×n field when it actually changed (a step ran / colors edited);
  // otherwise the offscreen buffer already holds it and we just re-blit it (#273).
  if (state.dirty) {
    const img = state.field!
    const data = img.data
    const bg = hexRgb(cfg.color.background)
    const chipRgb = cfg.color.chips.map(hexRgb)
    for (let i = 0; i < n * n; i++) {
      const v = chips[i]
      const rgb = v === -1 ? bg : chipRgb[v % chipRgb.length]
      const p = i * 4
      data[p] = rgb[0]; data[p + 1] = rgb[1]; data[p + 2] = rgb[2]; data[p + 3] = 255
    }
    const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
    bctx.putImageData(img, 0, 0)
    state.dirty = false
  }

  ctx.imageSmoothingEnabled = cfg.softField
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  if (cfg.showTermites) {
    const alpha = state.tickMs > 0 ? Math.min(1, state.tickAccum / state.tickMs) : 0
    const sx = w / n
    const sy = h / n
    const rad = cfg.termiteSize
    ctx.fillStyle = cfg.color.termite
    ctx.globalAlpha = 0.85
    for (const tm of state.termites) {
      // Guard the toroidal seam: don't interpolate a full-width jump.
      const dc = Math.abs(tm.col - tm.prevCol) > 1 ? 0 : tm.col - tm.prevCol
      const dr = Math.abs(tm.row - tm.prevRow) > 1 ? 0 : tm.row - tm.prevRow
      const cx = (tm.prevCol + dc * alpha + 0.5) * sx
      const cy = (tm.prevRow + dr * alpha + 0.5) * sy
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  if (cfg.showHud) {
    ctx.globalAlpha = 0.85
    ctx.fillStyle = '#dfe3ec'
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(`piles ${state.piles}`, 14, 14)
    ctx.globalAlpha = 1
  }
}
