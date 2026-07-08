// The evolve → converge → hold → fade → next-target lifecycle, plus the
// pretty on-screen renderer. Fitness scoring (createState/evolveStep/
// stepEvolution) is pure and canvas-free (see raster.ts); only `render` touches
// CanvasRenderingContext2D, and only for the smooth full-resolution view.

import { mulberry32 } from '../../framework/rng'
import { parseHex6 } from '../../framework/color'
import { createBuffer, rasterPolygon, fillBuffer, computeError, type PixelBuffer } from './raster'
import { buildTargetBuffer, TARGET_KINDS } from './targets'
import { randomGenome, mutate, type Genome } from './genome'
import type { GeneticImageConfig } from './schema'

export type Phase = 'evolving' | 'holding' | 'fading'

export interface GeneticImageState {
  cfg: GeneticImageConfig
  rng: () => number
  genome: Genome
  scratch: PixelBuffer
  targetBuf: PixelBuffer
  bg: [number, number, number]
  bestError: number
  initialError: number
  stallCount: number
  generation: number
  targetIndex: number
  phase: Phase
  holdElapsed: number
  fadeElapsed: number
  w: number
  h: number
}

// 🎚️ Convergence/lifecycle tuning — internal (not user-exposed knobs; the
// contract only calls for polygon count, vertices, mutations/frame, target,
// and working resolution).
const STALL_LIMIT = 2500 // consecutive rejected mutations before calling it converged
const CONVERGE_RATIO = 0.06 // bestError <= initialError * this counts as "resolved"
const HOLD_MS = 3200 // how long to hold the resolved picture before fading
const FADE_MS = 700 // crossfade-to-background duration before the next target

function bgTriplet(hex: string): [number, number, number] {
  const { r, g, b } = parseHex6(hex)
  return [r, g, b]
}

function scoreGenome(state: Pick<GeneticImageState, 'scratch' | 'targetBuf' | 'bg'>, genome: Genome): number {
  fillBuffer(state.scratch, state.bg[0], state.bg[1], state.bg[2])
  for (const poly of genome) rasterPolygon(state.scratch, poly.points, poly.r, poly.g, poly.b, poly.a)
  return computeError(state.scratch, state.targetBuf)
}

export function createState(config: GeneticImageConfig, w: number, h: number): GeneticImageState {
  const rng = mulberry32(config.seed)
  const targetIndex = Math.max(0, TARGET_KINDS.indexOf(config.target))
  const aspect = w > 0 && h > 0 ? w / h : 1
  const workH = config.workingResolution
  const workW = Math.max(16, Math.round(workH * aspect))
  const targetBuf = buildTargetBuffer(TARGET_KINDS[targetIndex], workW, workH)
  const scratch = createBuffer(workW, workH)
  const bg = bgTriplet(config.background)
  const genome = randomGenome(rng, config.polygonCount, config.verticesPerPolygon)
  const bestError = scoreGenome({ scratch, targetBuf, bg }, genome)

  return {
    cfg: config,
    rng,
    genome,
    scratch,
    targetBuf,
    bg,
    bestError,
    initialError: bestError,
    stallCount: 0,
    generation: 0,
    targetIndex,
    phase: 'evolving',
    holdElapsed: 0,
    fadeElapsed: 0,
    w,
    h,
  }
}

/** One hill-climb attempt: mutate, score, keep only if the error doesn't get
 *  worse. Returns true when the mutation was accepted — the caller uses this
 *  to reset the stall counter. `state.bestError` is non-increasing over any
 *  sequence of calls (the monotonic-fitness invariant). */
export function evolveStep(state: GeneticImageState): boolean {
  const candidate = mutate(state.genome, state.rng)
  const err = scoreGenome(state, candidate)
  if (err <= state.bestError) {
    state.genome = candidate
    state.bestError = err
    return true
  }
  return false
}

