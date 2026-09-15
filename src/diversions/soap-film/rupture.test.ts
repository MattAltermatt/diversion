import { describe, expect, it } from 'vitest'
import { BLACK_NM, createFilm, stepFilm, type Film, type FilmParams } from './film'
import { REFORM_FADE_S, updateRupture, type Rupture, type RuptureMode } from './rupture'

const P: FilmParams = { mobility: 1, drainRate: 1, filmThickness: 900 }

/** Drive a real film and collect what the function itself produces.
 *
 *  ⚠️ Deliberately small grids. Every test here runs a whole film to rupture, and CI is
 *  several times slower than a dev machine — this suite shipped green locally and failed
 *  the deploy on four timeouts. `film.test.ts` asserts the physics is grid-independent,
 *  so a smaller arena costs proportionally less and guards exactly the same thing.
 * ⚠️ Never hand-build
 *  a `Rupture`: `max` and `speed` are derived at nucleation, so a struct with
 *  `speed: 0` can never advance and the test asserts against a contract that does not
 *  exist. */
function drive(
  seed: number,
  cols: number,
  rows: number,
  mode: RuptureMode,
  aspect: number,
  maxSeconds: number,
): { film: Film; rupture: Rupture | null; nucleatedAt: number; reformAt: number; heldFrames: number; thicknessAtNucleation: number } {
  const f = createFilm(cols, rows, seed, P)
  let r: Rupture | null = null
  let nucleatedAt = -1
  let reformAt = -1
  let heldFrames = 0
  let thicknessAtNucleation = Infinity
  let last = -1
  const dt = 1 / 30
  for (let t = 0; t < maxSeconds; t += dt) {
    stepFilm(f, P, dt)
    const out = updateRupture(r, f, mode, dt, aspect, P.filmThickness)
    if (out.reform) {
      reformAt = t
      break
    }
    if (out.rupture) {
      if (nucleatedAt < 0) {
        nucleatedAt = t
        // ⚠️ Sample the film HERE. Reading it after the loop reads a field that has kept
        // draining for the whole ~4 s tear, so the cell the hole opened in is no longer
        // the cell it opened in — measured 77 nm at the end against 12 nm at nucleation.
        const gx = Math.min(f.cols - 1, Math.round((out.rupture.x / aspect) * (f.cols - 1)))
        const gy = Math.min(f.rows - 1, Math.round(out.rupture.y * (f.rows - 1)))
        thicknessAtNucleation = f.h[gy * f.cols + gx]
      }
      heldFrames++
      expect(out.rupture.r).toBeGreaterThanOrEqual(last)
      last = out.rupture.r
    }
    r = out.rupture
  }
  return { film: f, rupture: r, nucleatedAt, reformAt, heldFrames, thicknessAtNucleation }
}

