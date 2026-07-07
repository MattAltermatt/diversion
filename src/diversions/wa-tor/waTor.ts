// waTor.ts — Dewdney's Wa-Tor predator-prey automaton on a toroidal grid. Pure (no
// DOM-instantiating imports) so it unit-tests headless. The grid lives in flat typed
// arrays (kind/energy/breed, one entry per cell) rather than an agent list — cheap to
// scan and cheap to render. Each chronon visits every occupied cell's ORIGINAL index
// once, in a random order (Fisher–Yates), and resolves that creature's move live
// against the current grid — so a shark that eats a fish immediately overwrites that
// cell, and a `processed` flag (marked on both the origin and destination of every
// move) stops the routine from ever re-running a creature that has already acted,
// whether because another creature ate it or because a newborn now sits in its old
// cell. The grid is rendered stretched-to-fill so a resize never rebuilds the world.

import { mulberry32 } from '../../framework/rng'
import type { WaTorConfig } from './schema'

export const EMPTY = 0, FISH = 1, SHARK = 2

// Toroidal von Neumann offsets (right, left, down, up).
const DX = [1, -1, 0, 0] as const
const DY = [0, 0, 1, -1] as const

export interface WaTorState {
  cfg: WaTorConfig
  w: number
  h: number
  n: number // grid side
  kind: Uint8Array // EMPTY | FISH | SHARK, n*n
  energy: Int16Array // meaningful for SHARK cells only
  breed: Uint16Array // breed timer, meaningful for FISH and SHARK cells
  processed: Uint8Array // scratch: cells already resolved this chronon
  nbr: Int32Array // scratch: a cell's 4 toroidal neighbor indices
  rng: () => number
  tick: number
  tickAccum: number
  tickMs: number
  lut: Uint8Array // 3×3 rgb: background, fish, shark
  field: ImageData | null // offscreen n×n image, rebuilt only when dirty
  buf: OffscreenCanvas | HTMLCanvasElement | null
  dirty: boolean // field needs a pixel rebuild (a chronon ran / colors edited); else just re-blit (#273)
  fishCount: number
  sharkCount: number
}

// ── color ─────────────────────────────────────────────────────────────────

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** 3-entry rgb LUT indexed by cell kind (EMPTY/FISH/SHARK). */
export function buildLut(cfg: WaTorConfig): Uint8Array {
  const lut = new Uint8Array(3 * 3)
  const put = (i: number, hex: string) => {
    const [r, g, b] = hexRgb(hex)
    lut[i * 3] = r; lut[i * 3 + 1] = g; lut[i * 3 + 2] = b
  }
  put(EMPTY, cfg.palette.background)
  put(FISH, cfg.palette.fish)
  put(SHARK, cfg.palette.shark)
  return lut
}

// ── build ─────────────────────────────────────────────────────────────────

function countPopulation(state: WaTorState): void {
  const { kind } = state
  let fish = 0, sharks = 0
  for (let i = 0; i < kind.length; i++) {
    const k = kind[i]
    if (k === FISH) fish++
    else if (k === SHARK) sharks++
  }
  state.fishCount = fish
  state.sharkCount = sharks
}

export function createWaTorState(cfg: WaTorConfig, w: number, h: number): WaTorState {
  const n = cfg.gridResolution
  const total = n * n
  const rng = mulberry32(cfg.seed | 0)
  const kind = new Uint8Array(total)
  const energy = new Int16Array(total)
  const breed = new Uint16Array(total)

  // Seed per-cell from independent draws (fish threshold, then shark threshold) rather
  // than placement-with-retry — simplest way to honor "fraction of the grid" exactly.
  // Breed timers start at a random offset (not 0) so the population doesn't pulse in
  // lockstep on its first few breeding cycles.
  for (let i = 0; i < total; i++) {
    const u = rng()
    if (u < cfg.initialFish) {
      kind[i] = FISH
      breed[i] = (rng() * cfg.fishBreedTime) | 0
    } else if (u < cfg.initialFish + cfg.initialSharks) {
      kind[i] = SHARK
      energy[i] = cfg.sharkStartEnergy
      breed[i] = (rng() * cfg.sharkBreedTime) | 0
    }
  }

  const state: WaTorState = {
    cfg, w, h, n,
    kind, energy, breed,
    processed: new Uint8Array(total),
    nbr: new Int32Array(4),
    rng,
    tick: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    lut: buildLut(cfg),
    field: null, buf: null, dirty: true,
    fishCount: 0, sharkCount: 0,
  }
  countPopulation(state)
  return state
}

// ── simulation ──────────────────────────────────────────────────────────────

function neighborsInto(out: Int32Array, idx: number, n: number): void {
  const row = (idx / n) | 0
  const col = idx % n
  for (let k = 0; k < 4; k++) {
    const c = (col + DX[k] + n) % n
    const r = (row + DY[k] + n) % n
    out[k] = r * n + c
  }
}

