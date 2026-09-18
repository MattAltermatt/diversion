/** The config SHAPE and its defaults, with no Zod.
 *
 *  This file exists so `composition.ts` and `powder.ts` can import the config
 *  TYPE without importing `schema.ts`, which carries the bounds and is written
 *  last so those bounds are read off running modules rather than authored into
 *  a document first (#363). Conflating the two is what made an earlier plan
 *  unable to compile at two of its own tasks. */
export interface KolamConfig {
  symmetry: number
  registers: number
  density: number
  strokesPerBundle: number
  bundleSpacing: number
  lineWidth: number
  grain: number
  penSpeed: number
  handWobble: number
  holdSeconds: number
  background: string
  groundGrain: number
  palette: string[]
  kaaviColor: string
  kaavi: boolean
  colouredChalk: number
  seed: number
}

/** The probe's shipped values. `background` is concrete: it is warm, its white
 *  armature clears 3:1 (3.07), and unlike ochre it does not share a hue with the
 *  palette's turmeric and cream, which vanish into an ochre floor. */
export const DEFAULTS: KolamConfig = {
  symmetry: 8,
  registers: 5,
  density: 0.45,
  strokesPerBundle: 6,
  bundleSpacing: 7.0,
  lineWidth: 1.9,
  grain: 0.5,
  penSpeed: 1,
  handWobble: 0.35,
  holdSeconds: 9,
  background: '#8e8b84',
  groundGrain: 26,
  palette: ['#e8b43c', '#d9604a', '#7fc4a8', '#8cbde0', '#e79dbb', '#c9a7e0', '#f0e3b0'],
  kaaviColor: '#9c3b26',
  kaavi: true,
  colouredChalk: 0.4,
  seed: 1,
}

/** Rice flour. Not configurable: it is the structural colour, and the piece's
 *  contrast argument rests on it clearing 3:1 against the ground. */
export const POWDER = '#f7f3ea'
