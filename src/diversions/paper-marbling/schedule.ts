import { mulberry32 } from '../../framework/rng'
import type { Operation, CombOp, VortexOp, DropOp } from './ops'
import type { PaperMarblingConfig } from './schema'
import { MAX_OPS } from './gl'

// Turns a seed + config into a time-ordered recipe of drop / comb / vortex operations. Pure &
// deterministic (seeded via mulberry32) — the whole sheet is a function of the seed, so it
// round-trips through the codec and "same seed = same sheet" holds. Authored in a fixed
// [0,1]²-ish world (viewport-independent): the shader maps the short screen axis to [0,1]
// and lets the long axis bleed, so a resize is a pure reprojection, never a regen.

// Base timings (ms) — frame() scales elapsed time by cfg.speed. Drops lay, mixing plays out,
// then the sheet DWELLS (HOLD_MS in index.ts) so the finished marble is what you mostly watch.
const DROP_DUR = 700
const DROP_INTERVAL = 165
const CONCENTRIC_INTERVAL = 80 // faster cadence — you watch the rings grow ring by ring
const PRE_MIX_PAUSE = 400
const COMB_DUR = 1500
const COMB_GAP = 450
const VORTEX_DUR = 2600
const VORTEX_GAP = 750
const STYLUS_DUR = 1400
const STYLUS_GAP = 350

// Drops scatter a little wider than the unit square so wide screens still fill (the short
// axis is [0,1]; extra x bleeds off a square display — full-bleed, no gaps).
const X_LO = -0.2
const X_HI = 1.2
const Y_LO = 0.0
const Y_HI = 1.0

interface Rake {
  mx: number
  my: number
  spacingMul: number
  phaseMul: number
  strengthMul: number
}

const RAKES: Record<'stone' | 'nonpareil' | 'feather' | 'bouquet' | 'getgel', Rake[]> = {
  stone: [],
  nonpareil: [
    { mx: 0, my: 1, spacingMul: 1, phaseMul: 0, strengthMul: 1 },
    { mx: 1, my: 0, spacingMul: 0.6, phaseMul: 0, strengthMul: 0.85 },
  ],
  feather: [
    { mx: 0, my: 1, spacingMul: 1, phaseMul: 0, strengthMul: 1 },
    { mx: 1, my: 0, spacingMul: 0.55, phaseMul: 0, strengthMul: 0.9 },
    { mx: 0, my: 1, spacingMul: 0.4, phaseMul: 0.5, strengthMul: 0.7 },
  ],
  bouquet: [
    { mx: 0, my: 1, spacingMul: 1, phaseMul: 0, strengthMul: 1 },
    { mx: 0, my: -1, spacingMul: 1, phaseMul: 0.5, strengthMul: 1 },
  ],
  getgel: [{ mx: 1, my: 0, spacingMul: 1.4, phaseMul: 0, strengthMul: 0.75 }],
}

// ── shared move builders (used by drift + the single-move patterns) ──────────

function makeVortex(cfg: PaperMarblingConfig, rng: () => number, startMs: number): VortexOp {
  const dir = rng() < 0.5 ? 1 : -1
  return {
    kind: 'vortex',
    cx: 0.1 + 0.8 * rng(),
    cy: 0.12 + 0.76 * rng(),
    strength: dir * (2.4 + 1.4 * rng()) * (cfg.combStrength / 0.14),
    radius: 0.16 + cfg.combSpacing * 0.7 + 0.06 * rng(),
    startMs,
    durMs: VORTEX_DUR,
  }
}

// A single raked line (one tine dragged through) at a random spot & angle — localized, not a
// full-width rank. Shared by the stylus pattern and drift's random strokes.
function makeStroke(cfg: PaperMarblingConfig, rng: () => number, startMs: number): CombOp {
  const ang = rng() * Math.PI * 2
  return {
    kind: 'comb',
    ax: 0.1 + 0.8 * rng(),
    ay: 0.12 + 0.76 * rng(),
    mx: Math.cos(ang),
    my: Math.sin(ang),
    spacing: 8, // huge → a single tine (one tooth) in view, not a periodic rank
    phase: 0, // tooth line passes through (ax,ay)
    z: (rng() < 0.5 ? 1 : -1) * cfg.combStrength * 1.6,
    falloff: 0.04 + cfg.combSpacing * 1.4,
    startMs,
    durMs: STYLUS_DUR,
  }
}

/** Build the full recipe. Returns the ops (time-ordered) and the total sheet length in
 *  base-ms (before the speed multiplier) so index.ts knows when the sheet is complete. */
