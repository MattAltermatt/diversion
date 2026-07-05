import { describe, it, expect } from 'vitest'
import { isingSchema, type IsingConfig } from './schema'
import {
  createIsingState, advanceIsing, stepIsing, buildAccept, magnetization,
  sweepTemperature,
} from './ising'

const cfg = (over: Partial<IsingConfig> = {}): IsingConfig =>
  isingSchema.parse({ ...over })

// Run `sweeps` Metropolis sweeps at a fixed temperature from a seeded random start,
// return the final |magnetization|.
function runAbsM(temperature: number, sweeps: number, seed = 7, grid = 60): number {
  // cellSize 2 → a `grid`×`grid` lattice from a (2·grid)² pixel size.
  const st = createIsingState(cfg({ tempMode: 'fixed', temperature, seed, cellSize: 2 }), grid * 2, grid * 2)
  buildAccept(st, temperature)
  for (let s = 0; s < sweeps; s++) stepIsing(st)
  return Math.abs(magnetization(st))
}

describe('schema', () => {
  it('parses with valid defaults', () => {
    const c = isingSchema.parse({})
    expect(c.tempMode).toBe('sweep')
    expect(c.coupling).toBe(1)
    expect(c.cellSize).toBeGreaterThanOrEqual(2)
    expect(c.tempMin).toBeLessThan(c.tempMax)
  })

  it('defaults to a slow, calm speed (fractional sweeps per frame)', () => {
    // The zen default: a gentle simmer, not a frantic churn that reads as flicker in
    // a small thumbnail. Fractional (< 1 sweep/frame) is the whole point of the field.
    expect(isingSchema.parse({}).speed).toBeCloseTo(0.1, 5)
  })
})

describe('fractional speed accumulator', () => {
  it('runs no sweeps until the accumulator reaches a whole sweep', () => {
    // speed 0.1 → one sweep every 10 frames. The lattice must be UNCHANGED on the
    // fractional frames (0 sweeps ran) and only advance on the tenth.
    const st = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.27, seed: 5, cellSize: 4 }), 80, 80)
    const before = [...st.spins]
    for (let f = 0; f < 9; f++) advanceIsing(st, 2.27, 0.1)
    expect([...st.spins]).toEqual(before) // 0.9 accumulated → still no sweep
    advanceIsing(st, 2.27, 0.1) // 1.0 → exactly one sweep fires
    expect([...st.spins]).not.toEqual(before)
  })

  it('fractional stepping matches whole-sweep stepping over the same total', () => {
    // Determinism guard: 10×0.1 sweeps must produce the SAME lattice as 1×1 sweep —
    // the accumulator only gates WHEN a sweep runs, never changes the sweep itself.
    const frac = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.0, seed: 3, cellSize: 4 }), 80, 80)
    const whole = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.0, seed: 3, cellSize: 4 }), 80, 80)
    for (let i = 0; i < 30; i++) advanceIsing(frac, 2.0, 0.1) // 3 sweeps, spread over 30 frames
    for (let i = 0; i < 3; i++) advanceIsing(whole, 2.0, 1) // 3 sweeps, one per frame
    expect([...frac.spins]).toEqual([...whole.spins])
  })
})

describe('sweepTemperature', () => {
  it('starts cold, peaks hot at half a period, returns cold', () => {
    const c = cfg({ tempMode: 'sweep', tempMin: 1, tempMax: 4, sweepPeriod: 10 })
    expect(sweepTemperature(c, 0)).toBeCloseTo(1, 5)
    expect(sweepTemperature(c, 5000)).toBeCloseTo(4, 5) // half period → hottest
    expect(sweepTemperature(c, 10000)).toBeCloseTo(1, 5) // full period → cold again
  })
})

describe('determinism', () => {
  it('same seed → identical spin evolution over N sweeps', () => {
    const a = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.27, seed: 99, cellSize: 2 }), 80, 80)
    const b = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.27, seed: 99, cellSize: 2 }), 80, 80)
    for (let s = 0; s < 30; s++) { advanceIsing(a, 2.27, 1); advanceIsing(b, 2.27, 1) }
    expect([...a.spins]).toEqual([...b.spins])
  })

  it('different seed → different evolution', () => {
    const a = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.27, seed: 1, cellSize: 2 }), 80, 80)
    const b = createIsingState(cfg({ tempMode: 'fixed', temperature: 2.27, seed: 2, cellSize: 2 }), 80, 80)
    for (let s = 0; s < 30; s++) { advanceIsing(a, 2.27, 1); advanceIsing(b, 2.27, 1) }
    expect([...a.spins]).not.toEqual([...b.spins])
  })
})

describe('headline: the phase transition', () => {
  it('orders at low temperature and stays disordered at high temperature', () => {
    const lowT = runAbsM(1.4, 400)
    const highT = runAbsM(3.6, 400)
    // Low T: the lattice spontaneously magnetizes into big domains → |M| well above
    // the disordered baseline (~1/√N ≈ 0.017 for N=3600).
    expect(lowT).toBeGreaterThan(0.5)
    // High T: thermal noise dominates → |M| stays near zero.
    expect(highT).toBeLessThan(0.25)
    // …and the transition is unmistakable: ordered ≫ disordered.
    expect(lowT).toBeGreaterThan(highT * 2)
    expect(Number.isNaN(lowT)).toBe(false)
    expect(Number.isNaN(highT)).toBe(false)
  })
})
