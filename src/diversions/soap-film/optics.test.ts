import { describe, expect, it } from 'vitest'
import {
  buildColorLut,
  ILLUMINANT_XYZ,
  LUT_MAX_OPD,
  linearToSrgb8,
  sampleLut,
  spectralFilmColor,
  type IlluminantName,
  type Rgb,
} from './optics'

const N = 1.33

const lum = (c: Rgb) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/** Saturation of what a display can actually show. ⚠️ Clamp first: the first orders
 *  fall outside sRGB, so an unclamped `(max-min)/max` counts a negative channel and
 *  reports ~0.25 in the wash-out band where a viewer sees 0.02. Two review rounds
 *  disagreed about whether the film converges to grey purely because of this. */
const sat = (c: Rgb) => {
  const r = Math.max(0, c.r)
  const g = Math.max(0, c.g)
  const b = Math.max(0, c.b)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx <= 0 ? 0 : (mx - mn) / mx
}

/** Hue angle in degrees. Classifying by angle rather than by "which primary is
 *  largest": a real first-order magenta film has b > r, so a max-channel test can
 *  never reach the colour it is named after. */
const hue = (c: Rgb) => {
  const a = c.r - 0.5 * (c.g + c.b)
  const b = (Math.sqrt(3) / 2) * (c.g - c.b)
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}

const chroma = (c: Rgb): [number, number] => {
  const r = Math.max(0, c.r)
  const g = Math.max(0, c.g)
  const b = Math.max(0, c.b)
  const s = r + g + b
  return s === 0 ? [0, 0] : [r / s, g / s]
}