export function generateSchedule(
  cfg: PaperMarblingConfig,
): { ops: Operation[]; totalMs: number } {
  const rng = mulberry32((cfg.seed >>> 0) ^ 0x9e3779b9)
  const nColors = Math.max(1, cfg.colors.length)
  const ops: Operation[] = []
  const cap = MAX_OPS // never generate more ops than the data texture can hold

  // getgel wants only a handful of large drops regardless of the Drops slider.
  const nDrops = Math.min(
    cfg.pattern === 'getgel' ? Math.min(cfg.dropCount, 7) : cfg.dropCount,
    cap - 8, // leave headroom for mixing ops
  )
  const sizeBoost = cfg.pattern === 'getgel' ? 1.7 : 1

  let t = 0

  if (cfg.pattern === 'concentric') {
    // Suminagashi bullseye: drops fall on ~one spot (with a little jitter), each pushing the
    // last outward into rippling tree-rings; colours step through the palette in order.
    const cx0 = 0.5 + (rng() - 0.5) * 0.3
    const cy0 = 0.5 + (rng() - 0.5) * 0.3
    for (let i = 0; i < nDrops; i++) {
      const drop: DropOp = {
        kind: 'drop',
        cx: cx0 + (rng() - 0.5) * 0.06,
        cy: cy0 + (rng() - 0.5) * 0.06,
        r: cfg.dropSize * (0.7 + 0.5 * rng()),
        color: i % nColors, // in-order → concentric rainbow rings
        startMs: i * CONCENTRIC_INTERVAL,
        durMs: DROP_DUR,
      }
      ops.push(drop)
    }
    t = (nDrops > 0 ? (nDrops - 1) * CONCENTRIC_INTERVAL : 0) + DROP_DUR
    return { ops, totalMs: t }
  }

  // all other patterns: scattered drops (colours picked at random)
  const scatterDrop = (startMs: number): DropOp => ({
    kind: 'drop',
    cx: X_LO + (X_HI - X_LO) * rng(),
    cy: Y_LO + (Y_HI - Y_LO) * rng(),
    r: cfg.dropSize * sizeBoost * (0.65 + 0.7 * rng()),
    color: Math.floor(rng() * nColors),
    startMs,
    durMs: DROP_DUR,
  })

  if (cfg.pattern === 'drift') {
    // Inks keep dropping while — with probability mixChance per drop — a random whirlpool or a
    // single raked line fires, so the sheet slowly evolves rather than being combed once.
    for (let i = 0; i < nDrops && ops.length < cap; i++) {
      ops.push(scatterDrop(t))
      t += DROP_INTERVAL
      if (rng() < cfg.mixChance && i < nDrops - 1 && ops.length < cap) {
        if (rng() < 0.5) {
          ops.push(makeVortex(cfg, rng, t))
          t += VORTEX_DUR + VORTEX_GAP
        } else {
          ops.push(makeStroke(cfg, rng, t)) // a single raked line
          t += STYLUS_DUR + STYLUS_GAP
        }
      }
    }
    return { ops, totalMs: ops.length > 0 ? t : DROP_DUR }
  }

  // remaining patterns: lay every drop, then run the mixing move(s)
  for (let i = 0; i < nDrops; i++) ops.push(scatterDrop(i * DROP_INTERVAL))
  t = (nDrops > 0 ? (nDrops - 1) * DROP_INTERVAL : 0) + DROP_DUR + PRE_MIX_PAUSE

  if (cfg.pattern === 'whirlpool') {
    const n = 3 + Math.floor(rng() * 3) // 3–5
    for (let i = 0; i < n && ops.length < cap; i++) {
      ops.push(makeVortex(cfg, rng, t))
      t += VORTEX_DUR + VORTEX_GAP
    }
  } else if (cfg.pattern === 'stylus') {
    const n = 5 + Math.floor(rng() * 4) // 5–8
    for (let i = 0; i < n && ops.length < cap; i++) {
      ops.push(makeStroke(cfg, rng, t)) // a single raked line, one at a time
      t += STYLUS_DUR + STYLUS_GAP
    }
  } else {
    for (const rake of RAKES[cfg.pattern]) {
      if (ops.length >= cap) break
      const spacing = cfg.combSpacing * rake.spacingMul
      ops.push({
        kind: 'comb',
        ax: 0.5,
        ay: 0.5,
        mx: rake.mx,
        my: rake.my,
        spacing,
        phase: spacing * rake.phaseMul,
        z: cfg.combStrength * rake.strengthMul,
        falloff: Math.max(0.01, spacing * (1 - cfg.sharpness) * 0.9 + spacing * 0.1),
        startMs: t,
        durMs: COMB_DUR,
      })
      t += COMB_DUR + COMB_GAP
    }
  }

  return { ops, totalMs: ops.length > 0 ? t : DROP_DUR }
}
