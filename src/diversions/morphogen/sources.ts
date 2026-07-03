import { mulberry32 } from '../../framework/rng'
import type { MorphogenConfig } from './schema'

// Source shapes packed into the uniform. A "point" is a disc; vLine/hLine are
// infinite lines the pixel measures perpendicular distance to (Wolpert edge gradients).
export const SHAPE_POINT = 0
export const SHAPE_VLINE = 1
export const SHAPE_HLINE = 2

// Hard cap so the SIM shader's source-uniform arrays are fixed-size.
export const MAX_SOURCES = 12

/** A source's seed-fixed base: home, channel, shape, footprint, drift orbit, and
 *  (scatter only) a birth/death lifecycle. Positions are normalized [0,1]. */
export interface SourceBase {
  hx: number
  hy: number
  channel: number
  shape: number
  radius: number
  driftAmp: number
  wx: number
  wy: number
  px: number
  py: number
  lifePeriod: number // seconds per birth→death cycle; 0 = permanent (didactic layouts)
  lifeStagger: number // 0..1 offset so the cast dies one at a time, not in unison
}

/** A source resolved to the current instant, ready to upload as SIM uniforms. */
export interface LiveSource {
  x: number
  y: number
  channel: number
  shape: number
  radius: number
  strength: number // 0..1 — a dying/newborn scatter source rides its envelope
}

const TAU = Math.PI * 2

/** Deterministically place the seed-fixed sources for a layout. Same seed → same
 *  cast. Channels cycle across the active morphogens so each claims territory. */
export function buildSources(cfg: MorphogenConfig, seed: number): SourceBase[] {
  const rng = mulberry32(seed >>> 0)
  const nCh = cfg.morphogenCount
  const out: SourceBase[] = []

  // Small injection footprints — the SPREAD is diffusion (gradientReach), not the stamp.
  const ptR = 0.02
  const lineR = 0.012

  const orbit = (amp: number): Pick<SourceBase, 'driftAmp' | 'wx' | 'wy' | 'px' | 'py'> => ({
    driftAmp: amp,
    // Slow, incommensurate angular rates (rad/s): periods ~40–130 s.
    wx: 0.048 + rng() * 0.06,
    wy: 0.048 + rng() * 0.06,
    px: rng() * TAU,
    py: rng() * TAU,
  })

  if (cfg.sourceLayout === 'point') {
    out.push({ hx: 0.5, hy: 0.5, channel: 0, shape: SHAPE_POINT, radius: ptR,
      ...orbit(0.06), lifePeriod: 0, lifeStagger: 0 })
  } else if (cfg.sourceLayout === 'edge') {
    out.push({ hx: 0.08, hy: 0.5, channel: 0, shape: SHAPE_VLINE, radius: lineR,
      ...orbit(0.05), lifePeriod: 0, lifeStagger: 0 })
  } else if (cfg.sourceLayout === 'poles') {
    // Two opposing vertical lines that breathe in/out symmetrically (px offset by π),
    // so the tricolor width RESCALES — Wolpert's robustness result made kinetic.
    const w = 0.05 + rng() * 0.02
    const ph = rng() * TAU
    out.push({ hx: 0.14, hy: 0.5, channel: 0, shape: SHAPE_VLINE, radius: lineR,
      driftAmp: 0.09, wx: w, wy: 0, px: ph, py: 0, lifePeriod: 0, lifeStagger: 0 })
    out.push({ hx: 0.86, hy: 0.5, channel: nCh > 1 ? 1 : 0, shape: SHAPE_VLINE, radius: lineR,
      driftAmp: 0.09, wx: w, wy: 0, px: ph + Math.PI, py: 0, lifePeriod: 0, lifeStagger: 0 })
  } else if (cfg.sourceLayout === 'triad') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + rng() * 0.3
      out.push({ hx: 0.5 + 0.26 * Math.cos(a), hy: 0.5 + 0.26 * Math.sin(a),
        channel: i % nCh, shape: SHAPE_POINT, radius: ptR, ...orbit(0.05),
        lifePeriod: 0, lifeStagger: 0 })
    }
  } else {
    // scatter — a cast of point sources spread across channels, each with its own
    // birth/death cycle so territories perpetually re-partition.
    const n = Math.min(cfg.sourceCount, MAX_SOURCES)
    for (let i = 0; i < n; i++) {
      out.push({ hx: 0.12 + rng() * 0.76, hy: 0.12 + rng() * 0.76,
        channel: i % nCh, shape: SHAPE_POINT, radius: ptR, ...orbit(0.1),
        lifePeriod: 50 + rng() * 40, lifeStagger: i / n })
    }
  }
  return out
}

/** A source's cycle position: on each birth/death cycle a scatter source buds at a
 *  fresh seeded spot. Deterministic in (seed, slot, cycle). */
function cyclePos(seed: number, slot: number, cycle: number): { x: number; y: number } {
  const r = mulberry32((seed ^ (slot * 0x9e3779b1) ^ (cycle * 0x85ebca77)) >>> 0)
  r() // discard first (decorrelate)
  return { x: 0.12 + r() * 0.76, y: 0.12 + r() * 0.76 }
}

// Birth→death strength envelope over a cycle fraction f∈[0,1): fade in, hold, fade out.
function envelope(f: number): number {
  const smooth = (x: number) => x * x * (3 - 2 * x)
  if (f < 0.15) return smooth(f / 0.15)
  if (f > 0.85) return smooth((1 - f) / 0.15)
  return 1
}

/** Resolve the seed-fixed cast to the current instant. `driftT`/`lifeT` are seconds
 *  of accumulated (speed-scaled) drift and reorganization clocks; keeping them
 *  separate lets Drift and Reorganize be dialed — or frozen — independently. */
export function liveSources(
  bases: SourceBase[], driftT: number, lifeT: number, reorganize: number, seed: number,
): LiveSource[] {
  const out: LiveSource[] = []
  for (let i = 0; i < bases.length; i++) {
    const b = bases[i]
    let cx = b.hx
    let cy = b.hy
    let strength = 1

    if (b.lifePeriod > 0 && reorganize > 0) {
      // Scatter with reorganization on: ride the birth/death cycle, budding elsewhere.
      const phase = lifeT / b.lifePeriod + b.lifeStagger
      const cycle = Math.floor(phase)
      const f = phase - cycle
      const p = cyclePos(seed, i, cycle)
      cx = p.x
      cy = p.y
      strength = envelope(f)
    }

    // Drift orbit (perpendicular axis is what matters for line sources). Anchored so
    // driftT=0 sits exactly at home — the seed field then matches the first frame, and
    // poles still breathe in anti-phase (their px offsets differ by π).
    cx += b.driftAmp * (Math.sin(b.wx * driftT + b.px) - Math.sin(b.px))
    cy += b.driftAmp * (Math.sin(b.wy * driftT + b.py) - Math.sin(b.py))

    out.push({ x: cx, y: cy, channel: b.channel, shape: b.shape, radius: b.radius, strength })
  }
  return out
}
