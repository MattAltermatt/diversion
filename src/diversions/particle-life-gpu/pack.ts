// pack.ts — the PURE, GPU-agnostic seams of the WebGPU Particle Life sim: seed the
// starting world on the CPU (bit-exact reproducible, exactly like the CPU sim), and
// lay out the bytes that get uploaded once into GPU storage/uniform buffers. Kept
// free of any WebGPU calls so it is fully unit-testable under jsdom (there is no
// navigator.gpu in CI). gpu.ts does nothing but createBuffer + writeBuffer these.
//
// Determinism keystone: positions/species/matrix are seeded here with the SAME
// mulberry32 salts as the CPU diversion (sim.ts / matrix.ts), so `?seed=N` starts
// the identical world on every machine. Only the per-step evolution (in the compute
// shader) is GPU-dependent.
import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import { buildMatrix, type Symmetry } from '../particle-life/matrix'
import { paletteColors, type PaletteName } from '../particle-life/palette'
import { forceCurveId } from '../particle-life/force'

// Base toroidal world (matches the CPU diversion, sim.ts); the actual arena is this
// times cfg.worldSize.
export const WORLD_W = 1280
export const WORLD_H = 800
export const DT = 1 / 60 // fixed step; `speed` runs N steps/frame, never changes the outcome

/** Actual arena dimensions for a given world-size multiplier. */
export function worldDims(worldSize: number): { w: number; h: number } {
  return { w: WORLD_W * worldSize, h: WORLD_H * worldSize }
}

/** View camera: `zoom` multiplies the cover-fit scale (1 = whole world), `panX/panY`
 *  shift the view center in WORLD units. Panning wraps seamlessly (toroidal). */
export interface Camera {
  zoom: number
  panX: number
  panY: number
}
export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 }

export interface SeededWorld {
  pos: Float32Array // interleaved x,y per particle (2*count) → GPU array<vec2f>
  vel: Float32Array // interleaved vx,vy (2*count), all zero at genesis
  types: Uint32Array // species index per particle (widened from CPU's Uint8 for GPU storage)
}

/** Seed positions (uniform over the arena) and species, from `seed`. Salt matches
 *  sim.ts:47 so at worldSize 1 the GPU genesis is byte-identical to the CPU world's
 *  (the rng draw ORDER is world-size-independent — worldW/worldH only scale px). */
export function seedWorld(
  count: number, colors: number, seed: number,
  worldW: number = WORLD_W, worldH: number = WORLD_H,
): SeededWorld {
  const pos = new Float32Array(count * 2)
  const vel = new Float32Array(count * 2) // zeroed
  const types = new Uint32Array(count)
  const rng = mulberry32((seed ^ 0x51ed270b) >>> 0)
  for (let i = 0; i < count; i++) {
    pos[i * 2] = rng() * worldW
    pos[i * 2 + 1] = rng() * worldH
    types[i] = Math.floor(rng() * colors)
  }
  return { pos, vel, types }
}

/** Flat row-major n×n interaction matrix, seed-derived — reuses the CPU builder so
 *  the rules are identical to the CPU diversion for a given seed. */
export function packMatrix(colors: number, seed: number, symmetry: Symmetry, bias: number): Float32Array {
  return buildMatrix(colors, seed, symmetry, bias)
}

/** The matrix the sim should use: the user's Custom override when present AND
 *  correctly sized (length colors²), else the seed-derived table. The length guard
 *  lives here (not in the URL codec) because only the consumer knows `colors`. */
export function resolveMatrix(
  cfg: { colors: number; seed: number; symmetry: Symmetry; attractBias: number; matrix?: number[] },
): Float32Array {
  const n = cfg.colors
  if (Array.isArray(cfg.matrix) && cfg.matrix.length === n * n) return Float32Array.from(cfg.matrix)
  return packMatrix(n, cfg.seed, cfg.symmetry, cfg.attractBias)
}

