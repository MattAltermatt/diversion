// sim.ts — the Particle Life simulation. Structure-of-arrays over preallocated
// typed arrays, fixed timestep, ZERO per-frame allocation. Fully deterministic for
// a given seed + config: seeded positions & species, a seed-derived interaction
// matrix, and the beta-model pair force integrated with semi-implicit Euler.
import { mulberry32 } from '../../framework/rng'
import { ParticleGrid } from './grid'
import { buildMatrix, type Symmetry } from './matrix'
import { force, forceCurveId, type ForceCurve } from './force'

export const WORLD_W = 1280
export const WORLD_H = 800
const DT = 1 / 60 // fixed step — `speed` runs N steps/frame, never changes the outcome

export interface SimConfig {
  count: number
  colors: number
  seed: number
  rMax: number
  beta: number
  forceScale: number
  friction: number
  symmetry: Symmetry
  attractBias: number
  forceCurve?: ForceCurve // #206; defaults to Standard when absent
}

export interface Sim {
  cfg: SimConfig
  n: number
  px: Float32Array
  py: Float32Array
  vx: Float32Array
  vy: Float32Array
  type: Uint8Array
  matrix: Float32Array
  grid: ParticleGrid
}

export function createSim(cfg: SimConfig): Sim {
  const n = cfg.count
  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const type = new Uint8Array(n)
  // position/species stream is salted apart from the matrix stream so the soup and
  // the rules vary independently across seeds.
  const rng = mulberry32((cfg.seed ^ 0x51ed270b) >>> 0)
  for (let i = 0; i < n; i++) {
    px[i] = rng() * WORLD_W
    py[i] = rng() * WORLD_H
    type[i] = Math.floor(rng() * cfg.colors)
  }
  const matrix = buildMatrix(cfg.colors, cfg.seed, cfg.symmetry, cfg.attractBias)
  const grid = new ParticleGrid(WORLD_W, WORLD_H, cfg.rMax, n)
  return { cfg, n, px, py, vx, vy, type, matrix, grid }
}

/** Recompute the matrix in place (live-apply for symmetry / attractBias / seed). */
export function rebuildMatrix(sim: Sim): void {
  sim.matrix = buildMatrix(sim.cfg.colors, sim.cfg.seed, sim.cfg.symmetry, sim.cfg.attractBias)
}

/** Recreate the grid when the interaction radius (= cell size) changes. */
export function rebuildGrid(sim: Sim): void {
  sim.grid = new ParticleGrid(WORLD_W, WORLD_H, sim.cfg.rMax, sim.n)
}

export function stepSim(sim: Sim): void {
  const { px, py, vx, vy, type, matrix, grid, n, cfg } = sim
  const rMax = cfg.rMax, beta = cfg.beta, nColors = cfg.colors
  const curve = forceCurveId(cfg.forceCurve ?? 'Standard')
  const forceMul = rMax * cfg.forceScale
  const frictionFactor = Math.pow(0.5, DT / cfg.friction)

  grid.rebuild(px, py, n)
  const outIdx = grid.outIdx, outDX = grid.outDX, outDY = grid.outDY

  // pass 1: accumulate forces from current positions → new velocities. Positions are
  // untouched here, so every particle sees the same snapshot (order-independent).
  for (let i = 0; i < n; i++) {
    const ti = type[i]
    const rowBase = ti * nColors
    let fx = 0, fy = 0
    const cnt = grid.neighborsWithin(px, py, i, rMax)
    for (let k = 0; k < cnt; k++) {
      const j = outIdx[k]
      const dx = outDX[k], dy = outDY[k]
      const dist = Math.sqrt(dx * dx + dy * dy)
      const q = dist / rMax
      const a = matrix[rowBase + type[j]]
      const f = force(q, a, beta, curve)
      const inv = f / dist
      fx += dx * inv
      fy += dy * inv
    }
    vx[i] = vx[i] * frictionFactor + fx * forceMul * DT
    vy[i] = vy[i] * frictionFactor + fy * forceMul * DT
  }

  // pass 2: advance positions with the new velocities, wrap toroidally.
  for (let i = 0; i < n; i++) {
    let x = px[i] + vx[i] * DT
    let y = py[i] + vy[i] * DT
    x %= WORLD_W; if (x < 0) x += WORLD_W
    y %= WORLD_H; if (y < 0) y += WORLD_H
    px[i] = x
    py[i] = y
  }
}
