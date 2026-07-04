import type { VinesConfig } from './schema'
import { buildGeometry, type Segment, type VineGeometry } from './lsystem'

// ─── Runtime state + lifecycle ───────────────────────────────────────────────
// The geometry is precomputed once (deterministic from seed). Each frame we only
// advance a reveal `front` (path distance) and the lifecycle clock. The screensaver
// loop is: grow → settle (hold fully drawn) → fade → reseed (framework rolls a new
// seed via shouldRestart). Colour bins + tip list are precomputed since colour and
// tips are static; only which segments are revealed changes per frame.

export const COLOR_BINS = 24
const SETTLE_HOLD_MS = 6000 // hold the finished vine before it fades
const FADE_MS = 2600 // fade-out duration before reseeding

export type Phase = 'growing' | 'settled' | 'fading'

export interface VineView {
  scale: number
  offsetX: number
  offsetY: number
  anchorX: number // sway pivot (base of the clump, screen px)
  anchorY: number
}

export interface VineState {
  cfg: VinesConfig
  w: number
  h: number
  geo: VineGeometry
  buckets: Segment[][][] // [depth][colorBin] → segments
  tips: Segment[]
  view: VineView
  front: number
  phase: Phase
  settledMs: number
  fadeMs: number
  t: number // accumulated ms (drives the breeze sway)
}

/** Frame the geometry's bounds into the canvas, anchored near the bottom edge. */
export function computeView(geo: VineGeometry, w: number, h: number): VineView {
  const bw = Math.max(1, geo.maxX - geo.minX)
  const bh = Math.max(1, geo.maxY - geo.minY)
  const bottomPad = h * 0.07
  const scale = Math.min((w * 0.9) / bw, (h * 0.9) / bh)
  const offsetX = w / 2 - scale * (geo.minX + geo.maxX) / 2
  const offsetY = h - bottomPad - scale * geo.maxY // map the base (maxY) near the bottom
  return { scale, offsetX, offsetY, anchorX: w / 2, anchorY: h - bottomPad }
}

/** Bucket segments by [depth][colorBin]; colour u = path fraction (base 0 → tip 1). */
function buildBuckets(geo: VineGeometry): Segment[][][] {
  const buckets: Segment[][][] = []
  for (let d = 0; d <= geo.maxDepth; d++) {
    buckets.push(Array.from({ length: COLOR_BINS }, () => []))
  }
  for (const s of geo.segments) {
    const u = geo.maxDist > 0 ? s.dEnd / geo.maxDist : 0
    const bin = Math.min(COLOR_BINS - 1, Math.max(0, Math.round(u * (COLOR_BINS - 1))))
    buckets[s.depth][bin].push(s)
  }
  return buckets
}

export function createVineState(cfg: VinesConfig, w: number, h: number): VineState {
  const geo = buildGeometry(cfg)
  return {
    cfg, w, h, geo,
    buckets: buildBuckets(geo),
    tips: geo.segments.filter((s) => s.tip),
    view: computeView(geo, w, h),
    front: 0,
    phase: 'growing',
    settledMs: 0,
    fadeMs: 0,
    t: 0,
  }
}

/** Advance the reveal front + lifecycle clock by real elapsed dt (ms). */
export function advanceVines(state: VineState, dt: number): void {
  state.t += dt
  if (state.phase === 'growing') {
    // constant on-screen climbing speed regardless of the fit scale
    state.front += (state.cfg.growthSpeed / Math.max(state.view.scale, 1e-3)) * (dt / 1000)
    if (state.front >= state.geo.maxDist) {
      state.front = state.geo.maxDist
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
export function fadeAlpha(state: VineState): number {
  if (state.phase !== 'fading') return 1
  return Math.max(0, 1 - state.fadeMs / FADE_MS)
}

/** True once the fade completes — the framework then reseeds a fresh vine. */
export function shouldReseed(state: VineState): boolean {
  return state.phase === 'fading' && state.fadeMs >= FADE_MS
}

// Fields that change the actual geometry (need a full rebuild); everything else
// (colour, width, glow, buds, breeze, speed) applies live without a re-setup.
export function needsRebuild(a: VinesConfig, b: VinesConfig): boolean {
  return (
    a.species !== b.species ||
    a.iterations !== b.iterations ||
    a.branchAngle !== b.branchAngle ||
    a.angleJitter !== b.angleJitter ||
    a.lengthDecay !== b.lengthDecay ||
    a.seedPoints !== b.seedPoints ||
    a.seed !== b.seed
  )
}

export function updateVineState(state: VineState, cfg: VinesConfig): boolean {
  if (needsRebuild(state.cfg, cfg)) return false
  state.cfg = cfg
  return true
}
