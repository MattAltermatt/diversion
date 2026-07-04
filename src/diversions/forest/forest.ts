import { mulberry32 } from '../../framework/rng'
import type { ForestConfig } from './schema'
import { buildTree, shuffled, SEASONS, type Season, type TreeGeometry } from './tree'

// ─── Forest runtime state + lifecycle ─────────────────────────────────────────
// Each tree's geometry is precomputed once (deterministic from seed). Per frame we
// only advance a single reveal `front` (0 → 1) and the lifecycle clock. Trees carry
// a small per-tree `delay` (nearer trees lag) so the grove sprouts back-to-front in
// a gentle wave. Loop: grow → settle (hold fully drawn) → fade → reseed (framework
// rolls a fresh seed via shouldRestart). Layout (screen scale + position from depth)
// is derived per frame in the renderer, so a resize never rebuilds geometry.

const MAX_DELAY = 0.25 // max per-tree growth stagger (in front units)
const SETTLE_HOLD_MS = 7000 // hold the finished forest before it fades
const FADE_MS = 2800 // fade-out duration before reseeding

export type Phase = 'growing' | 'settled' | 'fading'

export interface Tree {
  geo: TreeGeometry
  z: number // depth 0 (far) → 1 (near): drives scale, position, atmosphere
  baseXfrac: number // 0..1 horizontal position of the trunk base across the canvas
  delay: number // growth stagger in front units (0..MAX_DELAY)
  seedn: number // per-tree seed for stable leaf-colour picks
}

export interface ForestState {
  cfg: ForestConfig
  w: number
  h: number
  season: Season
  trees: Tree[] // sorted far → near (painter order)
  front: number
  phase: Phase
  settledMs: number
  fadeMs: number
  t: number
}

/** Build the whole grove for a config (deterministic from seed). */
export function createForestState(cfg: ForestConfig, w: number, h: number): ForestState {
  const n = cfg.treeCount
  const rng = mulberry32((cfg.seed * 2654435761 + 0x9e3779b9) >>> 0)
  // decorrelate depth (z) from horizontal position: stratify each independently.
  const zStrata = shuffled(n, rng)
  const trees: Tree[] = []
  for (let i = 0; i < n; i++) {
    const seedn = (cfg.seed * 2246822519 + i * 3266489917 + 1) >>> 0
    const geo = buildTree(cfg, mulberry32(seedn))
    const z = Math.min(1, Math.max(0, (zStrata[i] + rng()) / n))
    // spread bases across the width with a little jitter, kept off the edges.
    const baseXfrac = 0.06 + 0.88 * ((i + 0.5 + (rng() - 0.5) * 0.7) / n)
    trees.push({ geo, z, baseXfrac, delay: z * MAX_DELAY, seedn })
  }
  trees.sort((a, b) => a.z - b.z) // far first
  return {
    cfg, w, h,
    season: SEASONS[cfg.season],
    trees,
    front: 0,
    phase: 'growing',
    settledMs: 0,
    fadeMs: 0,
    t: 0,
  }
}

/** A tree's own reveal progress (0..1) given the global front + its stagger. */
export function localFront(tree: Tree, front: number): number {
  return Math.min(1, Math.max(0, front - tree.delay))
}

/** Advance the reveal front + lifecycle clock by real elapsed dt (ms). */
export function advanceForest(state: ForestState, dt: number): void {
  state.t += dt
  if (state.phase === 'growing') {
    state.front += state.cfg.growthSpeed * (dt / 1000)
    if (state.front >= 1 + MAX_DELAY) {
      state.front = 1 + MAX_DELAY
      state.phase = 'settled'
      state.settledMs = 0
    }
  } else if (state.phase === 'settled') {
    state.settledMs += dt
    if (state.settledMs >= SETTLE_HOLD_MS) {
      state.phase = 'fading'
      state.fadeMs = 0
    }
  } else {
    state.fadeMs += dt
  }
}

/** 1 while growing/settled, ramps 1 → 0 during the fade. */
export function fadeAlpha(state: ForestState): number {
  if (state.phase !== 'fading') return 1
  return Math.max(0, 1 - state.fadeMs / FADE_MS)
}

/** True once the fade completes — the framework then reseeds a fresh forest. */
export function shouldReseed(state: ForestState): boolean {
  return state.phase === 'fading' && state.fadeMs >= FADE_MS
}

// Fields that change the actual tree/scene geometry force a full rebuild; every
// other field (widths, colours, atmosphere, foliage, speed) applies live.
export function needsRebuild(a: ForestConfig, b: ForestConfig): boolean {
  return (
    a.treeCount !== b.treeCount ||
    a.depth !== b.depth ||
    a.branchAngle !== b.branchAngle ||
    a.angleJitter !== b.angleJitter ||
    a.splitFactor !== b.splitFactor ||
    a.lengthDecay !== b.lengthDecay ||
    a.seed !== b.seed
  )
}

export function updateForestState(state: ForestState, cfg: ForestConfig): boolean {
  if (needsRebuild(state.cfg, cfg)) return false
  state.cfg = cfg
  state.season = SEASONS[cfg.season]
  return true
}
