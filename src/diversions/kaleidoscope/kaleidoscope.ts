import { mulberry32 } from '../../framework/rng'
import { PALETTE_NAMES, type KaleidoscopeConfig } from './schema'

const TAU = Math.PI * 2

// ── Palettes ──────────────────────────────────────────────────────────────
// Opaque jewel tones; each shape picks one and fills solid (no additive blend,
// so overlaps keep true hue instead of washing to white).
export const PALETTES: Record<(typeof PALETTE_NAMES)[number], string[]> = {
  jewel: ['#e63946', '#f4a261', '#ffd166', '#2a9d8f', '#4361ee', '#b5179e', '#7209b7'],
  sunset: ['#ff5400', '#ff9e00', '#ffd000', '#f72585', '#b5179e', '#7209b7', '#ff6d00'],
  ocean: ['#00b4d8', '#0077b6', '#48cae4', '#90e0ef', '#00f5d4', '#0096c7', '#023e8a'],
  forest: ['#588157', '#a3b18a', '#dda15e', '#bc6c25', '#606c38', '#e9c46a', '#2a9d8f'],
  candy: ['#ff70a6', '#ff9770', '#ffd670', '#70d6ff', '#e9ff70', '#aa00ff', '#ff5d8f'],
  fire: ['#f72585', '#ff4d00', '#ff8500', '#ffb700', '#ffd000', '#e63946', '#c1121f'],
}

// ── Folding math (the kaleidoscope core, shared with the tests) ─────────────
// N mirror pairs → 2N wedges of angle θ = π/N. Wedge i occupies [iθ,(i+1)θ].
// Even i is a pure rotation of the master wedge; odd i is its mirror, so every
// shared edge is a true mirror line and the disc has perfect N-fold dihedral
// symmetry. Returned as a canvas linear matrix [a,b,c,d] with x' = a·x + c·y,
// y' = b·x + d·y (no translation — the caller translates to the centre first).
export function sectorMatrix(i: number, symmetry: number): [number, number, number, number] {
  const theta = Math.PI / symmetry
  if (i % 2 === 0) {
    const phi = i * theta
    const cos = Math.cos(phi), sin = Math.sin(phi)
    return [cos, sin, -sin, cos] // rotate(iθ)
  }
  // odd: rotate((i+1)θ) · reflectX  →  a=cosφ b=sinφ c=sinφ d=-cosφ
  const phi = (i + 1) * theta
  const cos = Math.cos(phi), sin = Math.sin(phi)
  return [cos, sin, sin, -cos]
}

/** Every mirrored image of a source point (px,py) across the full disc — 2N
 *  points for `symmetry` N. Pure; the render loop applies the same matrices via
 *  ctx.transform. This is the headline invariant: perfect dihedral symmetry. */
export function foldPoint(px: number, py: number, symmetry: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < 2 * symmetry; i++) {
    const [a, b, c, d] = sectorMatrix(i, symmetry)
    out.push({ x: a * px + c * py, y: b * px + d * py })
  }
  return out
}

// ── Source shapes ───────────────────────────────────────────────────────────
export interface Shape {
  type: string    // resolved primitive: shard | disc | ribbon | petal | blob
  r0: number      // base radius, fraction of disc radius
  a0: number      // base angle within/near the master wedge (radians)
  rAmp: number    // radial oscillation amplitude (fraction of disc radius)
  rFreq: number   // radial oscillation rate (rad/s)
  rPhase: number
  aAmp: number    // angular oscillation amplitude (radians)
  aFreq: number   // angular oscillation rate (rad/s)
  aPhase: number
  rot0: number    // initial self-rotation
  spin: number    // self-rotation rate (rad/s, signed)
  size: number    // per-shape size multiplier
  ci: number      // colour index into the palette
  verts: number[] // per-vertex radius multipliers for shard/blob primitives
}

const PRIMS = ['shard', 'disc', 'ribbon', 'petal', 'blob'] as const

function primForStyle(style: KaleidoscopeConfig['shapeStyle'], rnd: () => number): string {
  switch (style) {
    case 'shards': return 'shard'
    case 'discs': return 'disc'
    case 'ribbons': return 'ribbon'
    case 'blobs': return 'blob'
    default: return PRIMS[Math.floor(rnd() * PRIMS.length)]
  }
}

/** Build the source shapes deterministically from the seed. Angles are placed
 *  in/near the master wedge [0,θ]; as they drift they meet their own mirror
 *  images at the wedge edges — the classic kaleidoscope look. */
export function buildShapes(config: KaleidoscopeConfig): Shape[] {
  const rnd = mulberry32((config.seed >>> 0) ^ 0x5eed10e)
  const theta = Math.PI / config.symmetry
  const palette = PALETTES[config.palette]
  const shapes: Shape[] = []
  for (let n = 0; n < config.sourceShapes; n++) {
    const vcount = 3 + Math.floor(rnd() * 4) // 3..6 vertices
    const verts: number[] = []
    for (let v = 0; v < vcount; v++) verts.push(0.55 + rnd() * 0.65)
    shapes.push({
      type: primForStyle(config.shapeStyle, rnd),
      r0: 0.08 + rnd() * 0.84,
      // spill a little past the wedge so shapes glide across the mirror seams
      a0: (-0.1 + rnd() * 1.2) * theta,
      rAmp: 0.04 + rnd() * 0.12,
      rFreq: 0.06 + rnd() * 0.16,
      rPhase: rnd() * TAU,
      aAmp: (0.05 + rnd() * 0.2) * theta,
      aFreq: 0.06 + rnd() * 0.16,
      aPhase: rnd() * TAU,
      rot0: rnd() * TAU,
      spin: (rnd() < 0.5 ? -1 : 1) * (0.1 + rnd() * 0.35),
      size: 0.55 + rnd() * 0.9,
      ci: Math.floor(rnd() * palette.length),
      verts,
    })
  }
  return shapes
}

/** A shape's live centre + self-rotation at time `t` (seconds). driftSpeed scales
 *  every glide term (0 = frozen source); tumbleSpeed scales self-rotation. */
export function shapePose(
  s: Shape, t: number, driftSpeed: number, tumbleSpeed: number, discR: number, globalSpin: number,
): { x: number; y: number; rot: number } {
  const r = Math.max(0, s.r0 + s.rAmp * Math.sin(t * s.rFreq * driftSpeed + s.rPhase)) * discR
  const a = s.a0 + s.aAmp * Math.sin(t * s.aFreq * driftSpeed + s.aPhase) + t * globalSpin * driftSpeed
  const rot = s.rot0 + t * s.spin * tumbleSpeed
  return { x: r * Math.cos(a), y: r * Math.sin(a), rot }
}

// The whole source's slow common precession (rad/s), before driftSpeed scaling.
export const BASE_GLOBAL_SPIN = 0.05
