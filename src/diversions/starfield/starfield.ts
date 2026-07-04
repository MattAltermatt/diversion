// Pure, framework-agnostic 3D star-warp simulation. No canvas/DOM imports so it
// stays unit-testable. The classic hyperspace effect: each star has a 3D position
// (x, y in a field box, z its distance ahead). Every frame z shrinks (we fly
// toward it); perspective projection sx = x/z·focal + cx makes a star sweep
// OUTWARD from the vanishing point and grow/brighten as it nears. When a star
// passes the camera (z ≤ ZNEAR) it respawns far away (z = ZFAR) at a fresh x/y.

import { mulberry32 } from '../../framework/rng'
import { hslToRgb, mix, type RGB } from '../../framework/color'
import type { StarfieldConfig } from './schema'

// Depth range a star travels: spawns at ZFAR, respawns once it crosses ZNEAR
// (just in front of the camera — never 0, so the 1/z projection stays finite).
export const ZFAR = 1
export const ZNEAR = 0.04
// Projected offset in px = (x / z) · (min(w,h) · FOCAL_K). Tuned so a spawning
// star (z = ZFAR) lands well inside the frame and streaks off-screen as z → ZNEAR.
const FOCAL_K = 0.36
// Roll angle gained per ms at roll = 1 (a slow ~1.3 min full rotation).
const ROLL_K = 0.00008

export interface Star {
  x: number; y: number; z: number // world position (x,y in the field box, z = depth)
  col: RGB                        // base colour, assigned at spawn
  sx: number; sy: number          // current projected screen position (CSS px)
  px: number; py: number          // previous projected position — the streak tail
  r: number                       // current radius / stroke width (px)
  bright: number                  // current brightness 0..1 (alpha)
}

export interface StarfieldState {
  cfg: StarfieldConfig
  w: number
  h: number
  rng: () => number
  stars: Star[]
  roll: number // accumulated roll angle (radians)
}

/** warpSpeed 0..1 → depth travelled per ms. Squared-ish low end gives a wide,
 *  gentle drift range before it ramps up into a fast warp. */
export function speedZ(warpSpeed: number): number {
  const w = Math.min(1, Math.max(0, warpSpeed))
  return 0.00004 + Math.pow(w, 1.7) * 0.0016
}

/** Base colour for a star, from the mode + a per-star random value t in [0,1). */
export function starColor(mode: StarfieldConfig['starColorMode'], t: number): RGB {
  if (mode === 'white') return { r: 255, g: 255, b: 255 }
  if (mode === 'spectrum') return hslToRgb(t * 360, 55, 78)
  // blue-white: cool blue → white stellar spectrum
  return mix({ r: 130, g: 178, b: 255 }, { r: 255, g: 255, b: 255 }, t)
}

/** Reset a star to a fresh far-away position with a new colour (seeded stream). */
export function respawn(star: Star, rng: () => number, cfg: StarfieldConfig): void {
  star.x = (rng() * 2 - 1) * cfg.spread
  star.y = (rng() * 2 - 1) * cfg.spread
  star.z = ZFAR
  star.col = starColor(cfg.starColorMode, rng())
}

function focalOf(w: number, h: number): number {
  return Math.min(w, h) * FOCAL_K
}

/** Project + derive brightness/radius for a star at its current z. Mutates the
 *  screen fields. `justSpawned` collapses the streak tail onto the head so a
 *  respawn never draws a long line from its old position. */
function project(star: Star, state: StarfieldState, focal: number, cos: number, sin: number, justSpawned: boolean): void {
  const cx = state.w / 2, cy = state.h / 2
  const rx = star.x * cos - star.y * sin
  const ry = star.x * sin + star.y * cos
  star.px = star.sx
  star.py = star.sy
  star.sx = cx + (rx / star.z) * focal
  star.sy = cy + (ry / star.z) * focal
  if (justSpawned) { star.px = star.sx; star.py = star.sy }
  const nearness = 1 - star.z / ZFAR // 0 far → ~1 near
  star.bright = Math.min(1, 0.14 + nearness * 1.05)
  star.r = state.cfg.starSize * (0.5 + nearness * 2.2)
}

export function createStarfieldState(cfg: StarfieldConfig, w: number, h: number): StarfieldState {
  const rng = mulberry32(cfg.seed >>> 0)
  const focal = focalOf(w, h)
  const cos = 1, sin = 0
  const state: StarfieldState = { cfg, w, h, rng, stars: [], roll: 0 }
  for (let i = 0; i < cfg.starCount; i++) {
    const star: Star = {
      x: (rng() * 2 - 1) * cfg.spread,
      y: (rng() * 2 - 1) * cfg.spread,
      // spread the initial depths so the field starts full, not all at ZFAR
      z: ZNEAR + rng() * (ZFAR - ZNEAR),
      col: starColor(cfg.starColorMode, rng()),
      sx: 0, sy: 0, px: 0, py: 0, r: 0, bright: 0,
    }
    project(star, state, focal, cos, sin, true)
    state.stars.push(star)
  }
  return state
}

/** Advance every star by dt (ms): fly forward, respawn past the camera, reproject.
 *  Pure w.r.t. the canvas — the caller reads sx/sy/px/py/r/bright to draw. */
export function stepFrame(state: StarfieldState, dtMs: number): void {
  const { cfg, stars, rng } = state
  const dz = speedZ(cfg.warpSpeed) * dtMs
  state.roll += cfg.roll * ROLL_K * dtMs
  const focal = focalOf(state.w, state.h)
  const cos = Math.cos(state.roll), sin = Math.sin(state.roll)
  for (const star of stars) {
    star.z -= dz
    let justSpawned = false
    if (star.z <= ZNEAR) { respawn(star, rng, cfg); justSpawned = true }
    project(star, state, focal, cos, sin, justSpawned)
    if (!Number.isFinite(star.sx) || !Number.isFinite(star.sy)) {
      respawn(star, rng, cfg)
      project(star, state, focal, cos, sin, true)
    }
  }
}
