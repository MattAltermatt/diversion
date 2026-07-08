// sim.ts — the bare Vicsek model (Vicsek et al. 1995). Fixed 1/60 timestep,
// toroidal square arena. Alignment-only: NO separation, NO cohesion — do not add
// them, that's a different model (Reynolds boids / flock-vs-hunter's steering).
//
// Every step, each particle's new heading is the mean heading of its neighbours
// within `neighborRadius` (including itself), perturbed by uniform noise in
// [-η/2, η/2]. Constant speed. That's the whole rule. The update is SYNCHRONOUS —
// new headings are derived from the OLD heading field, never from headings already
// updated this step — so a scratch buffer holds the next headings until the whole
// pass completes.
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'

export const DT = 1 / 60
const MAX_NEIGHBORS = 40 // cap on the per-particle neighbour sum (perf safety, not physics)

export interface SimConfig {
  particleCount: number
  neighborRadius: number
  worldSize: number
  seed: number
  noise: number // live-editable
  speed: number // live-editable
}

// Test-only default fixture. Player-facing defaults live in schema.ts.
export const DEFAULT_SIM_CONFIG: SimConfig = {
  particleCount: 300, neighborRadius: 20, worldSize: 300, seed: 42, noise: 1.1, speed: 60,
}

export interface Flock {
  cfg: SimConfig
  n: number
  worldSize: number
  px: Float32Array
  py: Float32Array
  theta: Float32Array
  newTheta: Float32Array // scratch: next headings, synchronous update
  rng: () => number
  hash: SpatialHash
  _neigh: number[] // reused neighbour-index scratch (no per-tick alloc)
  orderParam: number // |mean unit heading vector| — 0 (gas) .. 1 (one flock)
}

const wrap = (v: number, hi: number) => ((v % hi) + hi) % hi

export function createFlock(cfg: SimConfig): Flock {
  const rng = mulberry32(cfg.seed >>> 0)
  const n = cfg.particleCount
  const s: Flock = {
    cfg, n, worldSize: cfg.worldSize,
    px: new Float32Array(n), py: new Float32Array(n),
    theta: new Float32Array(n), newTheta: new Float32Array(n),
    rng,
    // cell size == neighbourRadius so the 3×3 wrap block fully covers a query of
    // that radius (mirrors flock-vs-hunter's spatial-hash convention).
    hash: new SpatialHash(cfg.worldSize, cfg.worldSize, cfg.neighborRadius, n),
    _neigh: [],
    orderParam: 0,
  }
  // Dispersed spawn with random headings — order must SELF-ORGANIZE, not be
  // imposed by a pre-aligned start.
  for (let i = 0; i < n; i++) {
    s.px[i] = rng() * cfg.worldSize
    s.py[i] = rng() * cfg.worldSize
    s.theta[i] = rng() * TWO_PI - Math.PI
  }
  computeOrderParameter(s)
  return s
}

const TWO_PI = Math.PI * 2

export function computeOrderParameter(s: Flock): number {
  let sx = 0, sy = 0
  for (let i = 0; i < s.n; i++) { sx += Math.cos(s.theta[i]); sy += Math.sin(s.theta[i]) }
  s.orderParam = Math.hypot(sx, sy) / s.n
  return s.orderParam
}

export function stepFlock(s: Flock): void {
  const { noise, speed } = s.cfg
  const r = s.cfg.neighborRadius
  s.hash.rebuild(s.px, s.py, s.n)

  for (let i = 0; i < s.n; i++) {
    s._neigh.length = 0
    s.hash.neighborsWithin(s.px, s.py, i, r, MAX_NEIGHBORS, s._neigh)
    let sx = Math.cos(s.theta[i]), sy = Math.sin(s.theta[i]) // include self
    for (let k = 0; k < s._neigh.length; k++) {
      const j = s._neigh[k]
      sx += Math.cos(s.theta[j]); sy += Math.sin(s.theta[j])
    }
    const mean = Math.atan2(sy, sx)
    const perturb = (s.rng() - 0.5) * noise // uniform in [-η/2, η/2]
    s.newTheta[i] = mean + perturb
  }

  let ox = 0, oy = 0
  for (let i = 0; i < s.n; i++) {
    const th = s.newTheta[i]
    s.theta[i] = th
    s.px[i] = wrap(s.px[i] + Math.cos(th) * speed * DT, s.worldSize)
    s.py[i] = wrap(s.py[i] + Math.sin(th) * speed * DT, s.worldSize)
    ox += Math.cos(th); oy += Math.sin(th)
  }
  s.orderParam = Math.hypot(ox, oy) / s.n
}
