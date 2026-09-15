import { describe, it, expect } from 'vitest'
import {
  buildSpectrum, setSlosh, wavelengthAt, NT, LAM_MAX, LAM_MIN, CURV_TARGET, REFRACT_K,
} from './spectrum'
import { writePhase } from './phase'
import { causticsSchema } from './schema'
import { waterPresets } from './presets'

const base = { tilt: 1.78, spread: 0.28, slosh: 0.7, seed: 7 }
const kOf = (s: { trains: Float32Array }, i: number) => Math.hypot(s.trains[i * 4], s.trains[i * 4 + 1])
const focusOf = (s: { trains: Float32Array; trainsB: Float32Array }, i: number) =>
  s.trainsB[i * 4] * kOf(s, i) ** 2

describe('spectrum', () => {
  it('spans the wavelength range, longest first', () => {
    expect(wavelengthAt(0)).toBeCloseTo(LAM_MAX, 6)
    expect(wavelengthAt(NT - 1)).toBeCloseTo(LAM_MIN, 6)
    for (let i = 1; i < NT; i++) expect(wavelengthAt(i)).toBeLessThan(wavelengthAt(i - 1))
  })

  // What matters is how focusing power is DISTRIBUTED across scales -- that is the
  // chain-link knob. This ratio is (LAM_MAX/LAM_MIN)^(tilt-2), so it cancels `rms`
  // and CURV_TARGET entirely; the absolute level is guarded separately below.
  it('tilt moves the long-to-short focusing ratio monotonically', () => {
    const ratio = (tilt: number) => {
      const s = buildSpectrum({ ...base, tilt })
      return focusOf(s, 0) / focusOf(s, NT - 1)
    }
    const r = [1.6, 1.8, 2.0, 2.2, 2.6].map(ratio)
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThan(r[i - 1])
    expect(ratio(1.6)).toBeLessThan(1) // short waves dominate -> chain-link
    expect(ratio(2.0)).toBeCloseTo(1, 1) // every scale focuses equally
    expect(ratio(2.6)).toBeGreaterThan(1) // swell dominates -> cracked glass
  })

  // The one mutation this catches and nothing else: a dropped `* CURV_TARGET`.
  // The ratio test above cancels it, and the brightness guard would catch it only
  // indirectly. Normalising to unit RMS is the natural thing to write, and it puts
  // the whole field under the brightness threshold -- a near-blank screen.
  it('normalises focusing power to the absolute target', () => {
    const s = buildSpectrum(base)
    const sq = Array.from({ length: NT }, (_, i) => focusOf(s, i) ** 2).reduce((a, b) => a + b, 0)
    expect(Math.sqrt(sq / NT)).toBeCloseTo(CURV_TARGET, 2)
  })

  it('gust susceptibility rises with wavenumber and spares the swell', () => {
    const s = buildSpectrum(base)
    expect(s.trainsB[1]).toBeCloseTo(0, 6)
    expect(s.trainsB[(NT - 1) * 4 + 1]).toBeCloseTo(1, 6)
    for (let i = 1; i < NT; i++) {
      expect(s.trainsB[i * 4 + 1]).toBeGreaterThan(s.trainsB[(i - 1) * 4 + 1])
    }
  })

  it('spread 0 puts every train on one heading', () => {
    const s = buildSpectrum({ ...base, spread: 0 })
    const h0 = Math.atan2(s.trains[1], s.trains[0])
    for (let i = 1; i < NT; i++) {
      expect(Math.atan2(s.trains[i * 4 + 1], s.trains[i * 4])).toBeCloseTo(h0, 6)
    }
  })

  // Play rolls a fresh seed EVERY visit, so a seed that collapsed the headings
  // would ship the directional lattice. Stratified jitter makes that impossible by
  // construction: measured over 300,000 seeds the max axial mean-resultant is
  // 0.8684, against 0.9911 (122 seeds past 0.95) for independent draws. Measure on
  // the unit circle -- atan2 differences wrap.
  it('no seed collapses the headings at the shipped spread', () => {
    const worstSeed = { seed: 0, r: 0 }
    for (let seed = 1; seed <= 200; seed++) {
      const s = buildSpectrum({ ...base, seed })
      let sx = 0
      let sy = 0
      for (let i = 0; i < NT; i++) {
        const a = Math.atan2(s.trains[i * 4 + 1], s.trains[i * 4]) * 2 // axial, not directional
        sx += Math.cos(a)
        sy += Math.sin(a)
      }
      const r = Math.hypot(sx, sy) / NT
      if (r > worstSeed.r) { worstSeed.r = r; worstSeed.seed = seed }
    }
    // expect OUTSIDE the loop: an expect() per iteration of a sim sweep times out
    // on slow CI (a lesson this repo already paid for once).
    expect(worstSeed.r, `worst seed ${worstSeed.seed}`).toBeLessThan(0.92)
  })

  // THE GOLDEN VECTOR. ~12 thresholds in this piece are valid only under one exact
  // mulberry32 consumption order (NT stratified draws, then NT-1 Fisher-Yates) --
  // and without this, NOTHING detects a different one. The heading test above is
  // stratification-insensitive by construction; the determinism test below only
  // checks self-consistency, so any wrong-but-deterministic order passes it. An
  // implementer who transposes two rnd() calls, or shuffles ascending, or draws
  // the shuffle before the strata, gets a different spectrum with a green suite.
  it('pins the RNG draw order', () => {
    const t = buildSpectrum({ ...base, seed: 7 }).trains
    expect(Array.from(t.slice(0, 12)).map((v) => +v.toFixed(5))).toEqual([
      4.58827, 2.96633, -0.78588, 0,
      6.58352, 2.51907, -0.69489, 0,
      6.17038, 6.68088, 4.73236, 0,
    ])
  })

  it('is deterministic in the seed, and the seed changes the field', () => {
    expect(Array.from(buildSpectrum({ ...base, seed: 11 }).trains))
      .toEqual(Array.from(buildSpectrum({ ...base, seed: 11 }).trains))
    expect(Array.from(buildSpectrum({ ...base, seed: 11 }).trains))
      .not.toEqual(Array.from(buildSpectrum({ ...base, seed: 12 }).trains))
  })

  it('setSlosh stands a long-modes-first prefix, and reaches both ends', () => {
    const s = buildSpectrum(base)
    setSlosh(s, 0)
    expect(Array.from(s.standing)).toEqual(Array(NT).fill(0))
    setSlosh(s, 1)
    expect(Array.from(s.standing)).toEqual(Array(NT).fill(1))
    setSlosh(s, 0.7)
    expect(Array.from(s.standing)).toEqual([1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0])
    const mask = Array.from(s.standing)
    expect(mask.slice(mask.indexOf(0)).every((v) => v === 0)).toBe(true)
  })
})