function nextTarget(state: GeneticImageState): void {
  state.targetIndex = (state.targetIndex + 1) % TARGET_KINDS.length
  state.targetBuf = buildTargetBuffer(TARGET_KINDS[state.targetIndex], state.scratch.width, state.scratch.height)
  state.genome = randomGenome(state.rng, state.cfg.polygonCount, state.cfg.verticesPerPolygon)
  state.bestError = scoreGenome(state, state.genome)
  state.initialError = state.bestError
  state.stallCount = 0
  state.generation = 0
  state.phase = 'evolving'
  state.holdElapsed = 0
  state.fadeElapsed = 0
}

/** Advance the whole per-frame lifecycle: up to `mutationsPerFrame` hill-climb
 *  attempts while evolving, then hold on the resolved picture, then fade, then
 *  hand off to the next built-in target. Pure state mutation — drawing is a
 *  separate step (`render`). */
export function stepEvolution(state: GeneticImageState, dt: number): void {
  if (state.phase === 'evolving') {
    for (let i = 0; i < state.cfg.mutationsPerFrame; i++) {
      const improved = evolveStep(state)
      state.stallCount = improved ? 0 : state.stallCount + 1
      state.generation++
      const converged =
        state.bestError <= state.initialError * CONVERGE_RATIO || state.stallCount >= STALL_LIMIT
      if (converged) {
        state.phase = 'holding'
        break
      }
    }
  } else if (state.phase === 'holding') {
    state.holdElapsed += dt
    if (state.holdElapsed >= HOLD_MS) state.phase = 'fading'
  } else {
    state.fadeElapsed += dt
    if (state.fadeElapsed >= FADE_MS) nextTarget(state)
  }
}

/** 0..1 opacity multiplier for the on-screen render — ramps the resolved
 *  picture down to the background just before the next target takes over. */
export function fadeAlpha(state: GeneticImageState): number {
  if (state.phase !== 'fading') return 1
  return Math.max(0, 1 - state.fadeElapsed / FADE_MS)
}

/** The pretty view: the accepted genome, upscaled to the full canvas, drawn
 *  with real (antialiased) canvas paths — distinct from the low-res buffer
 *  rasterizer used purely for fitness scoring. */
export function render(state: GeneticImageState, ctx: CanvasRenderingContext2D): void {
  const { w, h } = state
  ctx.fillStyle = state.cfg.background
  ctx.fillRect(0, 0, w, h)
  const mul = fadeAlpha(state)
  if (mul <= 0) return
  for (const poly of state.genome) {
    ctx.beginPath()
    for (let i = 0; i < poly.points.length; i += 2) {
      const x = poly.points[i] * w
      const y = poly.points[i + 1] * h
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.globalAlpha = poly.a * mul
    ctx.fillStyle = `rgb(${poly.r},${poly.g},${poly.b})`
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** Live-apply a config edit (framework `update` hook). A shape change to the
 *  genome (polygonCount/verticesPerPolygon), a working-buffer resize, or a
 *  starting-target change can't be reconciled with the in-flight genome/
 *  buffers — those return false so the framework falls back to a full
 *  setup(). Everything else (mutation rate, background, colour) applies live. */
export function applyConfig(state: GeneticImageState, config: GeneticImageConfig): boolean {
  const structural =
    config.polygonCount !== state.cfg.polygonCount ||
    config.verticesPerPolygon !== state.cfg.verticesPerPolygon ||
    config.workingResolution !== state.cfg.workingResolution ||
    config.target !== state.cfg.target
  if (structural) return false
  state.cfg = config
  state.bg = bgTriplet(config.background)
  return true
}

/** Resize just updates the display extent — the fitness working buffers are
 *  viewport-independent precomputed geometry and must NOT regen on resize
 *  (ResizeObserver fires often, e.g. during a fullscreen toggle or a devtools
 *  panel drag). */
export function resize(state: GeneticImageState, size: { width: number; height: number }): void {
  state.w = size.width
  state.h = size.height
}
