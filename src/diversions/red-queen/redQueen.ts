// redQueen.ts — host–parasite matching-allele coevolution, well-mixed, discrete
// replicator dynamics with a mutation floor. Pure (no DOM-instantiating imports at
// module top) so it unit-tests headless. Two frequency vectors over G genotypes on
// a ring evolve each generation; the sim is fully deterministic given the seeded
// initial frequencies. Rendered as a scrolling waterfall built in a fixed-size
// offscreen history canvas that is stretched to fill, so a resize never restarts.

import { mulberry32 } from '../../framework/rng'
import type { RedQueenConfig } from './schema'

const HISTORY_W = 360 // waterfall columns (time axis); fixed → viewport-independent
const HISTORY_H = 240 // waterfall rows; top half hosts, bottom half parasites

export interface RedQueenState {
  cfg: RedQueenConfig
  w: number
  h: number
  g: number // genotype count
  host: Float64Array // freq per genotype, sums to 1
  para: Float64Array
  kernel: Float64Array // g×g match kernel K(p,h) ∈ {0,1}
  colors: Uint8Array // g×3 genotype rgb
  rng: () => number
  gen: number
  tickAccum: number
  tickMs: number
  // waterfall
  hist: OffscreenCanvas | HTMLCanvasElement | null
  histCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null
  col: number // next column to write (ring buffer)
}

// ── colour ──────────────────────────────────────────────────────────────────