/** Fraction of the surface whose ray bundle contracts to >= 1.5x undisturbed
 *  density, i.e. where a bright filament exists. Intensity is 1/|det J| with
 *  J = I - depth*K*H(h), so det < 0.67 is "half again as bright".
 *
 *  NOT a fold test (det < 0). Measured with an analytic Hessian on every seed
 *  tried, the SHIPPED defaults fold exactly 0% of the time and still render a
 *  bright web -- the caustic here is pure contraction, and a fold-sign guard
 *  rejects the configuration the owner approved.
 *
 *  0.67 and not 0.5, also measured: at 0.5 the defaults floor at 0.00065 over
 *  seeds 1..40 against a 0.01 bar, so which integer is typed as the seed default
 *  would decide whether this suite passes. At 0.67 the same sweep floors at
 *  0.0378 -- a 3.8x margin -- and the vacuity control still reads exactly
 *  0.00000. (0.87 was measured too and is worse: the control starts scoring.)
 *
 *  Analytic Hessian, not a finite difference: a difference step near the 0.09 m
 *  shortest wavelength damps its curvature badly at large `scale`.
 *
 *  ⚠️ SCOPE. This guards THE SPECTRUM, BEFORE REFRACTION, and nothing else. It is
 *  a faithful re-derivation of the surface and its Jacobian -- the gust field's
 *  six coefficients and the `m`/`a` products match SPLAT_VS term for term -- but
 *  it cannot see the renderer: not the splat, not uMean, not uExtent, not the
 *  resolve pass. A sign flip in `grad` or a blank accumulation target leaves it
 *  green. A failure here means the spectrum drifted, CURV_TARGET was dropped, or
 *  the RNG draw order moved. It does NOT mean the renderer drifted. */
function brightFraction(cfg: ReturnType<typeof causticsSchema.parse>, t: number, n = 192): number {
  const spec = buildSpectrum(cfg)
  writePhase(spec, t)
  const dk = cfg.depth * REFRACT_K
  const ext = cfg.scale
  let hits = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1) - 0.5) * ext
      const y = (j / (n - 1) - 0.5) * ext
      // The shader modulates short-wave amplitude by a drifting gust field.
      // Include it, so the guard reflects the surface the renderer actually
      // samples. Measured effect at the defaults is 0.6%.
      const gn = (Math.sin(2.05 * x + 1.25 * y + t * 0.246)
        + Math.sin(-1.55 * x + 2.35 * y + t * 0.198)
        + Math.sin(0.80 * x - 1.90 * y + t * 0.162)) / 3
      let hxx = 0
      let hxy = 0
      let hyy = 0
      for (let q = 0; q < NT; q++) {
        const kx = spec.trains[q * 4]
        const ky = spec.trains[q * 4 + 1]
        const m = 1 + cfg.gust * gn * spec.trainsB[q * 4 + 1]
        const a = cfg.ripple * spec.trainsB[q * 4] * spec.trainsB[q * 4 + 3] * m
        const s = Math.sin(kx * x + ky * y + spec.trains[q * 4 + 2] + spec.trainsB[q * 4 + 2])
        hxx -= a * s * kx * kx
        hxy -= a * s * kx * ky
        hyy -= a * s * ky * ky
      }
      if ((1 - dk * hxx) * (1 - dk * hyy) - dk * dk * hxy * hxy < 0.67) hits++
    }
  }
  return hits / (n * n)
}

