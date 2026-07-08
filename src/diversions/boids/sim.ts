// sim.ts — the deterministic flock. Fixed 760×460 virtual world (cover-fit to the
// canvas at render time, like flock-vs-hunter); dispersed seeded spawn; per-frame
// variable-dt integration (nothing here breeds or needs tick-exact replay, so a
// fixed-step accumulator isn't required — just clamp dt upstream against tab-away
// spikes, done in index.ts). `count`/`seed`/`edgeMode`'s toroidal-vs-clipped grid
// shape are the only truly structural knobs (framework re-setup); everything else
// — weights, perception, maxSpeed, predator, color, trails — applies live by
// swapping `cfg` in place (see index.ts's `update`).
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'
import { flockAccel, type FlockParams } from './steering'
import type { BoidsConfig } from './schema'

// World sized so the default 400 boids @ 50px perception average ~9 neighbors —
// the density flocking needs to cohere into a murmuration instead of a diffuse gas
// (see gotcha-force-curve-needs-wide-rmax sibling: too few neighbors → no flock).
export const WORLD_W = 760
export const WORLD_H = 460

const MAX_NEIGHBORS = 24
const MAX_ACCEL = 900 // world units/s² — safety clamp on the summed steering force
const EDGE_MARGIN = 70 // world units from a 'steer' edge where the turn-back begins
const EDGE_ACCEL = 260 // world units/s² of turn-back force right at the edge
const FEAR_RADIUS = 100
const FEAR_WEIGHT = 2.4
const PRED_WANDER_RATE = 0.12 // Hz-ish — how quickly the predator's noise heading drifts
const PRED_FLOCK_PULL = 0.3 // 0..1 blend toward the flock centroid vs pure wander

export interface Flock {
  cfg: BoidsConfig
  n: number
  px: Float32Array; py: Float32Array; vx: Float32Array; vy: Float32Array
  predX: number; predY: number; predVX: number; predVY: number
  predT: number
  hash: SpatialHash
  predNoise: (x: number, y: number, z: number) => number
  _neigh: number[] // reused neighbor-index scratch (no per-tick alloc)
  _fp: FlockParams // reused flock-params scratch (no per-boid alloc)
  _acc: Float32Array // reused [ax,ay] accel scratch (no per-boid alloc)
}

const wrapPos = (v: number, hi: number) => ((v % hi) + hi) % hi

export function createFlock(cfg: BoidsConfig): Flock {
  const rngSpawn = mulberry32((cfg.seed ^ 0x1a2b3c4d) >>> 0)
  const n = cfg.count
  const px = new Float32Array(n), py = new Float32Array(n)
  const vx = new Float32Array(n), vy = new Float32Array(n)
  // Dispersed spawn: boids start scattered across the full world with random
  // headings at sub-max speed, so a murmuration must SELF-ORGANIZE from this —
  // proving the flocking is emergent, not imposed by a clumped start.
  for (let i = 0; i < n; i++) {
    px[i] = rngSpawn() * WORLD_W
    py[i] = rngSpawn() * WORLD_H
    const a = rngSpawn() * Math.PI * 2
    const sp = cfg.maxSpeed * (0.4 + rngSpawn() * 0.4)
    vx[i] = Math.cos(a) * sp
    vy[i] = Math.sin(a) * sp
  }
  return {
    cfg, n, px, py, vx, vy,
    predX: rngSpawn() * WORLD_W, predY: rngSpawn() * WORLD_H,
    predVX: 0, predVY: 0, predT: 0,
    hash: new SpatialHash(WORLD_W, WORLD_H, Math.max(cfg.perception, 20), cfg.edgeMode === 'wrap', Math.max(n, 8)),
    predNoise: (x) => Math.sin(x) * 0.6 + Math.sin(x * 1.618 + 1.7) * 0.4, // smooth, bounded, deterministic
    _neigh: [],
    _fp: { separationW: 0, alignmentW: 0, cohesionW: 0, fearW: FEAR_WEIGHT, fearRadius: FEAR_RADIUS },
    _acc: new Float32Array(2),
  }
}

