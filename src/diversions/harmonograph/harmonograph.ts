// Pure harmonograph math — no DOM, no canvas, fully unit-testable.
//   x(t) = Σ Aᵢ·sin(fᵢ·t + φᵢ)·e^(−dᵢ·t)
//   y(t) = Σ Bⱼ·sin(gⱼ·t + ψⱼ)·e^(−dⱼ·t)
// A `Figure` is one seeded set of pendulums; the pen position is sampled at an
// advancing time `t`, and the slowest-decaying envelope tells the caller when
// the figure has settled enough to fade out and reseed a fresh one.
import { mulberry32 } from '../../framework/rng'
import type { HarmonographConfig } from './schema'

export interface Pendulum {
  amp: number // amplitude (axis fraction; the axis's amps sum to 1)
  freq: number // angular frequency (near a small whole number)
  phase: number // radians
  damp: number // decay rate per time unit
}

export interface Figure {
  xs: Pendulum[]
  ys: Pendulum[]
}

/** Build one seeded figure. `rng` is a persistent stream so successive figures
 *  in the endless loop stay deterministic for a given seed. */
export function buildFigure(rng: () => number, cfg: HarmonographConfig): Figure {
  const n = cfg.pendulums
  const detune = cfg.detune

  const mkAxis = (): Pendulum[] => {
    // Fundamental whole-number frequency 1..3 — differing x/y fundamentals give
    // the Lissajous shape; near-integer detune makes the figure precess.
    const fund = 1 + Math.floor(rng() * 3)
    const terms: Pendulum[] = []
    // Unequal, decreasing amplitudes so paired terms never perfectly cancel to a
    // degenerate line; normalized to sum 1 below.
    let ampTotal = 0
    for (let j = 0; j < n; j++) {
      // term 0/1 sit on the fundamental (beating → precession); higher terms add
      // a harmonic for extra petals.
      const harmonic = j < 2 ? fund : fund * (j === 2 ? 2 : 1) + (j === 3 ? 1 : 0)
      const freq = harmonic + (rng() * 2 - 1) * detune
      const amp = 1 / (j + 1.6) // 0.63, 0.38, 0.28, 0.22 …
      ampTotal += amp
      terms.push({
        amp,
        freq,
        phase: rng() * Math.PI * 2,
        damp: cfg.damping * (0.6 + rng() * 0.8), // 0.6×–1.4× spread
      })
    }
    for (const p of terms) p.amp /= ampTotal
    return terms
  }

  return { xs: mkAxis(), ys: mkAxis() }
}

/** Pen position at time `t`, in normalized units (each axis roughly in −1..1). */
export function penPosition(fig: Figure, t: number): { x: number; y: number } {
  let x = 0
  let y = 0
  for (const p of fig.xs) x += p.amp * Math.sin(p.freq * t + p.phase) * Math.exp(-p.damp * t)
  for (const p of fig.ys) y += p.amp * Math.sin(p.freq * t + p.phase) * Math.exp(-p.damp * t)
  return { x, y }
}

/** The slowest-decaying envelope across all pendulums at time `t` (1 at t=0,
 *  → 0 as the swings damp out). The caller reseeds once it drops below a
 *  small threshold. */
export function envelope(fig: Figure, t: number): number {
  let slowest = 0
  for (const p of fig.xs) slowest = Math.max(slowest, Math.exp(-p.damp * t))
  for (const p of fig.ys) slowest = Math.max(slowest, Math.exp(-p.damp * t))
  return slowest
}

/** Convenience for tests / callers: a fresh seeded rng stream. */
export function makeRng(seed: number): () => number {
  return mulberry32(seed >>> 0)
}

/** Envelope value below which a figure is considered settled. */
export const SETTLE_ENVELOPE = 0.05
