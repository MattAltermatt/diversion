// The five species of the documented supralittoral sequence, and where each can live.
//
// Bands are in WETNESS (1 at the water line, falling with height), and they OVERLAP on
// purpose — the overlap is what creates contested margins instead of five clean stripes.

export interface Species {
  /** Binomial, for the description and any future label. */
  name: string
  /** Short form for debug readouts. */
  short: string
  /** Growth form. Two of the five are not crusts; the piece renders all five flat, which
   *  is a recorded simplification rather than an oversight. */
  form: 'crustose' | 'foliose' | 'fruticose'
  /** Tolerated wetness range, wet end first. */
  band: readonly [number, number]
  /** Radial growth rate, relative. */
  rate: number
}

export const SPECIES: readonly Species[] = [
  { name: 'Verrucaria maura',    short: 'Verrucaria', form: 'crustose',  band: [0.72, 1.00], rate: 1.00 },
  { name: 'Caloplaca marina',    short: 'Caloplaca',  form: 'crustose',  band: [0.46, 0.80], rate: 0.86 },
  { name: 'Xanthoria parietina', short: 'Xanthoria',  form: 'foliose',   band: [0.33, 0.62], rate: 0.74 },
  { name: 'Lecanora atra',       short: 'Lecanora',   form: 'crustose',  band: [0.16, 0.44], rate: 0.60 },
  { name: 'Ramalina siliquosa',  short: 'Ramalina',   form: 'fruticose', band: [0.02, 0.28], rate: 0.52 },
] as const

/** How well species `sp` does at wetness `w`, in 0..1.
 *
 *  A TENT inside the band — peak 1.0 at band centre, 0.72 at either edge — then a
 *  DISCONTINUOUS step down to a 0.55 shoulder outside it, reaching zero 0.11 beyond.
 *  It is not a plateau. The step is what keeps a species near its zone while still
 *  letting it hold a contested margin, and die-back's threshold sits just below it. */
export function habitability(sp: number, w: number): number {
  const [lo, hi] = SPECIES[sp].band
  if (w < lo || w > hi) {
    const d = w < lo ? lo - w : w - hi
    return Math.max(0, 1 - d / 0.11) * 0.55
  }
  const mid = (lo + hi) / 2
  const half = (hi - lo) / 2
  return 0.72 + 0.28 * (1 - Math.abs(w - mid) / half)
}

/** The species best suited to `w`, or -1 if nothing can live there. */
export function bestAt(w: number): number {
  let best = -1, score = 0
  for (let s = 0; s < SPECIES.length; s++) {
    const h = habitability(s, w)
    if (h > score) { score = h; best = s }
  }
  return best
}
