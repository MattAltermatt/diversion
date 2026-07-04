// pps.ts — the Primordial Particle System (Schmickl, Grabowski & Thenius 2016).
// One motion law: each tick a particle counts neighbours within a sense radius,
// splits them into those on its LEFT and RIGHT, and turns by
//     Δφ = α + β · N · sign(R − L),   N = L + R,
// then steps forward a fixed distance on a toroidal plane. With the right density
// the soup spontaneously condenses into wandering, dividing "cells". No RNG in the
// step (fully deterministic from the seed); a uniform spatial-hash grid tiles the
// torus so neighbour counts stay real-time at a few thousand particles.
import { mulberry32 } from '../../framework/rng'

/** Fixed square torus in world units — render cover-fits it to the canvas, so a
 *  resize only rescales the view and never regenerates the world. */
export const WORLD = 1000

/** Config with everything resolved to sim-space (radius in world units, angles in
 *  radians, velocity in world units per step). The schema does the % / degree math. */
export interface PPSConfig {
  particleCount: number
  radius: number // world units
  alpha: number // radians
  beta: number // radians
  velocity: number // world units per step
  seed: number
}

export interface PPSystem {
  n: number
  W: number
  H: number
  x: Float32Array
  y: Float32Array
  heading: Float32Array
  headingNext: Float32Array
  /** N (total neighbours within r) per particle from the last step — drives colour. */
  neighbors: Int32Array
  r: number
  alpha: number
  beta: number
  velocity: number
  // uniform grid (cells tile the world EXACTLY so cell-wrap matches world-wrap)
  cols: number
  rows: number
  cellW: number
  cellH: number
  head: Int32Array
  next: Int32Array
}

export function createSystem(cfg: PPSConfig): PPSystem {
  const n = Math.max(1, cfg.particleCount | 0)
  const W = WORLD, H = WORLD
  const rng = mulberry32(cfg.seed >>> 0)
  const x = new Float32Array(n), y = new Float32Array(n)
  const heading = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    x[i] = rng() * W
    y[i] = rng() * H
    heading[i] = rng() * Math.PI * 2
  }
  // floor → cells are ≥ r and divide the world evenly; ≥3 so the toroidal 3×3
  // block never revisits a cell (see the toroidal-spatial-hash gotcha).
  const cols = Math.max(3, Math.floor(W / cfg.radius))
  const rows = Math.max(3, Math.floor(H / cfg.radius))
  return {
    n, W, H, x, y, heading,
    headingNext: new Float32Array(n),
    neighbors: new Int32Array(n),
    r: cfg.radius, alpha: cfg.alpha, beta: cfg.beta, velocity: cfg.velocity,
    cols, rows, cellW: W / cols, cellH: H / rows,
    head: new Int32Array(cols * rows),
    next: new Int32Array(n),
  }
}

/** Advance one tick. Two synchronous phases (count from current state → apply) so
 *  the update is order-independent and deterministic. Zero per-frame allocation. */
export function stepSystem(s: PPSystem): void {
  const { n, W, H, x, y, heading, headingNext, neighbors, next, head } = s
  const r2 = s.r * s.r
  const cols = s.cols, rows = s.rows, cellW = s.cellW, cellH = s.cellH
  const alpha = s.alpha, beta = s.beta

  // rebuild grid
  head.fill(-1)
  for (let i = 0; i < n; i++) {
    let cx = Math.floor(x[i] / cellW); if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1
    let cy = Math.floor(y[i] / cellH); if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1
    const c = cy * cols + cx
    next[i] = head[c]; head[c] = i
  }

  // phase 1 — count L/R neighbours, compute next heading
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i], hi = heading[i]
    const hx = Math.cos(hi), hy = Math.sin(hi)
    let cx = Math.floor(xi / cellW); if (cx < 0) cx = 0; else if (cx >= cols) cx = cols - 1
    let cy = Math.floor(yi / cellH); if (cy < 0) cy = 0; else if (cy >= rows) cy = rows - 1
    let L = 0, R = 0
    for (let oy = -1; oy <= 1; oy++) {
      let gy = cy + oy; if (gy < 0) gy += rows; else if (gy >= rows) gy -= rows
      for (let ox = -1; ox <= 1; ox++) {
        let gx = cx + ox; if (gx < 0) gx += cols; else if (gx >= cols) gx -= cols
        let j = head[gy * cols + gx]
        while (j !== -1) {
          if (j !== i) {
            let dx = x[j] - xi, dy = y[j] - yi
            dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H) // min-image
            if (dx * dx + dy * dy <= r2) {
              // cross product heading × offset: >0 → neighbour on the LEFT.
              if (hx * dy - hy * dx > 0) L++; else R++
            }
          }
          j = next[j]
        }
      }
    }
    const Ntot = L + R
    neighbors[i] = Ntot
    headingNext[i] = hi + alpha + beta * Ntot * Math.sign(R - L)
  }

  // phase 2 — apply heading, step forward, wrap into [0, W)×[0, H)
  const v = s.velocity
  for (let i = 0; i < n; i++) {
    const h = headingNext[i]
    heading[i] = h
    let nx = x[i] + v * Math.cos(h)
    let ny = y[i] + v * Math.sin(h)
    nx -= W * Math.floor(nx / W)
    ny -= H * Math.floor(ny / H)
    x[i] = nx; y[i] = ny
  }
}

/** Mean neighbour count across all particles — the emergence metric (rises as the
 *  soup condenses into cells). Exposed for the headline test. */
export function meanNeighbors(s: PPSystem): number {
  let sum = 0
  for (let i = 0; i < s.n; i++) sum += s.neighbors[i]
  return sum / s.n
}