describe('rupture', () => {
  it('never nucleates in a fresh film', { timeout: 30000 }, () => {
    const f = createFilm(72, 45, 1, P)
    let r: Rupture | null = null
    for (let i = 0; i < 2000; i++) r = updateRupture(r, f, 'Dilated', 1 / 30, 1.6, P.filmThickness).rupture
    expect(r).toBeNull()
  })

  it('never nucleates when the mode is None', { timeout: 90000 }, () => {
    const { rupture, reformAt } = drive(1, 72, 45, 'None', 1.6, 300)
    expect(rupture).toBeNull()
    expect(reformAt).toBe(-1)
  })

  it('always ends, and at a time the grid size does not set', { timeout: 120000 }, () => {
    // The first gate (`blackFraction > 0.12`) sat ABOVE the peak black fraction of every
    // measured cycle and fired only on noise; the second (1%) still rode a statistic that
    // swings 8x between samples 25 s apart. This one gates on MEAN thickness, which falls
    // monotonically, so it is reached once and stays reached.
    const times: number[] = []
    for (const [cols, rows] of [
      [72, 45],
      [116, 72],
    ] as const) {
      const { reformAt, nucleatedAt } = drive(3, cols, rows, 'Dilated', 1.6, 600)
      expect(nucleatedAt, `${cols}x${rows} never nucleated`).toBeGreaterThan(0)
      expect(reformAt, `${cols}x${rows} never re-formed`).toBeGreaterThan(0)
      times.push(nucleatedAt)
    }
    // ⚠️ The point of the test: not merely that it ends, but that WHEN is not a function
    // of the grid. A pure age ceiling would satisfy "it ends" perfectly.
    expect(Math.max(...times) / Math.min(...times)).toBeLessThan(1.6)
  })

  it('ends in the RIGID regime too, where black film barely forms', { timeout: 120000 }, () => {
    // ⚠️ The regression that a mean-thickness gate exists for. Measured, a rigid film
    // (mobility 0) never reaches ANY black-fraction threshold — not 12%, not 0.2% — in
    // 30 simulated minutes, because Poiseuille drainage alone really is ~400x too slow.
    // Gating the ending on black fraction therefore leaves the `Rigid` preset running
    // until an age ceiling cuts it off, which is exactly the "gate that cannot be
    // reached" bug this trigger already had once. Evaporation (film.ts step 6b) is what
    // gives the rigid film a finite life at all; measured, it ends at ~690 s.
    const f = createFilm(72, 45, 3, { ...P, mobility: 0 })
    let r: Rupture | null = null
    let reformAt = -1
    for (let t = 0; t < 900 && reformAt < 0; t += 1 / 30) {
      stepFilm(f, { ...P, mobility: 0 }, 1 / 30)
      const out = updateRupture(r, f, 'Dilated', 1 / 30, 1.6, P.filmThickness)
      if (out.reform) reformAt = t
      r = out.rupture
    }
    expect(reformAt, 'a rigid film never ended').toBeGreaterThan(0)
  })

  it('opens in the thinnest film, not at a random point', { timeout: 90000 }, () => {
    const { nucleatedAt, thicknessAtNucleation } = drive(5, 72, 45, 'Dilated', 1.6, 600)
    expect(nucleatedAt).toBeGreaterThan(0)
    // ⚠️ Assert the THICKNESS, not a percentile: by the time a film is ready to tear a
    // large share of it sits on the 0.5*BLACK_NM floor, so ties dominate and "fraction of
    // cells strictly below" reports ~24% for a cell that IS the floor.
    expect(thicknessAtNucleation, 'nucleated outside the black film').toBeLessThan(BLACK_NM)
  })

  it('takes the dilated duration, and expands monotonically', { timeout: 90000 }, () => {
    // `heldFrames` is asserted monotone inside `drive`. This bound is a ms-vs-seconds
    // unit check, not a behavioural claim: 4 s at 30 fps is 120 frames.
    const { heldFrames } = drive(5, 72, 45, 'Dilated', 1.6, 600)
    expect(heldFrames / 30).toBeGreaterThan(3.5)
    expect(heldFrames / 30).toBeLessThan(4.6)
  })

  it('Slow takes longer than Dilated', { timeout: 120000 }, () => {
    const fast = drive(5, 72, 45, 'Dilated', 1.6, 600).heldFrames
    const slow = drive(5, 72, 45, 'Slow', 1.6, 600).heldFrames
    expect(slow / fast).toBeGreaterThan(2.2)
  })

  it('clears the whole frame on a wide canvas', { timeout: 90000 }, () => {
    // Kills a straight port of the mockup, which hard-codes `max: 2.0` — less than the
    // 3.35 that a 3.2-aspect frame needs, so a wedge of film would be left standing.
    const { rupture, nucleatedAt } = drive(6, 116, 36, 'Dilated', 3.2, 600)
    expect(nucleatedAt).toBeGreaterThan(0)
    const far = Math.hypot(Math.max(rupture!.x, 3.2 - rupture!.x), Math.max(rupture!.y, 1 - rupture!.y))
    expect(rupture!.max).toBeGreaterThanOrEqual(far)
  })

  it('declares a re-form fade, so the cycle is not a cut', () => {
    expect(REFORM_FADE_S).toBeGreaterThan(1)
  })
})
