import { blackFraction, BLACK_NM, meanThickness, type Film } from './film'

/** Capitalised: `segmented` renders the VALUE, not a label. */
export type RuptureMode = 'Dilated' | 'Slow' | 'None'

/** Geometry in units of the canvas's SHORTER axis, so the hole is round at any aspect.
 *  `x` therefore runs 0..aspect and `y` runs 0..1. */
export interface Rupture {
  x: number
  y: number
  r: number
  /** Distance to the farthest corner from `(x, y)` — derived at nucleation. */
  max: number
  /** Units per second — derived at nucleation from the mode's duration. */
  speed: number
}

export interface RuptureStep {
  rupture: Rupture | null
  /** True for exactly one call, when the hole has cleared the frame. */
  reform: boolean
}

const DURATION_S: Record<Exclude<RuptureMode, 'None'>, number> = { Dilated: 4, Slow: 11 }

/** The film must have thinned to this fraction of its formation thickness before it can
 *  give way.
 *
 *  ⚠️ This is a MEAN, on purpose. The first design gated on `blackFraction > 0.12`, and
 *  measured over 90 simulated minutes the peak black fraction was 10.9% and 7.9% — the
 *  gate sat above the statistic and fired only when noise overshot it. Lowering it to 1%
 *  did not fix the class: black fraction oscillates by a factor of eight between samples
 *  25 s apart, so the ending still landed on a spike. Mean thickness falls monotonically,
 *  so a threshold on it is reached once and stays reached.
 *
 *  ⚠️ Honest note: since evaporation was added to `film.ts` (step 6b) a black-fraction
 *  gate would ALSO fire in every regime, so a mutation swapping this back to
 *  `blackFraction > 0.12` passes the whole suite — there is no failing case left to
 *  write a test around, and inventing one would be theatre. The mean is still the right
 *  choice because it falls monotonically and therefore cannot un-fire, where black
 *  fraction swings by a factor of eight between samples 25 s apart. */
const THIN_FRACTION = 0.25

/** …and there must be some black film for the hole to open in. Measured, the mean
 *  crosses THIN_FRACTION at about the same time the first black appears (~120 s at the
 *  shipped rates), so this is a companion condition rather than the binding one. */
const MIN_BLACK = 0.002

/** Nothing lasts forever. A safety net, not the trigger — if this is what ends the
 *  piece, the rates above are wrong and `rupture.test.ts` says so. */
const MAX_AGE_S = 1800

/** Fade-in time for the film that replaces a ruptured one, so the cycle is not a cut. */
export const REFORM_FADE_S = 2.5

/** Advance, or nucleate. ⚠️ Draws from `f.rng`, which it shares with nucleation — so
 *  `stepFilm` must be called BEFORE this every frame, and that ordering is the
 *  determinism contract. */
export function updateRupture(
  cur: Rupture | null,
  f: Film,
  mode: RuptureMode,
  dtSeconds: number,
  aspect: number,
  formationNm: number,
): RuptureStep {
  if (cur) {
    const r = cur.r + dtSeconds * cur.speed
    if (r > cur.max) return { rupture: null, reform: true }
    return { rupture: { ...cur, r }, reform: false }
  }
  if (mode === 'None') return { rupture: null, reform: false }

  const thin = meanThickness(f) < THIN_FRACTION * formationNm
  const black = blackFraction(f, BLACK_NM) > MIN_BLACK
  if (!((thin && black) || f.age > MAX_AGE_S)) return { rupture: null, reform: false }

  // Nucleate in the thinnest film. ⚠️ A full scan, not a random sample: sampling
  // `max(64, n*0.02)` cells looked cheap and missed, because the gate only requires
  // 0.2% black film — 64 draws from a 3,240-cell grid expect 0.13 hits, so the hole
  // opened in film 3x thicker than black and the "opens in the thinnest film" test
  // caught it at 84 nm against a 28 nm threshold. One pass over the grid costs nothing
  // next to the step that just ran, and it happens once per film.
  const n = f.h.length
  let bestIdx = 0
  let bestVal = Infinity
  let ties = 0
  for (let i = 0; i < n; i++) {
    const v = f.h[i]
    if (v < bestVal) {
      bestVal = v
      bestIdx = i
      ties = 1
    } else if (v === bestVal) {
      // Reservoir-sample the ties — a large share of a tearing film sits on the floor,
      // so taking the first would open every hole in the same corner.
      ties++
      if (f.rng() < 1 / ties) bestIdx = i
    }
  }
  const gx = bestIdx % f.cols
  const gy = Math.floor(bestIdx / f.cols)
  const x = (gx / (f.cols - 1)) * aspect
  const y = gy / (f.rows - 1)
  // Reach the farthest corner, not a fixed radius — the mockup hard-codes 2.0, which on
  // a 3.2 aspect leaves a wedge of film standing after the hole has "cleared".
  const max = Math.hypot(Math.max(x, aspect - x), Math.max(y, 1 - y))
  return {
    rupture: { x, y, r: 0, max, speed: max / DURATION_S[mode] },
    reform: false,
  }
}
