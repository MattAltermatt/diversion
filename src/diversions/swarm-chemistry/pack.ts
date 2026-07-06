// pack.ts — PURE, GPU-agnostic seams of the EVOLUTIONARY Swarm Chemistry sim. Seed the
// world on the CPU (bit-exact reproducible): every particle owns its OWN 8-param genome
// (not a species index), seeded either from a named recipe's species distribution or as
// a random "Primordial Soup". Recipes transmit + mutate on collision on the GPU, so the
// broth never settles. No WebGPU calls → fully unit-testable under jsdom.
import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import { PARAM_MAX, PRIMORDIAL_SOUP, recipeByName } from './recipes'

// Sim units are Sayama-native: recipe R runs 0..300, so the arena short side lives in
// the same ~500–600 band. REP_DIST = 2 × R_MAX keeps the centring border push identical.
export const R_MAX = 300
export const REP_DIST = 2 * R_MAX

export const GENOME = 8 // params per particle: R,Vn,Vm,c1,c2,c3,c4,c5

export const COMPETITIONS = ['Majority', 'Denser', 'Faster', 'Slower'] as const
export type Competition = (typeof COMPETITIONS)[number]
export const competitionIndex = (c: string): number => Math.max(0, (COMPETITIONS as readonly string[]).indexOf(c))

export interface Camera { zoom: number; panX: number; panY: number }
export const DEFAULT_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 }

export interface SeededWorld {
  pos: Float32Array // interleaved x,y (2*n)
  vel: Float32Array // interleaved vx,vy (2*n), zeroed
  genome: Float32Array // per-particle 8 params (GENOME*n), row-major
}

/** Arena short side = cfg.worldMin; long side follows the viewport aspect so the
 *  bordered field fills the screen with no crop or letterbox. Returns sim-unit W×H. */
export function arenaDims(worldMin: number, size: { width: number; height: number }): { w: number; h: number } {
  const vw = Math.max(1, size.width)
  const vh = Math.max(1, size.height)
  if (vw >= vh) return { w: worldMin * (vw / vh), h: worldMin }
  return { w: worldMin, h: worldMin * (vh / vw) }
}

/** Split `count` across a recipe's species by weight, drift onto the last so it sums. */
export function speciesCounts(weights: number[], count: number): number[] {
  const total = weights.reduce((s, x) => s + x, 0) || 1
  const out = weights.map((w) => Math.floor((count * w) / total))
  let assigned = out.reduce((s, x) => s + x, 0)
  let k = 0
  while (assigned < count && out.length > 0) { out[k % out.length]++; assigned++; k++ }
  return out
}

/** Seed positions (uniform in arena), zero velocities, and per-particle genomes.
 *  `recipe` seeds genomes from that recipe's species; PRIMORDIAL_SOUP rolls random
 *  genomes (each param uniform in [0, max]). Salt "SwCh" keeps worlds distinct. */
export function seedWorld(
  recipeName: string, count: number, seed: number, arenaW: number, arenaH: number,
): SeededWorld {
  const pos = new Float32Array(count * 2)
  const vel = new Float32Array(count * 2)
  const genome = new Float32Array(count * GENOME)
  const rng = mulberry32((seed ^ 0x53774368) >>> 0) // ASCII "SwCh"

  if (recipeName === PRIMORDIAL_SOUP) {
    for (let i = 0; i < count; i++) {
      pos[i * 2] = rng() * arenaW
      pos[i * 2 + 1] = rng() * arenaH
      for (let k = 0; k < GENOME; k++) genome[i * GENOME + k] = rng() * PARAM_MAX[k]
    }
    return { pos, vel, genome }
  }

  const recipe = recipeByName(recipeName)
  const counts = speciesCounts(recipe.species.map((s) => s.weight), count)
  let i = 0
  for (let s = 0; s < counts.length; s++) {
    const sp = recipe.species[s]
    const row = [sp.R, sp.Vn, sp.Vm, sp.c1, sp.c2, sp.c3, sp.c4, sp.c5]
    for (let c = 0; c < counts[s]; c++) {
      pos[i * 2] = rng() * arenaW
      pos[i * 2 + 1] = rng() * arenaH
      for (let k = 0; k < GENOME; k++) genome[i * GENOME + k] = row[k]
      i++
    }
  }
  return { pos, vel, genome }
}

// --- compute params uniform (rounds to 16) ---
export const PARAMS_SIZE = 48 // 11 fields → 44 → 48

export interface ParamCfg {
  count: number
  seed: number
  collisionRadius: number
  mutationRate: number
  simThreshold: number
  competition: string
  evolve: boolean
}

export function packParams(cfg: ParamCfg, arenaW: number, arenaH: number, step: number): ArrayBuffer {
  const buf = new ArrayBuffer(PARAMS_SIZE)
  const dv = new DataView(buf)
  dv.setUint32(0, cfg.count, true)
  dv.setFloat32(4, arenaW, true)
  dv.setFloat32(8, arenaH, true)
  dv.setFloat32(12, REP_DIST, true)
  dv.setUint32(16, step >>> 0, true)
  dv.setUint32(20, cfg.seed >>> 0, true)
  dv.setFloat32(24, cfg.collisionRadius * cfg.collisionRadius, true) // collisionR²
  dv.setFloat32(28, cfg.mutationRate, true)
  dv.setFloat32(32, cfg.simThreshold, true) // 1-D fingerprint-distance threshold (raw, not squared)
  dv.setUint32(36, competitionIndex(cfg.competition), true)
  dv.setUint32(40, cfg.evolve ? 1 : 0, true)
  return buf
}

// --- render view uniform (9 f32 = 36 → padded to 48; alpha@28, colorBoost@32) ---
export const VIEW_SIZE = 48

export function packView(
  cfg: { dotSize: number; colorBoost: number },
  size: { width: number; height: number },
  dpr: number,
  cam: Camera,
  arenaW: number,
  arenaH: number,
): ArrayBuffer {
  const vw = Math.max(1, size.width), vh = Math.max(1, size.height)
  const fit = Math.min(vw, vh) / Math.min(arenaW, arenaH)
  const scale = fit * cam.zoom
  const core = cfg.dotSize * dpr * 1.3
  const halo = Math.max(8, cfg.dotSize * 7) * 0.5 * dpr
  const buf = new ArrayBuffer(VIEW_SIZE)
  const dv = new DataView(buf)
  dv.setFloat32(0, scale, true)
  dv.setFloat32(4, arenaW / 2 + cam.panX, true)
  dv.setFloat32(8, arenaH / 2 + cam.panY, true)
  dv.setFloat32(12, vw, true)
  dv.setFloat32(16, vh, true)
  dv.setFloat32(20, core, true)
  dv.setFloat32(24, halo, true)
  dv.setFloat32(28, 1, true) // alpha (step interpolation) — runFrame overwrites per frame
  dv.setFloat32(32, cfg.colorBoost, true)
  return buf
}

/** bg rgb (0..1) parsed from a #hex6, for the trail-fade uniform + clear value. */
export function parseBg(hex: string): { r: number; g: number; b: number } {
  const { r, g, b } = parseHex6(hex)
  return { r: r / 255, g: g / 255, b: b / 255 }
}
