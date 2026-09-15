import { describe, expect, it } from 'vitest'
import {
  BLACK_NM,
  blackFraction,
  createFilm,
  gridFor,
  meanThickness,
  resampleFilm,
  stepFilm,
  TARGET_CELLS,
  type Film,
  type FilmParams,
} from './film'
import { spectralFilmColor, type Rgb } from './optics'

const P: FilmParams = { mobility: 1, drainRate: 1, filmThickness: 900 }
const RIGID: FilmParams = { ...P, mobility: 0 }

function run(seed: number, p: FilmParams, seconds: number, dt: number, cols = 96, rows = 60): Film {
  const f = createFilm(cols, rows, seed, p)
  for (let i = 0, n = Math.round(seconds / dt); i < n; i++) stepFilm(f, p, dt)
  return f
}

/** Coefficient of variation of the thickness field — how textured it is. */
function cv(f: Film): number {
  let m = 0
  for (let i = 0; i < f.h.length; i++) m += f.h[i]
  m /= f.h.length
  let s = 0
  for (let i = 0; i < f.h.length; i++) s += (f.h[i] - m) ** 2
  return Math.sqrt(s / f.h.length) / m
}

/** Fraction of the thinnest decile lying in the TOP half of the frame. A rigid film
 *  drains from the top, so its thinnest fluid is all aloft; a mobile one is thinned by
 *  patches nucleating at the bottom border, so almost none of it is. */
function thinAloft(f: Film): number {
  const idx = [...f.h.keys()].sort((a, b) => f.h[a] - f.h[b]).slice(0, Math.floor(f.h.length * 0.1))
  let n = 0
  for (const i of idx) if (Math.floor(i / f.cols) < f.rows / 2) n++
  return n / idx.length
}

const sat = (c: Rgb) => {
  const r = Math.max(0, c.r)
  const g = Math.max(0, c.g)
  const b = Math.max(0, c.b)
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mx <= 0 ? 0 : (mx - mn) / mx
}

