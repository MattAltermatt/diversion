import { describe, expect, it } from 'vitest'
import {
  DEFAULTS,
  LATERAL_DRAG_RATIO,
  LIMP_HP,
  SPEED_FLOOR,
  WAY_FRACTION,
  limpExponent,
  speedScale,
  throttleForSpeedFraction,
} from './config'

describe('pool-navy config', () => {
  it('every numeric default is finite and the pool is landscape', () => {
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true)
    }
    expect(DEFAULTS.poolWidthM).toBeGreaterThan(DEFAULTS.poolHeightM)
  })

  // ⚠️ The stall guard, not a look choice. Asserted against WAY_FRACTION with a
  // literal ratio rather than by restating the definition — a test that says
  // `SPEED_FLOOR === 3 * WAY_FRACTION` is the definition and dies to nothing.
  // ⚠️ The margin is now 1.15x, down from 3x. The owner asked for a hull at
  // 20% condition to be "basically dead in the water" (0.09), which is below
  // the old floor, so the floor came down with it. 1.15 is the narrowest
  // margin that still leaves a dying hull steerable — at 1.0 it cannot turn
  // at all and hands itself to the nearest wall. The resulting stall rate is
  // measured in sim.test.ts, not assumed.
  it('a dying hull keeps SOME way for its rudder to bite', () => {
    const ratio = speedScale(0, DEFAULTS.limpSpeed) / WAY_FRACTION
    expect(ratio).toBeGreaterThan(1.05)
    expect(ratio, 'any more and it is not "dead in the water"').toBeLessThan(1.6)
  })

  it('a hull at 20% condition is all but dead in the water', () => {
    expect(speedScale(LIMP_HP, DEFAULTS.limpSpeed)).toBeLessThan(0.1)
  })

  it('the limp curve passes EXACTLY through the point it was solved for', () => {
    expect(speedScale(LIMP_HP, DEFAULTS.limpSpeed)).toBeCloseTo(DEFAULTS.limpSpeed, 10)
  })

  it('holds that point across the whole slider range', () => {
    // ⚠️ Starts at the schema's REAL minimum (0.08). It used to start at 0.21,
    // and that start value was the only reason it passed: below SPEED_FLOOR
    // the exponent clamps and the curve stops hitting its named point.
    for (let l = 0.08; l <= 1; l += 0.04) {
      expect(speedScale(LIMP_HP, l), `limpSpeed ${l.toFixed(2)}`).toBeCloseTo(l, 10)
    }
  })

  // The shape between the endpoints is the thing a straight line gets wrong.
  it('SAGS — a line through the same endpoints would sit higher at midrange', () => {
    const lin = (h: number) => SPEED_FLOOR + (1 - SPEED_FLOOR) * h
    expect(speedScale(0.5, DEFAULTS.limpSpeed)).toBeLessThan(lin(0.5) - 0.05)
    expect(speedScale(0.5, DEFAULTS.limpSpeed)).toBeCloseTo(0.233, 2)
  })

  it('is monotonic — no condition is faster than a healthier one', () => {
    for (let h = 0; h < 1; h += 0.01) {
      expect(speedScale(h + 0.01, DEFAULTS.limpSpeed)).toBeGreaterThan(speedScale(h, DEFAULTS.limpSpeed))
    }
  })

  it('an unreachable limp clamps instead of returning NaN', () => {
    expect(Number.isFinite(limpExponent(SPEED_FLOOR))).toBe(true)
    expect(Number.isFinite(speedScale(0.5, SPEED_FLOOR * 0.5))).toBe(true)
  })

  // Inverting the drag law, not scaling the throttle.
  it('throttle for a speed fraction inverts the drag law', () => {
    expect(throttleForSpeedFraction(1)).toBeCloseTo(1, 10)
    expect(throttleForSpeedFraction(0)).toBe(0)
    // ⚠️ A plain `s` multiplier would give 0.5 here. The measured answer is
    // 0.386, and that difference IS the curve shape.
    expect(throttleForSpeedFraction(0.5)).toBeCloseTo(0.386, 3)
  })

  it('the anisotropy constant is a real asymmetry, not a token', () => {
    expect(LATERAL_DRAG_RATIO).toBeGreaterThan(10)
  })
})
