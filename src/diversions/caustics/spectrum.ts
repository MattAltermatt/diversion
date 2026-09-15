import { mulberry32 } from '../../framework/rng'

/** The eleven wave trains whose summed gradient bends the light.
 *
 *  This module is pure arithmetic — no GPU, no canvas — which is deliberate:
 *  every contested number in this piece (the focusing distribution, the standing
 *  partition, the brightness floor) lives here and is therefore testable without
 *  a context. */

export const NT = 11
export const LAM_MAX = 1.15
export const LAM_MIN = 0.09

/** Unit choice, NOT a derived physical constant: the shader only ever uses the
 *  product `ripple * trainsB[i]`, so this is a free scale factor that keeps
 *  `ripple`'s owner-tuned numbers in a readable range.
 *
 *  ⚠️ It is not free of COUPLING, which is the part that bites in six months.
 *  `trainsB[i] = (amp[i] / rms) * CURV_TARGET` divides by `rms`, a function of
 *  NT, LAM_MAX, LAM_MIN and `tilt` — so a twelfth train, a shorter LAM_MIN or a
 *  re-tuned tilt range silently rescales every amplitude and therefore every
 *  brightness threshold, with nothing failing except a test that is an algebraic
 *  identity of this same formula. Change any of those four and re-measure. */
export const CURV_TARGET = 120

/** Small-slope linearisation of refraction at n = 1.33: the ray landing point is
 *  `p - depth * REFRACT_K * grad(h)`. NOT Snell, which #338 and the spec's first
 *  draft both said.
 *
 *  It lives in this pure module rather than in `gl.ts` for two reasons: the
 *  brightness guard needs it with no GL context in scope, and `SPLAT_VS`
 *  interpolates `${REFRACT_K}` instead of hardcoding 0.2481 so the shader and the
 *  guard cannot drift apart. Keep it non-integer-valued — a whole number would
 *  interpolate as a GLSL *int* literal and the shader would stop compiling. */
export const REFRACT_K = 1 - 1 / 1.33

const HEADING = 0.62
const GRAVITY = 9.81

export interface Spectrum {
  /** NT*4: kx, ky, spatial phase, unused */
  trains: Float32Array
  /** NT*4: amplitude, gust susceptibility, time phase, time weight */
  trainsB: Float32Array
  omega: Float64Array
  standing: Uint8Array
}

export const wavelengthAt = (i: number) => LAM_MAX * Math.pow(LAM_MIN / LAM_MAX, i / (NT - 1))

/** How much of the spectrum stands rather than travels, LONG MODES FIRST — a
 *  basin's seiches are its long modes, while fine chop stays local and travelling.
 *
 *  `(i + 1) / NT <= slosh`, not the mockup's `i / (NT - 1) < slosh`, which left
 *  the shortest train travelling even at slosh = 1. This form preserves the
 *  owner-approved behaviour at 0.70 (7 of 11 standing) and at Breezy's 0.55
 *  (6 of 11) while fixing the endpoint. The other obvious fix, `i / NT < slosh`,
 *  gives 8 and 7 — it changes what the owner approved. */
export function setSlosh(spec: Spectrum, slosh: number): void {
  for (let i = 0; i < NT; i++) spec.standing[i] = (i + 1) / NT <= slosh ? 1 : 0
}

export function buildSpectrum({ tilt, spread, slosh, seed }: {
  tilt: number; spread: number; slosh: number; seed: number
}): Spectrum {
  const rnd = mulberry32(seed)
  // PINNED DRAW ORDER, exactly 2*NT-1 draws. Every measured threshold in the plan
  // and in spectrum.test.ts is taken against this order; changing it invalidates
  // all of them, and the golden-vector test is the only thing that can tell.
  //   NT   -> one STRATIFIED jitter per equal bin of [-1, 1)
  //   NT-1 -> Fisher-Yates, so bin order does not correlate with wavelength
  //
  // Stratified, not NT independent uniforms: with independent draws the headings
  // occasionally cluster, and a near-collinear spectrum renders the directional
  // lattice this piece was retuned to remove. Measured over 300,000 seeds --
  // independent: 122 seeds past the dispersion bar (about 1 visit in 2,460, and
  // Play rolls a fresh seed every visit), max 0.9911. Stratified: ZERO, max
  // 0.8684 (at seed 6607), with the typical look unchanged (mean 0.682 -> 0.659).
  const jit = Array.from({ length: NT }, (_, i) => ((i + rnd()) / NT) * 2 - 1)
  for (let i = NT - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1))
    ;[jit[i], jit[k]] = [jit[k], jit[i]]
  }

  // Amplitude falls with wavelength as lambda^tilt. Focusing power goes as a*k^2,
  // so tilt 2.0 gives every scale equal power (organic, multi-scale); below it the
  // shortest train dominates and every cell comes out the same size -- the
  // chain-link fence the owner rejected; above it the swell leads and the fine
  // detail disappears into cracked glass.
  const amp: number[] = []
  const wavenum: number[] = []
  let sumSq = 0
  for (let i = 0; i < NT; i++) {
    const lam = wavelengthAt(i)
    const k = (2 * Math.PI) / lam
    wavenum.push(k)
    amp.push(Math.pow(lam, tilt))
    const c = amp[i] * k * k
    sumSq += c * c
  }
  const rms = Math.sqrt(sumSq / NT) || 1

  const trains = new Float32Array(NT * 4)
  const trainsB = new Float32Array(NT * 4)
  const omega = new Float64Array(NT)
  for (let i = 0; i < NT; i++) {
    const f = i / (NT - 1)
    const k = wavenum[i]
    // Directional spreading: swell holds the wind line, chop fans out around it.
    // Isotropic headings are half of what makes the picture read as a lattice.
    const ang = HEADING + spread * (0.16 + 1.3 * f) * Math.PI * jit[i]
    trains[i * 4 + 0] = Math.cos(ang) * k
    trains[i * 4 + 1] = Math.sin(ang) * k
    trains[i * 4 + 2] = i * 1.7 + jit[i] * 2.4 // spatial phase, reusing the jitter as the mockup does
    trains[i * 4 + 3] = 0
    omega[i] = Math.sqrt(GRAVITY * k) // deep-water dispersion
    trainsB[i * 4 + 0] = (amp[i] / rms) * CURV_TARGET
    // The gust ruffles SHORT waves and barely touches the swell, so a gust changes
    // the local cell SIZE rather than merely the brightness. Scaling every train
    // equally is the version that leaves the picture stationary.
    trainsB[i * 4 + 1] = Math.pow(f, 1.5)
  }
  const spec: Spectrum = { trains, trainsB, omega, standing: new Uint8Array(NT) }
  setSlosh(spec, slosh)
  return spec
}