describe('soap film field', () => {
  it('is deterministic for a seed and differs between seeds', { timeout: 30000 }, () => {
    expect(Array.from(run(7, P, 6, 1 / 60).h)).toEqual(Array.from(run(7, P, 6, 1 / 60).h))
    expect(Array.from(run(7, P, 6, 1 / 60).h)).not.toEqual(Array.from(run(8, P, 6, 1 / 60).h))
  })

  it('opens in colour, not at the washed-out asymptote', () => {
    // `seed` is randomizeOnFreshLoad, so nobody ever lands mid-cycle: every visit and
    // every share link sees the first frame. Measured mean saturation at t = 0 against
    // formation thickness: 900 nm -> 0.620, and 1450 nm (the mockup's value) -> 0.170,
    // which is the asymptote itself. The function is NOT monotone in thickness
    // (600 -> 0.721, 700 -> 0.789, 800 -> 0.547, 1000 -> 0.537, 1100 -> 0.436), so a
    // later tuning pass above ~1050 nm breaks this and should.
    const f = createFilm(96, 60, 4, P)
    let s = 0
    for (let i = 0; i < f.h.length; i++) s += sat(spectralFilmColor(1.33 * f.h[i], 1.33))
    expect(s / f.h.length).toBeGreaterThan(0.45)
  })

  it('reaches the same texture at 30 fps and at 120 fps', { timeout: 30000 }, () => {
    // The smoothing term ran per FRAME rather than per SECOND in the mockup and
    // homogenised the whole field within half a minute — it reads as "the screen is one
    // flat colour" and no single-framerate test can see it. Measured at 4 s: the
    // correct implementation differs by 0.011 between rates, a flat `sm = 0.10` by
    // 0.092. Short horizon on purpose: the advection is chaotic, so by 60 s the CORRECT
    // implementation diverges by 0.29 and the over-smoothed one by 0.06 — the test
    // inverts if it is run long.
    const slow = run(3, P, 4, 1 / 30)
    const fast = run(3, P, 4, 1 / 120)
    expect(Math.abs(cv(fast) - cv(slow)) / cv(slow)).toBeLessThan(0.06)
  })

  it('keeps the field inside its measured texture band', () => {
    // A two-sided bound that catches two different mutations from opposite sides.
    // Measured at 4 s, 120 fps: correct 0.120; per-frame smoothing over-smooths to
    // 0.099; killing buoyancy leaves nucleated discs unstirred and sharp at 0.174.
    const f = run(3, P, 4, 1 / 120)
    expect(cv(f)).toBeGreaterThan(0.105)
    expect(cv(f)).toBeLessThan(0.155)
  })

  it('mobility switches the regime, measured directionally', { timeout: 60000 }, () => {
    // Not a variance ratio: nucleation alone moves that, so a variance test passes even
    // with the stirring removed. Where the thinnest fluid IS separates the regimes
    // completely — measured at 30/60/90 s, rigid 1.000 every time (gravity drains the
    // top), mobile 0.050 / 0.003 / 0.000 (patches nucleate at the bottom border).
    expect(thinAloft(run(2, RIGID, 40, 1 / 60))).toBeGreaterThan(0.9)
    expect(thinAloft(run(2, P, 40, 1 / 60))).toBeLessThan(0.2)
  })

  it('thins toward black film, on the same arc at any grid size', { timeout: 90000 }, () => {
    // Measured black fraction at 120 s: 2.8% / 1.5% on 96x60 and 181x113 — a 3.7x
    // range of cell counts (3.0% at 150 s on 256x160 too). Mean thickness at 300 s: 28 / 36 / 42 nm.
    // Before nucleation was made area-based those same three grids reached black at
    // 227 s, 489 s and never, so a `gridDetail` control was silently a pace control;
    // it has been deleted and this is the regression that keeps the arc grid-free.
    for (const [cols, rows] of [
      [96, 60],
      [136, 85],
    ] as const) {
      const f = run(5, P, 120, 1 / 60, cols, rows)
      expect(meanThickness(f)).toBeLessThan(P.filmThickness * 0.25)
      expect(blackFraction(f, BLACK_NM)).toBeGreaterThan(0.005)
    }
  })

  it('stays positive and finite at every dt and drain rate it can be handed', { timeout: 60000 }, () => {
    // ⚠️ Honest note: it is the FLOOR (`h < 0.5 -> 0.5`) that makes this pass, not the
    // CFL cap. Measured, the cap fires zero times at every reachable setting — even at
    // drainRate 100 and dt 0.30 the minimum cell sits at 156 nm, because the flux would
    // need h/H0 > 11.8 to reach the cap and h is ceilinged at 4. The cap is insurance
    // against a future coefficient change, and this test does not exercise it. Do not
    // write a mutation table row claiming it does.
    for (const dt of [1 / 240, 1 / 60, 0.3]) {
      for (const drainRate of [1, 100]) {
        const f = run(11, { ...P, drainRate }, 10, dt)
        let bad = -1
        for (let i = 0; i < f.h.length; i++) {
          if (!(f.h[i] > 0)) {
            bad = i
            break
          }
        }
        expect(bad, `cell ${bad} non-finite or <= 0 at dt=${dt} drain=${drainRate}`).toBe(-1)
      }
    }
  })

  it('mobility moves the DRAIN coefficient too, not just the stirring', { timeout: 60000 }, () => {
    // The mockup's mode toggle switched three things — buoyancy, nucleation rate and the
    // Poiseuille constant (0.060 rigid vs 0.024 mobile). Mapping only the first two
    // leaves the rigid regime draining too slowly, and a rigid-vs-mobile comparison
    // cannot see it: marginal regeneration thins ~400x faster, so the two regimes are
    // nowhere near each other by construction. Compare rigid against itself.
    //
    // ⚠️ A deliberately TIGHT band. Evaporation is mobility-independent and now carries
    // most of the rigid film's thinning, so the Poiseuille term's share is small:
    // measured at 180 s, 30.29% drained correct vs 27.41% if the coefficient ignores
    // mobility. The sim is seeded and deterministic, so there is no variance to absorb —
    // if a retune moves this, re-measure it rather than widening it.
    const f = run(2, RIGID, 180, 1 / 60)
    const drained = 1 - meanThickness(f) / P.filmThickness
    expect(drained).toBeGreaterThan(0.29)
    expect(drained).toBeLessThan(0.32)
  })

  it('substepping makes a big dt equal to many small ones', { timeout: 30000 }, () => {
    // `dt` is clamped at 50 ms and `tempo` reaches 6x, so a step can be asked for
    // 0.30 s — fifteen times MAX_SUBSTEP. Without splitting, the smoothing term
    // saturates its own clamp and the advection overshoots. Measured mean after 6 s:
    // identical to the last bit with substepping, 3.0% adrift without it.
    const big = run(4, P, 6, 0.3)
    const small = run(4, P, 6, 0.02)
    expect(Math.abs(meanThickness(big) - meanThickness(small)) / meanThickness(small)).toBeLessThan(1e-3)
  })

  it('resampling preserves the mean in both directions', { timeout: 30000 }, () => {
    // Measured relative error: 2.2e-4 upscaling, 5.2e-4 downscaling. A window getting
    // smaller is not an edge case.
    const f = run(9, P, 30, 1 / 60)
    const before = meanThickness(f)
    for (const [c, r] of [
      [140, 70],
      [60, 40],
    ] as const) {
      const g = resampleFilm(f, c, r)
      expect(g.cols).toBe(c)
      expect(g.rows).toBe(r)
      expect(Math.abs(meanThickness(g) - before) / before).toBeLessThan(0.02)
    }
  })

  it('is a fixed cell COUNT at any aspect ratio', () => {
    const a = gridFor(1440, 900)
    const b = gridFor(3840, 1600)
    expect(Math.abs(a.cols * a.rows - TARGET_CELLS) / TARGET_CELLS).toBeLessThan(0.05)
    expect(Math.abs(b.cols * b.rows - TARGET_CELLS) / TARGET_CELLS).toBeLessThan(0.05)
    expect(b.cols / b.rows).toBeGreaterThan(a.cols / a.rows)
  })

  it('frame budget at the shipped grid', { timeout: 60000 }, () => {
    // Loose ceiling; JUDGE FROM THE LOG. Measured 1.46 ms/step at 256x160 = 40,960
    // cells. ⚠️ A gallery tile pays this too — the grid is a fixed count by design so a
    // 4K wall is no more expensive, and the symmetric cost is that a 300 px tile pays
    // full price, with every tile mounted live.
    const { cols, rows } = gridFor(1440, 900)
    const f = createFilm(cols, rows, 1, P)
    for (let i = 0; i < 20; i++) stepFilm(f, P, 1 / 60)
    const t0 = performance.now()
    for (let i = 0; i < 100; i++) stepFilm(f, P, 1 / 60)
    const ms = (performance.now() - t0) / 100
    console.log(`[soap-film] ${cols}x${rows} = ${cols * rows} cells, ${ms.toFixed(2)} ms/step`)
    expect(ms).toBeLessThan(16)
  })
})
