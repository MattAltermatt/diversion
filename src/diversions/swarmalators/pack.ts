// pack.ts — PURE, GPU-agnostic seams of the swarmalator sim: seed the world on the CPU
// (bit-exact reproducible) and lay out the bytes uploaded into GPU buffers. No WebGPU
// calls → fully unit-testable under jsdom. gpu.ts does nothing but createBuffer +
// writeBuffer these. Mirrors particle-life-gpu/pack.ts, minus the toroidal world and
// per-species palette (colour is per-particle from phase, computed in the shader).
//
// Model: O'Keeffe–Hong–Strogatz 2017 (arXiv:1701.05670). Free space, first-order.
import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'

// The swarm self-confines (centre of mass is conserved by the antisymmetric force) to a
// disk of radius ≈1; initial conditions are a centred box [-1,1]². A fixed view radius
// of 1.6 shows every state with margin — no per-frame auto-fit reduction needed.
export const VIEW_RADIUS = 1.6
export const DT = 0.02 // fixed step; `speed` runs N steps/frame, never changes the outcome
export const EPS = 0.01 // softening on the 1/r & 1/r² denominators — REQUIRED for fixed-step
                        // Euler stability (papers use adaptive solvers; a realtime GPU cannot).
const TAU = Math.PI * 2

export const COLOR_MAPS = ['Spectrum', 'Sinebow', 'Pastel'] as const
export type ColorMap = (typeof COLOR_MAPS)[number]
export const colorMapIndex = (m: ColorMap): number => Math.max(0, COLOR_MAPS.indexOf(m))

export interface Camera { zoom: number; panX: number; panY: number }
export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 }

export interface SeededWorld {
  pos: Float32Array      // interleaved x,y (2*n) → array<vec2f>, uniform in [-1,1]²
  phase: Float32Array    // per particle (n), uniform in [-PI,PI)
  vel: Float32Array      // interleaved vx,vy (2*n), zeroed at genesis
  phaseVel: Float32Array // per particle (n), zeroed
  omega: Float32Array    // per-particle base natural frequency ~ N(0,1), seeded
}

/** Box-Muller standard normal from two uniforms. */
function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng())
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * rng())
}

/** Seed positions (uniform box), phases (uniform circle), base natural frequencies
 *  (unit normal). Salt "Swar" is swarmalator-specific so worlds never collide with
 *  other seeded pieces. */
export function seedWorld(count: number, seed: number): SeededWorld {
  const pos = new Float32Array(count * 2)
  const phase = new Float32Array(count)
  const vel = new Float32Array(count * 2)
  const phaseVel = new Float32Array(count)
  const omega = new Float32Array(count)
  const rng = mulberry32((seed ^ 0x53776172) >>> 0) // ASCII "Swar"
  for (let i = 0; i < count; i++) {
    pos[i * 2] = rng() * 2 - 1
    pos[i * 2 + 1] = rng() * 2 - 1
    phase[i] = rng() * TAU - Math.PI
    omega[i] = gaussian(rng)
  }
  return { pos, phase, vel, phaseVel, omega }
}

// --- uniform buffer byte layouts (little-endian via DataView; struct rounds to 16) ---

export const PARAMS_SIZE = 32 // 7 × 4 = 28 → round up to 16 = 32

/** Compute-shader params. invN precomputed so the shader stays divide-light. */
export function packParams(
  cfg: { count: number; J: number; K: number; omegaSpread: number },
): ArrayBuffer {
  const buf = new ArrayBuffer(PARAMS_SIZE)
  const dv = new DataView(buf)
  dv.setUint32(0, cfg.count, true)
  dv.setFloat32(4, 1 / Math.max(1, cfg.count), true) // invN
  dv.setFloat32(8, cfg.J, true)
  dv.setFloat32(12, cfg.K, true)
  dv.setFloat32(16, DT, true)
  dv.setFloat32(20, EPS, true)
  dv.setFloat32(24, cfg.omegaSpread, true)
  return buf
}

export const VIEW_SIZE = 32 // 8 × 4 = 32 bytes (7 f32 + 1 u32), already 16-aligned

/** Render view uniform. World is origin-centred; scale fits VIEW_RADIUS into 90% of the
 *  min screen half-dimension, times the camera zoom. Pan shifts the centre in world units. */
export function packView(
  cfg: { dotSize: number; colorMap: ColorMap },
  size: { width: number; height: number },
  dpr: number,
  cam: Camera,
): ArrayBuffer {
  const fit = (Math.min(size.width, size.height) / 2) * 0.9 / VIEW_RADIUS
  const scale = fit * cam.zoom
  const core = cfg.dotSize * dpr * 1.3
  const halo = Math.max(8, cfg.dotSize * 7) * 0.5 * dpr
  const buf = new ArrayBuffer(VIEW_SIZE)
  const dv = new DataView(buf)
  dv.setFloat32(0, scale, true)
  dv.setFloat32(4, cam.panX, true)  // centreX (world)
  dv.setFloat32(8, cam.panY, true)  // centreY (world)
  dv.setFloat32(12, size.width, true)
  dv.setFloat32(16, size.height, true)
  dv.setFloat32(20, core, true)
  dv.setFloat32(24, halo, true)
  dv.setUint32(28, colorMapIndex(cfg.colorMap), true)
  return buf
}

/** bg rgb (0..1) parsed from a #hex6, for the trail-fade uniform + clear value. */
export function parseBg(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseHex6(hex)
  return { r: r / 255, g: g / 255, b: b / 255 }
}