function stepPredator(s: Flock, dtSeconds: number, wrap: boolean): void {
  const cfg = s.cfg
  s.predT += dtSeconds
  let cx = 0, cy = 0
  for (let i = 0; i < s.n; i++) { cx += s.px[i]; cy += s.py[i] }
  cx /= s.n; cy /= s.n

  const wanderAngle = s.predNoise(s.predT * PRED_WANDER_RATE * Math.PI * 2, 0, 0) * Math.PI * 2
  const wx = Math.cos(wanderAngle), wy = Math.sin(wanderAngle)
  const toLen = Math.hypot(cx - s.predX, cy - s.predY) || 1
  const tx = (cx - s.predX) / toLen, ty = (cy - s.predY) / toLen
  let dirX = wx * (1 - PRED_FLOCK_PULL) + tx * PRED_FLOCK_PULL
  let dirY = wy * (1 - PRED_FLOCK_PULL) + ty * PRED_FLOCK_PULL
  const dirLen = Math.hypot(dirX, dirY) || 1
  dirX /= dirLen; dirY /= dirLen

  s.predVX = dirX * cfg.predatorSpeed
  s.predVY = dirY * cfg.predatorSpeed
  let nx = s.predX + s.predVX * dtSeconds
  let ny = s.predY + s.predVY * dtSeconds
  if (wrap) { nx = wrapPos(nx, WORLD_W); ny = wrapPos(ny, WORLD_H) }
  else { nx = Math.min(WORLD_W, Math.max(0, nx)); ny = Math.min(WORLD_H, Math.max(0, ny)) }
  s.predX = nx; s.predY = ny
}

export function stepFlock(s: Flock, dtSeconds: number): void {
  const cfg = s.cfg
  const wrap = cfg.edgeMode === 'wrap'
  s.hash.configure(Math.max(cfg.perception, 20), wrap)
  s.hash.rebuild(s.px, s.py, s.n)

  if (cfg.predator) stepPredator(s, dtSeconds, wrap)

  const fp = s._fp
  fp.separationW = cfg.separation; fp.alignmentW = cfg.alignment; fp.cohesionW = cfg.cohesion

  for (let i = 0; i < s.n; i++) {
    s._neigh.length = 0
    s.hash.neighborsWithin(s.px, s.py, i, cfg.perception, MAX_NEIGHBORS, s._neigh)
    flockAccel(s.px, s.py, s.vx, s.vy, i, s._neigh, fp, WORLD_W, WORLD_H, wrap, s.predX, s.predY, cfg.predator, s._acc)
    let ax = s._acc[0], ay = s._acc[1]

    if (!wrap) {
      const x = s.px[i], y = s.py[i]
      if (x < EDGE_MARGIN) ax += ((EDGE_MARGIN - x) / EDGE_MARGIN) * EDGE_ACCEL
      else if (x > WORLD_W - EDGE_MARGIN) ax -= ((x - (WORLD_W - EDGE_MARGIN)) / EDGE_MARGIN) * EDGE_ACCEL
      if (y < EDGE_MARGIN) ay += ((EDGE_MARGIN - y) / EDGE_MARGIN) * EDGE_ACCEL
      else if (y > WORLD_H - EDGE_MARGIN) ay -= ((y - (WORLD_H - EDGE_MARGIN)) / EDGE_MARGIN) * EDGE_ACCEL
    }

    const am = Math.hypot(ax, ay)
    if (am > MAX_ACCEL) { ax = (ax / am) * MAX_ACCEL; ay = (ay / am) * MAX_ACCEL }

    let nvx = s.vx[i] + ax * dtSeconds
    let nvy = s.vy[i] + ay * dtSeconds
    const sp = Math.hypot(nvx, nvy)
    if (sp > cfg.maxSpeed) { nvx = (nvx / sp) * cfg.maxSpeed; nvy = (nvy / sp) * cfg.maxSpeed }
    s.vx[i] = nvx; s.vy[i] = nvy

    let nx = s.px[i] + nvx * dtSeconds
    let ny = s.py[i] + nvy * dtSeconds
    if (wrap) { nx = wrapPos(nx, WORLD_W); ny = wrapPos(ny, WORLD_H) }
    else { nx = Math.min(WORLD_W, Math.max(0, nx)); ny = Math.min(WORLD_H, Math.max(0, ny)) }
    s.px[i] = nx; s.py[i] = ny
  }
}

/** Cheap order-independent state hash for the determinism test. */
export function hashState(s: Flock): string {
  let h = 2166136261 >>> 0
  const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0 }
  for (let i = 0; i < s.n; i++) {
    mix(s.px[i] * 1000); mix(s.py[i] * 1000); mix(s.vx[i] * 1000); mix(s.vy[i] * 1000)
  }
  mix(s.predX * 1000); mix(s.predY * 1000)
  return (h >>> 0).toString(16)
}
