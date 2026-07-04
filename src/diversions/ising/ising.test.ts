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
