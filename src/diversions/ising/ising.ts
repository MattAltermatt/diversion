import { mulberry32 } from '../../framework/rng'
import type { IsingConfig } from './schema'

// Reseed policy (FIXED mode only): once the lattice has essentially frozen — an
// ABSOLUTE flip count at or below this over a run of sweeps — it has magnetized
// into a single domain and nothing more will happen, so re-noise it. Absolute (not
// grid-proportional) so a big screen with a slow domain still counts as "settled".
const FROZEN_FLIPS = 4
const FROZEN_SWEEPS = 90
// In SWEEP mode the hot end of every breath re-randomizes the lattice for free, so
// it never needs reseeding — only fixed sub-critical runs can get stuck.

type RGB = [number, number, number]

export type IsingState = {
  cfg: IsingConfig
  w: number
  h: number
  gw: number
  gh: number
  cell: number
  spins: Int8Array // ±1 per site, row-major
  accept: Float32Array // 2 spins × 5 neighbour-sums → flip probability at current T
  T: number // current temperature (units of J)
  elapsed: number // ms since setup, drives the sweep phase
  rng: () => number
  reseeds: number
  stepAccum: number // fractional sweeps carried between frames (speed < 1 → sweep every few frames)
  frozenRun: number // consecutive near-frozen sweeps (fixed mode)
  up: RGB
  down: RGB
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

/** Temperature at the given elapsed time for a sweep-mode breath: a smooth cosine
 *  from tempMin (cold) up to tempMax (hot) and back over `sweepPeriod` seconds. */
export function sweepTemperature(cfg: IsingConfig, elapsedMs: number): number {
  const phase = (elapsedMs / 1000 / cfg.sweepPeriod) * Math.PI * 2
  const u = 0.5 - 0.5 * Math.cos(phase) // 0 at start (cold) → 1 (hot) → 0
  return cfg.tempMin + (cfg.tempMax - cfg.tempMin) * u
}

/** The temperature the model should run at right now (fixed value, or the sweep). */
export function currentTemperature(st: IsingState): number {
  return st.cfg.tempMode === 'fixed'
    ? st.cfg.temperature
    : sweepTemperature(st.cfg, st.elapsed)
}

/** Rebuild the Metropolis acceptance table for the current T (and J, H). The energy
 *  change of flipping a spin s with neighbour-sum Σ (each ±1, so Σ ∈ {-4,-2,0,2,4})
 *  is ΔE = 2·s·(J·Σ + H). Accept if ΔE ≤ 0, else with probability exp(−ΔE/T). Only a
 *  handful of distinct ΔE exist, so this is a tiny 10-entry table refreshed per frame. */
export function buildAccept(st: IsingState, T: number): void {
  const { coupling: J, field: H } = st.cfg
  const acc = st.accept
  const invT = 1 / Math.max(1e-4, T)
  for (let sIdx = 0; sIdx < 2; sIdx++) {
    const s = sIdx === 1 ? 1 : -1
    for (let sumIdx = 0; sumIdx < 5; sumIdx++) {
      const sum = sumIdx * 2 - 4 // -4,-2,0,2,4
      const dE = 2 * s * (J * sum + H)
      acc[sIdx * 5 + sumIdx] = dE <= 0 ? 1 : Math.exp(-dE * invT)
    }
  }
}

function seedLattice(st: IsingState): void {
  const rng = mulberry32(st.cfg.seed + st.reseeds * 0x9e3779b1)
  const { spins } = st
  for (let i = 0; i < spins.length; i++) spins[i] = rng() < 0.5 ? -1 : 1
  st.rng = mulberry32((st.cfg.seed ^ 0x1b56c4e9) + st.reseeds * 0x85ebca77)
  st.frozenRun = 0
  st.needBlit = true
}

export function createIsingState(cfg: IsingConfig, w: number, h: number): IsingState {
  const cell = cfg.cellSize
  const gw = Math.max(2, Math.ceil(w / cell))
  const gh = Math.max(2, Math.ceil(h / cell))
  const off = document.createElement('canvas')
  off.width = gw
  off.height = gh
  const offCtx = off.getContext('2d')
  if (!offCtx) throw new Error('Ising requires a 2D context for its offscreen buffer')
  const st: IsingState = {
    cfg, w, h, gw, gh, cell,
    spins: new Int8Array(gw * gh),
    accept: new Float32Array(10),
    T: cfg.tempMode === 'fixed' ? cfg.temperature : cfg.tempMin,
    elapsed: 0,
    rng: mulberry32(cfg.seed),
    reseeds: 0,
    stepAccum: 0,
    frozenRun: 0,
    up: hexRGB(cfg.colorUp),
    down: hexRGB(cfg.colorDown),
    wall: hexRGB(cfg.boundaryColor),
    bg: hexRGB(cfg.background),
    off, offCtx, img: offCtx.createImageData(gw, gh),
    needBlit: true,
  }
  seedLattice(st)
  return st
}

/** Re-fit the lattice to a new display size. Like the other grid CAs, only a genuine
 *  change of cell dimensions reallocates + reseeds; a same-dimension reflow just re-blits
 *  (so a fullscreen toggle / drag doesn't restart the sim). */
export function resizeIsing(st: IsingState, w: number, h: number): void {
  const gw = Math.max(2, Math.ceil(w / st.cell))
  const gh = Math.max(2, Math.ceil(h / st.cell))
  st.w = w
  st.h = h
  if (gw === st.gw && gh === st.gh) { st.needBlit = true; return }
  st.gw = gw
  st.gh = gh
  st.spins = new Int8Array(gw * gh)
  st.off.width = gw
  st.off.height = gh
  st.img = st.offCtx.createImageData(gw, gh)
  seedLattice(st)
}

/** One Metropolis sweep: N random single-spin flip attempts on the toroidal lattice.
 *  Returns the number of spins actually flipped (for the freeze detector). Two RNG
 *  draws per attempt (site, then accept) regardless of branch → fully deterministic. */
export function stepIsing(st: IsingState): number {
  const { spins, gw, gh, accept, rng } = st
  const N = gw * gh
  let flips = 0
  for (let n = 0; n < N; n++) {
    const i = (rng() * N) | 0
    const x = i % gw
    const y = (i / gw) | 0
    const s = spins[i]
    const rowUp = (y === 0 ? gh - 1 : y - 1) * gw
    const rowDn = (y === gh - 1 ? 0 : y + 1) * gw
    const y0 = y * gw
    const sum = spins[y0 + (x === 0 ? gw - 1 : x - 1)]
             + spins[y0 + (x === gw - 1 ? 0 : x + 1)]
             + spins[rowUp + x]
             + spins[rowDn + x]
    const sIdx = s > 0 ? 1 : 0
    const sumIdx = (sum + 4) >> 1
    if (rng() < accept[sIdx * 5 + sumIdx]) { spins[i] = (-s) as -1 | 1; flips++ }
  }
  return flips
}

/** Mean spin over the lattice, in [-1, 1]. |value| is the magnetization: near 0 =
 *  disordered; near 1 = a single domain has taken over. */
export function magnetization(st: IsingState): number {
  const { spins } = st
  let sum = 0
  for (let i = 0; i < spins.length; i++) sum += spins[i]
  return sum / spins.length
}

/** Advance the model by `sweeps` Metropolis sweeps at the given temperature, refreshing
 *  the acceptance table first. `sweeps` is fractional: it accumulates across frames, so a
 *  speed below 1 fires one whole sweep only every few frames (the calm default) — the
 *  accumulator gates WHEN a sweep runs, never the sweep itself, so N frames at speed 1/N
 *  are bit-identical to one frame at speed 1. In fixed mode, re-noise a lattice that has
 *  frozen into a single domain (absolute flip threshold) so a sub-critical run never
 *  dead-ends. */
export function advanceIsing(st: IsingState, T: number, sweeps: number): void {
  st.T = T
  buildAccept(st, T)
  st.stepAccum += sweeps
  let ran = 0
  // Epsilon so 0.1 accumulated ten times (float-sums to 0.9999999999999999) still fires
  // on the tenth frame, not the eleventh — keeps the long-run rate exactly `speed`/frame.
  while (st.stepAccum >= 1 - 1e-9) {
    st.stepAccum -= 1
    const flips = stepIsing(st)
    ran++
    if (st.cfg.tempMode === 'fixed') {
      st.frozenRun = flips <= FROZEN_FLIPS ? st.frozenRun + 1 : 0
      if (st.frozenRun >= FROZEN_SWEEPS) {
        st.reseeds++
        seedLattice(st)
      }
    }
  }
  // Only a frame that actually stepped the lattice changed the picture — skip the blit
  // on the fractional in-between frames so a slow speed doesn't repaint an identical board.
  if (ran > 0) st.needBlit = true
}

/** Rebuild the colour cache from config (a live palette / mode edit — keeps the lattice). */
export function applyColors(st: IsingState, cfg: IsingConfig): void {
  st.up = hexRGB(cfg.colorUp)
  st.down = hexRGB(cfg.colorDown)
  st.wall = hexRGB(cfg.boundaryColor)
  st.bg = hexRGB(cfg.background)
  st.needBlit = true
}

/** Paint the lattice into the offscreen buffer and blit it, upscaled crisply
 *  (nearest-neighbour). With Domain walls on, a site whose right or bottom neighbour
 *  disagrees is drawn in the wall colour, outlining every domain boundary. */
export function renderIsing(st: IsingState, ctx: CanvasRenderingContext2D): void {
  const { img, spins, up, down, wall, gw, gh } = st
  const data = img.data
  const walls = st.cfg.boundary
  for (let y = 0; y < gh; y++) {
    const y0 = y * gw
    const rowDn = (y === gh - 1 ? 0 : y + 1) * gw
    for (let x = 0; x < gw; x++) {
      const i = y0 + x
      const s = spins[i]
      let c = s > 0 ? up : down
      if (walls) {
        const right = spins[y0 + (x === gw - 1 ? 0 : x + 1)]
        const downN = spins[rowDn + x]
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