function hslToRgb(hh: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (hh < 60) { r = c; g = x } else if (hh < 120) { r = x; g = c }
  else if (hh < 180) { g = c; b = x } else if (hh < 240) { g = x; b = c }
  else if (hh < 300) { r = x; b = c } else { r = c; b = x }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Palette → hue for genotype i of g. */
function hueFor(palette: RedQueenConfig['palette'], i: number, g: number): number {
  const t = g > 1 ? i / (g - 1) : 0
  switch (palette) {
    case 'warm-cool': return 30 + t * 240 // amber → violet
    case 'sunset': return 350 - t * 90 + (t < 0 ? 360 : 0) // magenta → gold, wrapping high
    case 'ice': return 170 + t * 90 // teal → blue-violet
    default: return t * 330 // full spectrum
  }
}

export function buildColors(cfg: RedQueenConfig): Uint8Array {
  const g = cfg.genotypeCount
  const out = new Uint8Array(g * 3)
  for (let i = 0; i < g; i++) {
    const hue = ((hueFor(cfg.palette, i, g) % 360) + 360) % 360
    const [r, gg, b] = hslToRgb(hue, cfg.saturation, 0.55)
    out[i * 3] = r; out[i * 3 + 1] = gg; out[i * 3 + 2] = b
  }
  return out
}

// ── genetics ────────────────────────────────────────────────────────────────

/** Ring distance between two genotypes (wraps around the genotype circle). */
function ringDist(a: number, b: number, g: number): number {
  const d = Math.abs(a - b)
  return Math.min(d, g - d)
}

/** K(p,h)=1 when parasite p infects host h (within matchBreadth on the ring). */
export function buildKernel(cfg: RedQueenConfig): Float64Array {
  const g = cfg.genotypeCount
  const k = new Float64Array(g * g)
  for (let p = 0; p < g; p++)
    for (let h = 0; h < g; h++)
      k[p * g + h] = ringDist(p, h, g) <= cfg.matchBreadth ? 1 : 0
  return k
}

function normalize(v: Float64Array): void {
  let s = 0
  for (let i = 0; i < v.length; i++) s += v[i]
  if (s <= 0) { v.fill(1 / v.length); return }
  for (let i = 0; i < v.length; i++) v[i] /= s
}

export function createRedQueenState(cfg: RedQueenConfig, w: number, h: number): RedQueenState {
  const g = cfg.genotypeCount
  const rng = mulberry32(cfg.seed | 0)
  const host = new Float64Array(g)
  const para = new Float64Array(g)
  // Random asymmetric start (a uniform start is a fixed point that never moves).
  for (let i = 0; i < g; i++) { host[i] = 0.15 + rng(); para[i] = 0.15 + rng() }
  normalize(host); normalize(para)
  return {
    cfg, w, h, g, host, para,
    kernel: buildKernel(cfg),
    colors: buildColors(cfg),
    rng,
    gen: 0, tickAccum: 0, tickMs: 1000 / cfg.simSpeed,
    hist: null, histCtx: null, col: 0,
  }
}

// ── one generation ────────────────────────────────────────────────────────────

/** Advance both populations one generation of replicator dynamics + mutation floor.
 *  Hosts: fitness falls with how much of the parasite pool can infect them (rare =
 *  safe). Parasites: fitness rises with how much of the host pool they can infect
 *  (match the common type). exp() keeps fitness positive and makes selection smooth. */
export function step(state: RedQueenState): void {
  const { g, host, para, kernel, cfg } = state
  state.gen++
  const mu = cfg.mutationRate

  // Infection pressure on each host genotype h = Σ_p para[p]·K(p,h).
  // Parasite success for each genotype p = Σ_h host[h]·K(p,h).
  const nextHost = new Float64Array(g)
  const nextPara = new Float64Array(g)
  for (let h = 0; h < g; h++) {
    let inf = 0
    for (let p = 0; p < g; p++) inf += para[p] * kernel[p * g + h]
    nextHost[h] = host[h] * Math.exp(-cfg.virulence * inf)
  }
  for (let p = 0; p < g; p++) {
    let succ = 0
    for (let h = 0; h < g; h++) succ += host[h] * kernel[p * g + h]
    nextPara[p] = para[p] * Math.exp(cfg.parasiteSelection * succ)
  }
  normalize(nextHost); normalize(nextPara)

  // Mutation floor: blend a flat trickle of every genotype so none goes extinct and
  // the chase never locks up. (1-μ)·selected + μ·uniform.
  const floor = mu / g
  for (let i = 0; i < g; i++) {
    host[i] = (1 - mu) * nextHost[i] + floor
    para[i] = (1 - mu) * nextPara[i] + floor
  }
  normalize(host); normalize(para)
}

export function advance(state: RedQueenState, dt: number): void {
  state.tickMs = 1000 / state.cfg.simSpeed
  state.tickAccum += dt
  let budget = 8
  while (state.tickAccum >= state.tickMs && budget-- > 0) {
    state.tickAccum -= state.tickMs
    step(state)
    writeColumn(state)
  }
}

// ── waterfall ────────────────────────────────────────────────────────────────

function ensureHist(state: RedQueenState): void {
  if (state.hist && state.histCtx) return
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(HISTORY_W, HISTORY_H)
    : (() => { const c = document.createElement('canvas'); c.width = HISTORY_W; c.height = HISTORY_H; return c })()
  state.hist = canvas as OffscreenCanvas
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as OffscreenCanvasRenderingContext2D
  ctx.fillStyle = state.cfg.background
  ctx.fillRect(0, 0, HISTORY_W, HISTORY_H)
  state.histCtx = ctx
}

/** Draw the current frequencies as one vertical column in the history ring buffer:
 *  hosts stacked down the top half, parasites down the bottom half. */
function writeColumn(state: RedQueenState): void {
  ensureHist(state)
  const ctx = state.histCtx!
  const { g, host, para, colors, cfg } = state
  const x = state.col
  const halfH = HISTORY_H / 2
  const gap = 2 // background sliver between the two bands

  ctx.fillStyle = cfg.background
  ctx.fillRect(x, 0, 1, HISTORY_H)

  // Host band: top → divider.
  let y = 0
  for (let i = 0; i < g; i++) {
    const hh = host[i] * (halfH - gap)
    ctx.fillStyle = `rgb(${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]})`
    ctx.fillRect(x, y, 1, Math.ceil(hh))
    y += hh
  }
  // Parasite band: divider → bottom.
  y = halfH + gap
  for (let i = 0; i < g; i++) {
    const hh = para[i] * (halfH - gap)
    ctx.fillStyle = `rgb(${colors[i * 3]},${colors[i * 3 + 1]},${colors[i * 3 + 2]})`
    ctx.fillRect(x, y, 1, Math.ceil(hh))
    y += hh
  }

  state.col = (state.col + 1) % HISTORY_W
}

// ── rendering ────────────────────────────────────────────────────────────────

export function render(state: RedQueenState, ctx: CanvasRenderingContext2D): void {
  ensureHist(state)
  const { w, h, cfg } = state
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  // Draw the ring buffer so the newest column sits at the right edge and time scrolls
  // left. Source [col..W] → left part, [0..col] → right part.
  const src = state.hist as unknown as CanvasImageSource
  const col = state.col
  const rightW = HISTORY_W - col
  ctx.imageSmoothingEnabled = true
  const scaleX = w / HISTORY_W
  // older half (already-written columns to the right of the write head)
  ctx.drawImage(src, col, 0, rightW, HISTORY_H, 0, 0, rightW * scaleX, h)
  // newer half (columns from 0..col, the most recent)
  ctx.drawImage(src, 0, 0, col, HISTORY_H, rightW * scaleX, 0, col * scaleX, h)

  // Divider line between the two bands.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2)
  ctx.stroke()

  if (cfg.showLabels) {
    ctx.font = '12px system-ui, sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fillText('Hosts', 12, 10)
    ctx.textBaseline = 'bottom'
    ctx.fillText('Parasites', 12, h - 10)
  }
}
