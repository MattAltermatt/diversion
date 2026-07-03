import { buildGasket, type Circle } from './apollonian'
import type { ApollonianConfig } from './schema'

// Runtime state for one gasket. The circles are generated once (deterministic
// from the seed family); the reveal timeline draws them in coarse-first, and a
// slow rotation + reseed loop keeps the screensaver alive. Heavy raster caching
// (the persistent art buffer + bloom) lives in render.ts.

const REVEAL_BASE_MS = 14000 // reveal duration at growthSpeed 1
const MAX_CIRCLES = 60000 // hard frame-budget guard

export interface GasketState {
  cfg: ApollonianConfig
  w: number // CSS px
  h: number
  circles: Circle[]
  revealKey: number[] // ascending 0..1 reveal time per circle (parallel to circles)
  maxDepth: number
  kMin: number // smallest positive curvature (largest gasket disc)
  kMax: number // largest curvature present
  stops: string[] // hex8 palette stops, rebuilt only when colours change (off the hot path)
  revealed: number // how many circles are currently drawn
  elapsedMs: number
  rotPhase: number
  heldMs: number // time spent fully revealed (drives the reseed loop)
  needsFullRedraw: boolean
  appearanceSig: string
}

function familyIndexFor(seed: number): number {
  // Spread seeds across families deterministically; a large multiplier so
  // consecutive fresh-load seeds rarely land on the same family.
  return Math.abs(Math.floor(seed) * 2654435761) % 1000000
}

/** Seed-derived starting orientation, so each fresh gasket faces a different way
 *  (a different hash from familyIndexFor, so family and rotation aren't locked). */
function rotationFor(seed: number): number {
  return ((Math.abs(Math.floor(seed) * 40503) % 1000) / 1000) * 2 * Math.PI
}

// glow is deliberately EXCLUDED — it only drives the bloom pass (which keys on it
// independently), never the baked art buffer, so it must not force a re-stamp.
function appearanceSignature(cfg: ApollonianConfig): string {
  return [cfg.style, cfg.colorBy, cfg.boundary, cfg.lineWidth, cfg.colors.join()].join('|')
}

/** Assign each (depth-then-size sorted) circle a reveal time in [0,1], giving
 *  each recursion depth an equal slice so the packing refines detail evenly. */
function buildRevealKeys(circles: Circle[], maxDepth: number): number[] {
  const span = maxDepth + 1
  // count circles per depth to spread within-depth reveal
  const perDepth = new Array<number>(span).fill(0)
  for (const c of circles) if (c.depth >= 0) perDepth[c.depth]++
  const seen = new Array<number>(span).fill(0)
  return circles.map((c) => {
    const d = c.depth
    const within = perDepth[d] > 1 ? seen[d]++ / perDepth[d] : 0
    return (d + within) / span
  })
}

export function createState(cfg: ApollonianConfig, w: number, h: number): GasketState {
  const circles = buildGasket(familyIndexFor(cfg.seed), {
    maxCurvature: cfg.detail,
    maxCircles: MAX_CIRCLES,
  })
  let maxDepth = 0
  let kMin = Infinity
  let kMax = 0
  for (const c of circles) {
    if (c.depth > maxDepth) maxDepth = c.depth
    if (c.k > 0) {
      if (c.k < kMin) kMin = c.k
      if (c.k > kMax) kMax = c.k
    }
  }
  if (!isFinite(kMin)) kMin = 1
  return {
    cfg,
    w,
    h,
    circles,
    revealKey: buildRevealKeys(circles, maxDepth),
    maxDepth,
    kMin,
    kMax,
    stops: cfg.colors.map((c) => c + 'ff'),
    revealed: 0,
    elapsedMs: 0,
    rotPhase: rotationFor(cfg.seed),
    heldMs: 0,
    needsFullRedraw: true,
    appearanceSig: appearanceSignature(cfg),
  }
}

/** Advance the reveal timeline + rotation. Returns nothing; render() reads the
 *  new `revealed` count and stamps the freshly-revealed circles. */
export function advance(s: GasketState, dt: number): void {
  const g = s.cfg.growthSpeed
  const duration = g <= 0 ? 0 : REVEAL_BASE_MS / g
  s.elapsedMs += dt
  const f = duration <= 0 ? 1 : Math.min(1, s.elapsedMs / duration)
  // reveal all circles whose reveal time has arrived (revealKey is ascending)
  let target = s.revealed
  while (target < s.circles.length && s.revealKey[target] <= f) target++
  s.revealed = target
  s.rotPhase += (s.cfg.rotateSpeed * dt) / 1000
  if (s.revealed >= s.circles.length) s.heldMs += dt
}

const HOLD_MS = 6000
/** Fully drawn and held a beat → let the framework reseed a fresh gasket. */
export function isDone(s: GasketState): boolean {
  return s.revealed >= s.circles.length && s.heldMs >= HOLD_MS
}

/** Resize without regenerating: the gasket geometry is viewport-independent
 *  (normalised to a unit circle, scaled to px only at stamp time), so we only
 *  update the CSS size. render's ensureBuf re-bakes at the new device resolution
 *  (size mismatch → needsFullRedraw); the reveal, rotation, and hold all carry
 *  over — a fullscreen toggle must not restart the animation. */
export function resizeState(s: GasketState, w: number, h: number): void {
  s.w = w
  s.h = h
}

/** Live-apply a config edit. Structural changes (detail, seed) return false so
 *  the framework re-runs setup(); appearance changes rebake the art buffer. */
export function applyConfig(s: GasketState, cfg: ApollonianConfig): boolean {
  if (cfg.detail !== s.cfg.detail || cfg.seed !== s.cfg.seed) return false
  const sig = appearanceSignature(cfg)
  if (sig !== s.appearanceSig) {
    s.needsFullRedraw = true
    s.appearanceSig = sig
    s.stops = cfg.colors.map((c) => c + 'ff')
  }
  s.cfg = cfg
  return true
}
