import { sampleCyclic } from '../../framework/gradient'
import { solveDoyle, buildLattice, type DoyleGenerators, type DoyleCircle } from './doyle'
import type { DoyleConfig } from './schema'

// A 256-entry cyclic colour LUT baked from the palette off the hot path. render's
// per-frame loop indexes it (zero allocation) instead of sampling the gradient per
// circle — the palette is fully known when it changes, so the hot path must not
// rebuild it (per gotcha-baked-buffer-live-layers: per-frame palette work = #1 jank).
const LUT_SIZE = 256
function buildLut(colors: string[]): string[] {
  const stops = colors.map((c) => c + 'ff')
  const lut = new Array<string>(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const c = sampleCyclic(stops, i / LUT_SIZE)
    lut[i] = `rgb(${c.r | 0}, ${c.g | 0}, ${c.b | 0})`
  }
  return lut
}

// Runtime state for one Doyle spiral. The generators + lattice are solved once
// (deterministic from p,q,detail) in a NORMALISED, viewport-independent space; the
// per-frame flow transform (a seamless loxodromic zoom) and all px scaling live in
// render.ts. Resize never regenerates — the band is fixed in normalised space, so
// only fitScale/half-diagonal change (a ResizeObserver fires on every drag).

const MAX_CIRCLES = 9000 // frame-budget guard (tight spirals, p≈q, pack many per turn)
const R_OUTER = 44 // normalised outer band radius — generous, covers any aspect at fitScale

export interface SpiralState {
  cfg: DoyleConfig
  w: number // CSS px
  h: number
  gen: DoyleGenerators
  circles: DoyleCircle[]
  q: number // effective arm count (mirrors gen; reconcile keeps q>p)
  lut: string[] // baked 256-entry rgb() palette LUT, rebuilt off the hot path
  phase: number // loxodromic flow phase (accumulates; a^phase is applied each frame)
  rotPhase: number // extra rigid rotation
  minVisPx: number // per-frame cull threshold (from detail)
  fitScale: number // px per normalised unit (from viewport)
  appearanceSig: string
}

/** Smallest drawn circle (px) from the detail knob — the per-frame cull size. */
function minVisPxFor(detail: number): number {
  const t = (detail - 1) / 99 // 0..1
  return 2.6 - t * 2.2 // 2.6px (sparse) → 0.4px (finest)
}

/** How deep toward the core to generate, in normalised radius, from detail.
 *  Viewport-independent so resize never rebuilds; the px cull does the real work. */
function rInnerFor(detail: number): number {
  const t = (detail - 1) / 99
  return 0.06 * Math.pow(0.014, t) // 0.06 → ~0.00084 (log ramp)
}

function fitScaleFor(w: number, h: number): number {
  return 0.16 * Math.min(w, h)
}

function appearanceSignature(cfg: DoyleConfig): string {
  return [cfg.style, cfg.colorBy, cfg.lineWidth, cfg.colors.join()].join('|')
}

/** Solve generators for (p,q), falling back to (2,3) if Newton fails (degenerate). */
function generatorsFor(p: number, q: number): { gen: DoyleGenerators; q: number } {
  const g = solveDoyle(p, q)
  if (g) return { gen: g, q }
  return { gen: solveDoyle(2, 3)!, q: 3 }
}

export function createState(cfg: DoyleConfig, w: number, h: number): SpiralState {
  const { gen, q } = generatorsFor(cfg.p, cfg.q)
  const circles = buildLattice(gen, q, rInnerFor(cfg.detail), R_OUTER, MAX_CIRCLES)
  return {
    cfg,
    w,
    h,
    gen,
    circles,
    q,
    lut: buildLut(cfg.colors),
    phase: 0,
    rotPhase: 0,
    minVisPx: minVisPxFor(cfg.detail),
    fitScale: fitScaleFor(w, h),
    appearanceSig: appearanceSignature(cfg),
  }
}

/** Advance the loxodromic flow phase + extra rotation. render() reads phase and
 *  applies M = a^phase to every circle, so the zoom loops seamlessly (a^1 = a is a
 *  lattice symmetry). Phase is kept in [0,1) — a^phase there spans one full a-step. */
export function advance(s: SpiralState, dt: number): void {
  s.phase += (s.cfg.flowSpeed * dt) / 1000
  s.phase = ((s.phase % 1) + 1) % 1
  const TAU = 2 * Math.PI
  s.rotPhase += (s.cfg.rotateSpeed * dt) / 1000
  s.rotPhase = ((s.rotPhase % TAU) + TAU) % TAU // bounded over a multi-hour run
}

/** Resize without regenerating: the lattice is normalised (viewport-independent);
 *  only the px fit scale changes. Never rebuild on a fullscreen/drag resize. */
export function resizeState(s: SpiralState, w: number, h: number): void {
  s.w = w
  s.h = h
  s.fitScale = fitScaleFor(w, h)
}

/** Live-apply a config edit. Structural changes (p, q, detail) return false so the
 *  framework re-runs setup(); appearance changes just rebuild the cached palette. */
export function applyConfig(s: SpiralState, cfg: DoyleConfig): boolean {
  if (cfg.p !== s.cfg.p || cfg.q !== s.cfg.q || cfg.detail !== s.cfg.detail) return false
  const sig = appearanceSignature(cfg)
  if (sig !== s.appearanceSig) {
    s.appearanceSig = sig
    s.lut = buildLut(cfg.colors)
  }
  s.cfg = cfg
  return true
}