/** Per-species RGBA (0..1) laid out as vec4f, for the render color storage buffer. */
export function packColors(palette: PaletteName, colors: number): Float32Array {
  const hexes = paletteColors(palette, colors)
  const out = new Float32Array(colors * 4)
  for (let i = 0; i < colors; i++) {
    const { r, g, b } = parseHex6(hexes[i] ?? '#ffffff')
    out[i * 4] = r / 255
    out[i * 4 + 1] = g / 255
    out[i * 4 + 2] = b / 255
    out[i * 4 + 3] = 1
  }
  return out
}

// --- uniform buffer byte layouts ------------------------------------------------
// WGSL uniform structs of 4-byte scalars pack sequentially; the struct size rounds
// up to 16, so both buffers are padded. Written little-endian via DataView.

export const PARAMS_SIZE = 48 // 10 × 4 = 40 → round up to 16 = 48

/** Params uniform for the compute shader. forceMul/frictionFactor are precomputed
 *  here exactly as sim.ts:71-72 so the shader stays branch-light. `curve` is the
 *  force-curve id (#206) matching force.ts / the WGSL `band()` switch. */
export function packParams(
  cfg: { count: number; colors: number; rMax: number; beta: number; forceScale: number; friction: number; forceCurve?: string },
  worldW: number = WORLD_W, worldH: number = WORLD_H,
): ArrayBuffer {
  const buf = new ArrayBuffer(PARAMS_SIZE)
  const dv = new DataView(buf)
  dv.setUint32(0, cfg.count, true)
  dv.setUint32(4, cfg.colors, true)
  dv.setFloat32(8, cfg.rMax, true)
  dv.setFloat32(12, cfg.beta, true)
  dv.setFloat32(16, cfg.rMax * cfg.forceScale, true) // forceMul
  dv.setFloat32(20, Math.pow(0.5, DT / cfg.friction), true) // frictionFactor
  dv.setFloat32(24, DT, true)
  dv.setFloat32(28, worldW, true)
  dv.setFloat32(32, worldH, true)
  dv.setUint32(36, forceCurveId(cfg.forceCurve ?? 'Standard'), true) // curve id
  return buf
}

export const VIEW_SIZE = 48 // 9 × 4 = 36 → round up to 16 = 48

/** View uniform for the render shaders. Carries the view CENTER in world coords +
 *  the arena size, so the vertex shader can place each particle at its nearest
 *  toroidal image of the center — panning across the wrap edge is then seamless with
 *  one instance per particle. `zoom` multiplies the cover-fit scale (1 = whole world).
 *  `dpr` converts CSS-pixel dotSize into device pixels (webgpu draws device pixels). */
export function packView(
  cfg: { dotSize: number },
  size: { width: number; height: number },
  dpr: number,
  cam: Camera,
  worldW: number = WORLD_W,
  worldH: number = WORLD_H,
): ArrayBuffer {
  const s0 = Math.max(size.width / worldW, size.height / worldH) // cover-fit whole world
  const scale = s0 * cam.zoom
  const viewCx = worldW / 2 + cam.panX
  const viewCy = worldH / 2 + cam.panY
  const core = cfg.dotSize * dpr * 1.3 // quad half-extent; fragment discs to ~0.8 of it
  const halo = Math.max(8, cfg.dotSize * 7) * 0.5 * dpr
  const buf = new ArrayBuffer(VIEW_SIZE)
  const dv = new DataView(buf)
  dv.setFloat32(0, scale, true)
  dv.setFloat32(4, viewCx, true)
  dv.setFloat32(8, viewCy, true)
  dv.setFloat32(12, worldW, true)
  dv.setFloat32(16, worldH, true)
  dv.setFloat32(20, size.width, true)
  dv.setFloat32(24, size.height, true)
  dv.setFloat32(28, core, true)
  dv.setFloat32(32, halo, true)
  return buf
}