/** The WORST instant, not t=0. At t=0 every standing train sits at its coherent
 *  peak and the figure reads 2-9x the typical moment, so a config could pass here
 *  and still be mottle for most of its life. */
const worst = (cfg: ReturnType<typeof causticsSchema.parse>, n = 192) =>
  Math.min(...[0, 0.7, 2.0, 3.7, 9.1].map((t) => brightFraction(cfg, t, n)))

describe('brightness guard', () => {
  // A SWEEP, not one seed: applyFreshLoadRandomization rolls a fresh seed out of
  // 1e9 on every seedless visit, so a guard over the schema default says nothing
  // about the population that actually ships. 6607 is in the sample because it is
  // the worst heading-dispersion seed found over 300,000.
  it('the shipped defaults produce a web at every instant, on every seed sampled', () => {
    const got = [1, 2, 7, 42, 123, 999, 1000, 6607].map(
      (seed) => [seed, worst(causticsSchema.parse({ seed }), 96)] as const,
    )
    const floor = Math.min(...got.map(([, v]) => v))
    expect(floor, JSON.stringify(got)).toBeGreaterThan(0.01)
  })

  it('every Water preset does too', () => {
    // measured minima over seeds 1..40: Calm 0.038, Open water 0.080,
    // Breezy 0.308, Deep end 0.357
    const got = waterPresets.map(
      (p) => [p.name, worst(causticsSchema.parse({ ...p.patch }), 96)] as const,
    )
    const floor = Math.min(...got.map(([, v]) => v))
    expect(floor, JSON.stringify(got)).toBeGreaterThan(0.01)
  })

  // Brackets the safe band on BOTH sides rather than anchoring it at one point:
  // the top of the Ripple slider must still render a web, not a blown-out slab.
  it('and the top of the Ripple slider still produces one', () => {
    expect(worst(causticsSchema.parse({ ripple: 0.026 }), 96)).toBeGreaterThan(0.01)
  })

  // Pins the slosh REGIME, which the guard above never sweeps. Measured with THIS
  // test's own methodology (seed 1, n=96, the five instants `worst` samples):
  // 0.084 at slosh 0, 0.042 at the shipped 0.70, 0.035 at 0.90, 0.027 at 1.00.
  // A denser sweep finds deeper troughs BETWEEN those instants -- 0.005 at 0.90
  // and 0.000 at 1.00 -- which is the point of #389 and the reason these numbers
  // are quoted against a stated method rather than left bare: two honest sweeps
  // of the same config disagree by 10x, so a figure without its method is not a
  // measurement. That is not a bug in the spectrum: at slosh 1 every train
  // stands, so all eleven cos(wt) weights cross zero together and the surface
  // momentarily flattens. It is reachable by dragging the slider to its stop, it
  // is called out in the field's `help`, and capping the slider's max is a
  // numeric-tuning call that belongs to the owner, not to this test. What this
  // pins is that everything BELOW the top stays above the bar.
  it('holds the bar across the slosh range below the top of the slider', () => {
    const got = [0, 0.55, 0.9].map((slosh) => [slosh, worst(causticsSchema.parse({ slosh }), 96)] as const)
    expect(Math.min(...got.map(([, v]) => v)), JSON.stringify(got)).toBeGreaterThan(0.01)
  })

  // Depth's bottom is a SECOND reachable no-picture state, independent of ripple,
  // and its help now says so. Measured at otherwise-default: 0.0005 at 0.60,
  // 0.0024 at 0.65, 0.0049 at 0.70, 0.0080 at 0.75 -- the bar is first cleared at
  // 0.80 (0.0129). Pinned as a REGIME, not a defect: the slider's min is an
  // owner-set number and moving it is not a reviewer's call.
  it('needs depth to gather the light, and says so from 0.8 up', () => {
    expect(worst(causticsSchema.parse({ depth: 0.8 }), 96)).toBeGreaterThan(0.01)
    expect(worst(causticsSchema.parse({ depth: 0.6 }), 96)).toBeLessThan(0.01)
  })

  it('and the floor of the sliders genuinely does not — the guard is not vacuous', () => {
    // Ripple is what dominates this control: at depth 1.0 the minimum ripple
    // alone already scores 0.00000, so the assertion is about ripple, not depth.
    expect(worst(causticsSchema.parse({ ripple: 0.0015, depth: 0.6 }), 96)).toBeLessThan(0.0005)
  })
})
