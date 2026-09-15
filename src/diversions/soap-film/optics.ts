/** Thickness -> colour for a symmetric air-film-air layer, as a baked LUT.
 *
 *     delta(lambda) = 4*pi*opd / lambda          opd = n * d * cos(thetaT)
 *     R(lambda)     = 4R1 sin^2(delta/2) / ((1-R1)^2 + 4R1 sin^2(delta/2))
 *
 * `R1` is the single-interface Fresnel intensity reflectance. ⚠️ This form already
 * carries the half-wave phase shift at the first surface, so `R -> 0` as `d -> 0`:
 * Newton black film falls out rather than being special-cased. Replacing `sin` with
 * `cos` makes a zero-thickness film BRIGHT, which inverts the piece's closing image —
 * `optics.test.ts` fails on it.
 *
 * ⚠️ NO CLOSED FORM. A Belcour-style sensitivity series was specified for this file
 * first and returned a CONSTANT at every thickness; the guard test written for it
 * missed that by 0.004. The LUT is provably the reference because it IS the reference,
 * and it removes the need for `highp` in the shader along with the 1e-13-amplitude
 * hazard the series carried.
 *
 * ⚠️ At a soap film's R1 (0.0201 at n = 1.33) the Airy series' SECOND harmonic is 50x
 * smaller than the first (measured: a1 = -0.038536, a2 = -0.000773). Multiple-beam
 * Airy and a plain two-beam cosine are therefore visually identical here. The reason
 * the cheap three-cosine approximation is unacceptable is NOT two-beam versus Airy —
 * it is integrating over wavelength versus sampling three of them.
 *
 * The LUT is indexed by OPTICAL thickness `n*d*cos(thetaT)`, so one table serves every
 * viewing angle and a future curved-film variant needs no second table.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Capitalised: `select` and `segmented` render the VALUE, not a label. */
export type IlluminantName = 'Daylight' | 'Overcast' | 'Tungsten' | 'Studio'

/** White points as XYZ normalised to Y = 1 — the von Kries adaptation target. */
export const ILLUMINANT_XYZ: Record<IlluminantName, readonly [number, number, number]> = {
  Daylight: [0.9505, 1, 1.0888], // D65
  Overcast: [0.9714, 1, 1.4386], // D93 — a cold north sky. D75 was measured at
  //                                  chromaticity distance 0.024 from D65, i.e. two of
  //                                  the four options were effectively the same option.
  Tungsten: [1.0985, 1, 0.3558], // A
  Studio: [0.9642, 1, 0.8251], // E-ish, warm neutral
}

export const LUT_N = 2048
/** nm of OPTICAL thickness. The field clamps at 4x the formation thickness, so this
 *  must exceed `4 * n * filmThickness` or the thick end pins to the last entry. */
export const LUT_MAX_OPD = 5200

const LMIN = 380
const LMAX = 780
const LSTEP = 4

/** Piecewise Gaussian — Wyman, Sloan & Shirley, JCGT 2013. */
function pg(x: number, mu: number, s1: number, s2: number): number {
  const s = x < mu ? s1 : s2
  const t = (x - mu) / s
  return Math.exp(-0.5 * t * t)
}

const LAM: number[] = []
const CX: number[] = []
const CY: number[] = []
const CZ: number[] = []
for (let l = LMIN; l <= LMAX; l += LSTEP) {
  LAM.push(l)
  CX.push(1.056 * pg(l, 599.8, 37.9, 31.0) + 0.362 * pg(l, 442.0, 16.0, 26.7) - 0.065 * pg(l, 501.1, 20.4, 26.2))
  CY.push(0.821 * pg(l, 568.8, 46.9, 40.5) + 0.286 * pg(l, 530.9, 16.3, 31.1))
  CZ.push(1.217 * pg(l, 437.0, 11.8, 36.0) + 0.681 * pg(l, 459.0, 26.0, 13.8))
}
const WX = CX.reduce((a, b) => a + b, 0)
const WY = CY.reduce((a, b) => a + b, 0)
const WZ = CZ.reduce((a, b) => a + b, 0)

/** Single-interface Fresnel intensity reflectance at normal incidence. The film is
 *  viewed head-on, so this is a constant of `n` — the angle lives in the OPD instead. */
function fresnelR1(n: number): number {
  const r = (n - 1) / (n + 1)
  return r * r
}

