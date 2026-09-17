// The community: founders landing, colonies spreading, and die-back pruning the overreach.

import { fbm2 } from './noise'
import type { Rock } from './rock'
import { SPECIES, habitability } from './species'

/** The reference grid every constant below was calibrated against. */
export const CALIBRATION_CELLS = 250 * 160

export interface Colony {
  /** Species index, or -1 for bare. */
  occ: Int8Array
  /** Years since this cell was claimed. */
  age: Float32Array
  /** 1 when freshly scoured, decaying — drives the wet-rock sheen. */
  scour: Float32Array
}

export interface StepParams {
  sporeRate: number
}

export function makeColony(n: number): Colony {
  return { occ: new Int8Array(n).fill(-1), age: new Float32Array(n), scour: new Float32Array(n) }
}

/** Pick a species for a founder landing at `i`, or -1 if none is suited enough.
 *  A weighted lottery rather than a hard argmax: the randomness is what gives the band
 *  edges their soft, interleaved look instead of five ruled stripes. */
function lottery(rock: Rock, i: number, accept: number, rnd: () => number): number {
  let best = -1, bestScore = 0
  for (let s = 0; s < SPECIES.length; s++) {
    const sc = habitability(s, rock.wet[i]) * (0.45 + rnd())
    if (sc > bestScore) { bestScore = sc; best = s }
  }
  return bestScore > accept ? best : -1
}

/** Drop the founding generation so the rock is never blank on arrival.
 *  PER AREA: a literal count is 2.25% instant coverage at 40k cells and 0.56% at 160k,
 *  which leaves up to 39 points of grid-size drift even after per-step founding is fixed. */
export function prime(colony: Colony, rock: Rock, rnd: () => number): void {
  const n = rock.w * rock.h
  const tries = Math.round(900 * n / CALIBRATION_CELLS)
  for (let t = 0; t < tries; t++) {
    const i = (rnd() * n) | 0
    if (colony.occ[i] !== -1 || rock.sterile[i]) continue
    const sp = lottery(rock, i, 0.62, rnd)
    if (sp >= 0) { colony.occ[i] = sp; colony.age[i] = 0.4 }
  }
}

export function step(
  colony: Colony, rock: Rock, params: StepParams, dYears: number, rnd: () => number,
): void {
  const { w, h } = rock
  const n = w * h
  const { occ, age, scour } = colony
  const k = Math.min(0.9, dYears * 2.1)

  // --- growth along fronts ---
  const growTries = Math.floor(n * 0.42)
  for (let t = 0; t < growTries; t++) {
    const i = (rnd() * n) | 0
    // THE INVARIANT: only BARE cells are claimed. A living cell is never overwritten in
    // place — that is what freezes a boundary where two fronts meet and produces the map
    // pattern. (Cells do still change species over time, because die-back and storms
    // return them to bare and whoever arrives next may be somebody else.)
    if (occ[i] !== -1 || rock.sterile[i]) continue
    const x = i % w, y = (i / w) | 0
    const dir = (rnd() * 4) | 0
    const nx = x + (dir === 0 ? 1 : dir === 1 ? -1 : 0)
    const ny = y + (dir === 2 ? 1 : dir === 3 ? -1 : 0)
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const j = ny * w + nx
    const sp = occ[j]
    if (sp === -1 || age[j] < 0.12) continue
    const hab = habitability(sp, rock.wet[i])
    if (hab <= 0) continue
    const lobe = 0.62 + 0.38 * fbm2(rock.noise, x / 7 + 77, y / 7, 2)
    if (rnd() < k * SPECIES[sp].rate * hab * lobe * 1.35) { occ[i] = sp; age[i] = 0 }
  }

  // --- die-back prunes growth that pushed into the shoulder ---
  const dieTries = Math.floor(n * 0.30)
  for (let t = 0; t < dieTries; t++) {
    const i = (rnd() * n) | 0
    const sp = occ[i]
    if (sp === -1) continue
    const stress = 1 - habitability(sp, rock.wet[i])
    if (stress > 0.46 && rnd() < k * stress * stress * 0.30) { occ[i] = -1; age[i] = 0 }
  }

  // --- new colonies land on bare rock, PER AREA ---
  const lands = params.sporeRate * dYears * (n / 1000) * 0.10
  const whole = Math.floor(lands) + (rnd() < lands % 1 ? 1 : 0)
  for (let t = 0; t < whole; t++) {
    const i = (rnd() * n) | 0
    if (occ[i] !== -1 || rock.sterile[i]) continue
    const sp = lottery(rock, i, 0.42, rnd)
    if (sp >= 0) { occ[i] = sp; age[i] = 0 }
  }

  // --- age, and the sheen on freshly scoured rock drying off ---
  const dry = Math.max(0, 1 - dYears * 0.5)
  for (let i = 0; i < n; i++) {
    if (occ[i] !== -1) age[i] += dYears
    if (scour[i] > 0) scour[i] *= dry
  }
}

/** Fraction of colonisable cells currently held, 0..1. */
export function coverage(colony: Colony, rock: Rock): number {
  let held = 0, colonisable = 0
  for (let i = 0; i < colony.occ.length; i++) {
    if (rock.sterile[i]) continue
    colonisable++
    if (colony.occ[i] !== -1) held++
  }
  return colonisable === 0 ? 0 : held / colonisable
}