/** One chronon: every creature acts once, in a random order, against the live grid. */
export function step(state: WaTorState): void {
  const { cfg, n, kind, energy, breed, rng, processed, nbr } = state
  const total = n * n
  state.tick++
  state.dirty = true // a chronon mutates the grid → the field needs a pixel rebuild this frame
  processed.fill(0)

  // This chronon's creature order — original cell indices, shuffled (Fisher–Yates).
  const order: number[] = []
  for (let i = 0; i < total; i++) if (kind[i] !== EMPTY) order.push(i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    ;[order[i], order[j]] = [order[j], order[i]]
  }

  for (const idx of order) {
    // Already resolved: either eaten by an earlier-acting shark, or a newborn now
    // occupies this cell (a parent's vacated slot). Either way, not this creature's turn.
    if (processed[idx]) continue
    const k = kind[idx]
    if (k === EMPTY) continue // defensive

    neighborsInto(nbr, idx, n)

    if (k === FISH) {
      let emptyCount = 0
      for (let d = 0; d < 4; d++) if (kind[nbr[d]] === EMPTY) emptyCount++
      const nextBreed = breed[idx] + 1
      if (emptyCount === 0) {
        // No room to move — and thus no room to breed into. Just age.
        breed[idx] = nextBreed
        processed[idx] = 1
        continue
      }
      let pick = (rng() * emptyCount) | 0
      let dest = idx
      for (let d = 0; d < 4; d++) {
        if (kind[nbr[d]] === EMPTY) {
          if (pick === 0) { dest = nbr[d]; break }
          pick--
        }
      }
      kind[dest] = FISH
      if (nextBreed >= cfg.fishBreedTime) {
        // Breed: the fish moves on, and leaves a fresh child in the vacated cell.
        breed[dest] = 0
        kind[idx] = FISH
        breed[idx] = 0
      } else {
        breed[dest] = nextBreed
        kind[idx] = EMPTY
      }
      processed[idx] = 1
      processed[dest] = 1
      continue
    }

    // SHARK: eat an adjacent fish if any exist, else move to a random empty neighbor,
    // else stay put. Either way it pays 1 energy of upkeep and dies at 0.
    let fishCount = 0, emptyCount = 0
    for (let d = 0; d < 4; d++) {
      const v = kind[nbr[d]]
      if (v === FISH) fishCount++
      else if (v === EMPTY) emptyCount++
    }
    let dest = idx
    let ate = false
    if (fishCount > 0) {
      let pick = (rng() * fishCount) | 0
      for (let d = 0; d < 4; d++) {
        if (kind[nbr[d]] === FISH) {
          if (pick === 0) { dest = nbr[d]; break }
          pick--
        }
      }
      ate = true
    } else if (emptyCount > 0) {
      let pick = (rng() * emptyCount) | 0
      for (let d = 0; d < 4; d++) {
        if (kind[nbr[d]] === EMPTY) {
          if (pick === 0) { dest = nbr[d]; break }
          pick--
        }
      }
    }

    const nextBreed = breed[idx] + 1
    // Dewdney's original describes shark satiation as a hunger clock that resets on
    // eating, not an unbounded energy pool — "resetting the time since a shark last
    // ate to zero." We keep the tunable `fishEnergy` (how much a meal refills) but cap
    // the refill at `sharkStartEnergy`, so a shark can't stockpile energy across many
    // easy meals and become effectively immortal; a well-fed shark is at most as
    // durable as a newborn one. This is the mechanism that makes shark survival track
    // local prey scarcity — without the cap, an early abundance of fish lets sharks
    // breed on schedule forever and the shark population explodes before it can ever
    // feel scarcity, wiping out the fish in a single uncontrolled boom.
    const gained = ate ? Math.min(cfg.sharkStartEnergy, energy[idx] + cfg.fishEnergy) : energy[idx]
    const nextEnergy = gained - 1

    if (nextEnergy <= 0) {
      // Starved — removed from the grid (the eaten fish, if any, is already gone too).
      kind[idx] = EMPTY
      kind[dest] = EMPTY
      processed[idx] = 1
      processed[dest] = 1
      continue
    }

    kind[dest] = SHARK
    if (nextBreed >= cfg.sharkBreedTime && dest !== idx) {
      // Breed: the shark moves on, and leaves a fresh child in the vacated cell.
      // Canonical Wa-Tor rule — the child starts at the fixed starting energy (not a
      // split of the parent's); the parent simply keeps its own post-upkeep energy.
      breed[dest] = 0
      energy[dest] = nextEnergy
      kind[idx] = SHARK
      energy[idx] = cfg.sharkStartEnergy
      breed[idx] = 0
    } else {
      breed[dest] = nextBreed
      energy[dest] = nextEnergy
      if (dest !== idx) kind[idx] = EMPTY
    }
    processed[idx] = 1
    processed[dest] = 1
  }

  countPopulation(state)
}

export function advance(state: WaTorState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
  }
}

// ── rendering ─────────────────────────────────────────────────────────────

function ensureBuf(state: WaTorState): void {
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

export function render(state: WaTorState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, n, kind, lut } = state
  ensureBuf(state)
  // Only rebuild the n×n field when it actually changed (a chronon ran / colors edited);
  // otherwise the offscreen buffer already holds it and we just re-blit it (#273).
  if (state.dirty) {
    const img = state.field!
    const data = img.data
    for (let i = 0; i < n * n; i++) {
      const o = kind[i] * 3
      const p = i * 4
      data[p] = lut[o]; data[p + 1] = lut[o + 1]; data[p + 2] = lut[o + 2]; data[p + 3] = 255
    }
    const bctx = (state.buf as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
    bctx.putImageData(img, 0, 0)
    state.dirty = false
  }

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(state.buf as unknown as CanvasImageSource, 0, 0, n, n, 0, 0, w, h)
  ctx.imageSmoothingEnabled = true

  if (cfg.showHud) {
    ctx.globalAlpha = 0.9
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillStyle = cfg.palette.fish
    const fishLabel = `fish ${state.fishCount}`
    ctx.fillText(fishLabel, 14, 14)
    ctx.fillStyle = cfg.palette.shark
    ctx.fillText(`shark ${state.sharkCount}`, 14 + ctx.measureText(fishLabel).width + 16, 14)
    ctx.globalAlpha = 1
  }
}