function xyzToLinearSrgb(X: number, Y: number, Z: number): Rgb {
  return {
    r: 3.2406 * X - 1.5372 * Y - 0.4986 * Z,
    g: -0.9689 * X + 1.8758 * Y + 0.0415 * Z,
    b: 0.0557 * X - 0.204 * Y + 1.057 * Z,
  }
}

/** The reference integral, unnormalised. Luminance peaks at ~0.076, because a soap
 *  film really does reflect about 8% — `buildColorLut` is what scales it to a visible
 *  range, and `exposure` is what the viewer turns. */
export function spectralFilmColor(opdNm: number, filmIndex: number, illuminant: IlluminantName = 'Daylight'): Rgb {
  const opd = opdNm > 0 ? opdNm : 0
  const R1 = fresnelR1(filmIndex)
  const A = (1 - R1) * (1 - R1)
  const B = 4 * R1
  let X = 0
  let Y = 0
  let Z = 0
  for (let k = 0; k < LAM.length; k++) {
    const s = Math.sin((2 * Math.PI * opd) / LAM[k])
    const s2 = s * s
    const R = (B * s2) / (A + B * s2)
    X += R * CX[k]
    Y += R * CY[k]
    Z += R * CZ[k]
  }
  // von Kries: a perfect mirror maps to this illuminant's white point.
  const w = ILLUMINANT_XYZ[illuminant]
  return xyzToLinearSrgb((X / WX) * w[0], Y / WY, (Z / WZ) * w[2])
}

/** Peak CHANNEL over the whole table, not peak luminance.
 *
 *  ⚠️ This is a decision, not an accident. Normalising by peak *luminance* (a 13.14x
 *  multiplier at n = 1.33) is what the approved mockup did, and it drives the brightest
 *  first-order channels to 1.29 — i.e. it clips, and clipping a channel is a hue shift
 *  in exactly the most colourful part of the piece. Normalising by peak *channel*
 *  (9.02x) puts the maximum at exactly 1.0 and clips nothing; `exposure` then defaults
 *  above 1 to restore the approved brightness. Negative channels (8 of 141 sampled
 *  first-order colours fall outside sRGB) are clamped to 0 here, because they are
 *  unrepresentable on any display and clamping at build time keeps the shader branchless. */
function peakChannel(filmIndex: number, illuminant: IlluminantName): number {
  let peak = 0
  for (let i = 0; i < LUT_N; i++) {
    const c = spectralFilmColor((i / (LUT_N - 1)) * LUT_MAX_OPD, filmIndex, illuminant)
    peak = Math.max(peak, c.r, c.g, c.b)
  }
  return peak
}

/** `LUT_N * 4` RGBA floats, normalised and gamut-clamped, ready for `texImage2D`. */
export function buildColorLut(filmIndex: number, illuminant: IlluminantName): Float32Array {
  const out = new Float32Array(LUT_N * 4)
  const k = 1 / peakChannel(filmIndex, illuminant)
  for (let i = 0; i < LUT_N; i++) {
    const c = spectralFilmColor((i / (LUT_N - 1)) * LUT_MAX_OPD, filmIndex, illuminant)
    const o = i * 4
    out[o] = Math.max(0, c.r * k)
    out[o + 1] = Math.max(0, c.g * k)
    out[o + 2] = Math.max(0, c.b * k)
    out[o + 3] = 1
  }
  return out
}

/** The CPU twin of the shader's texture fetch — same bilinear read, so a test can
 *  stand exactly where the GPU stands. */
export function sampleLut(lut: Float32Array, opdNm: number): Rgb {
  const n = lut.length / 4
  let x = (opdNm / LUT_MAX_OPD) * (n - 1)
  x = x < 0 ? 0 : x > n - 1 ? n - 1 : x
  const i0 = Math.floor(x)
  const i1 = i0 < n - 1 ? i0 + 1 : i0
  const f = x - i0
  const a = i0 * 4
  const b = i1 * 4
  return {
    r: lut[a] * (1 - f) + lut[b] * f,
    g: lut[a + 1] * (1 - f) + lut[b + 1] * f,
    b: lut[a + 2] * (1 - f) + lut[b + 2] * f,
  }
}

/** 0..1 linear -> 0..255 sRGB-encoded. */
export function linearToSrgb8(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c
  return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
}