describe('thin-film colour', () => {
  it('goes to black as the film vanishes — Newton black film', () => {
    // The piece's closing image, and one sign away from being a bright flash: the
    // half-wave phase shift at the first surface is what makes R -> 0 at d -> 0.
    // Measured: 0 / 5.2e-4 / 9.2e-3 / 1.57e-2 / 7.2e-2 at opd 0 / 7 / 30 / 40 / 160.
    expect(lum(spectralFilmColor(0, N))).toBe(0)
    expect(lum(spectralFilmColor(7, N))).toBeLessThan(0.001)
    expect(lum(spectralFilmColor(30, N))).toBeLessThan(0.012)
    expect(lum(spectralFilmColor(160, N))).toBeGreaterThan(0.06)
  })

  it('washes out above 1800 nm to a fixed LEVEL, which is what bites', () => {
    // THE anti-regression test. A three-cosine approximation is indistinguishable from
    // the truth in saturation (0.182 vs 0.180 at opd 1600) — it is the LUMINANCE that
    // separates them, by an order of magnitude. Measured band over opd > 1500:
    // lum in [0.5066, 0.5268] under peak-luminance normalisation; saturation peaks at
    // 0.327 just above the band's start and falls away from there.
    const lut = buildColorLut(N, 'Daylight')
    let lo = Infinity
    let hi = -Infinity
    let maxSat = 0
    let maxSatAt = 0
    for (let opd = 1800; opd <= LUT_MAX_OPD; opd += 4) {
      const c = sampleLut(lut, opd)
      lo = Math.min(lo, lum(c))
      hi = Math.max(hi, lum(c))
      if (sat(c) > maxSat) { maxSat = sat(c); maxSatAt = opd }
    }
    expect(lo, 'min luminance in the band').toBeGreaterThan(0.49)
    expect(hi, 'max luminance in the band').toBeLessThan(0.54)
    expect(maxSat, `peak saturation at opd ${maxSatAt}`).toBeLessThan(0.40)
  })

  it('is vividly coloured in the first orders', () => {
    const lut = buildColorLut(N, 'Daylight')
    // measured: 0.910 / 0.997 / 0.940 / 0.992 at opd 200 / 280 / 360 / 440
    for (const opd of [200, 280, 360, 440]) {
      expect(sat(sampleLut(lut, opd))).toBeGreaterThan(0.85)
    }
  })

  it('walks the Newton series in the measured hue order', () => {
    // measured hue angles: 34 / 248 / 190 / 49 degrees at opd 200 / 280 / 360 / 440.
    const lut = buildColorLut(N, 'Daylight')
    expect(hue(sampleLut(lut, 200))).toBeGreaterThan(10)
    expect(hue(sampleLut(lut, 200))).toBeLessThan(60)
    expect(hue(sampleLut(lut, 280))).toBeGreaterThan(220)
    expect(hue(sampleLut(lut, 280))).toBeLessThan(280)
    expect(hue(sampleLut(lut, 360))).toBeGreaterThan(160)
    expect(hue(sampleLut(lut, 360))).toBeLessThan(220)
  })

  it('the LUT reproduces the integral it was built from', () => {
    // Chromaticity, because the LUT is normalised and the integral is not. Measured
    // worst deviation 2.3e-4 over the whole table, so 0.002 is a 9x margin and still
    // far inside the reference's own spread.
    const lut = buildColorLut(N, 'Daylight')
    let worst = 0
    let worstUnclipped = 0
    let clipped = 0
    for (let opd = 0; opd <= LUT_MAX_OPD; opd += 37) {
      const ref = spectralFilmColor(opd, N)
      if (lum(ref) <= 0.005) continue
      const got = sampleLut(lut, opd)
      const [rx, ry] = chroma(ref)
      const [gx, gy] = chroma(got)
      const d = Math.max(Math.abs(rx - gx), Math.abs(ry - gy))
      worst = Math.max(worst, d)
      if (Math.max(got.r, got.g, got.b) >= 0.999) clipped++
      else worstUnclipped = Math.max(worstUnclipped, d)
    }
    // ⚠️ Only the UNCLIPPED entries. Eleven of these samples have a channel at 1.0 —
    // that clip is deliberate (see `peakLuminance`), it is what desaturates the
    // brightest orders into a pearly film rather than neon, and it necessarily moves
    // their chromaticity. Measured: 2.3e-4 worst where nothing clips, 5.6e-2 including
    // the clipped ones.
    expect(clipped, 'the brightest orders should clip').toBeGreaterThan(5)
    expect(worstUnclipped).toBeLessThan(0.002)
  })

  it('the LUT is not constant', () => {
    // The cheapest possible guard against the defect that killed the first design: a
    // colour function that ignored its own argument passed six of seven assertions.
    // Measured 81 distinct quantised colours out of 81 samples.
    const lut = buildColorLut(N, 'Daylight')
    const seen = new Set<string>()
    for (let opd = 0; opd <= 1600; opd += 20) {
      const c = sampleLut(lut, opd)
      seen.add(`${c.r.toFixed(2)},${c.g.toFixed(2)},${c.b.toFixed(2)}`)
    }
    expect(seen.size).toBeGreaterThan(60)
  })

  it('every pair of illuminants is visibly different, not just the extreme pair', () => {
    // It is the piece's only colour axis, and the failure to guard against is "four
    // options that all look the same". Asserting the MINIMUM over all six pairs, not a
    // hand-picked one: D75 sat at 0.024 from D65 and was replaced with D93 for exactly
    // this reason. Measured minimum now 0.049 (Daylight-Overcast).
    const names = Object.keys(ILLUMINANT_XYZ) as IlluminantName[]
    const luts = names.map((n) => buildColorLut(N, n))
    let min = Infinity
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const [ax, ay] = chroma(sampleLut(luts[i], 400))
        const [bx, by] = chroma(sampleLut(luts[j], 400))
        min = Math.min(min, Math.hypot(ax - bx, ay - by))
      }
    }
    expect(min).toBeGreaterThan(0.03)
  })

  it('the LUT is in gamut and finite everywhere', () => {
    // The shader does one fetch and no clamping, so the table itself must be safe.
    for (const name of Object.keys(ILLUMINANT_XYZ) as IlluminantName[]) {
      const lut = buildColorLut(N, name)
      for (let i = 0; i < lut.length; i++) {
        expect(Number.isFinite(lut[i])).toBe(true)
        expect(lut[i]).toBeGreaterThanOrEqual(0)
        expect(lut[i]).toBeLessThanOrEqual(1)
      }
    }
  })

  it('encodes sRGB over the full range', () => {
    expect(linearToSrgb8(0)).toBe(0)
    expect(linearToSrgb8(1)).toBe(255)
    expect(linearToSrgb8(-1)).toBe(0)
    expect(linearToSrgb8(2)).toBe(255)
    expect(linearToSrgb8(0.5)).toBe(188) // the gamma curve, not a linear 128
  })
})
