import { describe, it, expect } from 'vitest'
import { randomGenome, randomPolygon, mutate, cloneGenome } from './genome'
import { mulberry32 } from '../../framework/rng'

describe('randomPolygon', () => {
  it('produces exactly verticesPerPolygon points, all normalized 0..1', () => {
    const rng = mulberry32(1)
    const poly = randomPolygon(rng, 5)
    expect(poly.points).toHaveLength(10)
    for (const v of poly.points) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(poly.r).toBeGreaterThanOrEqual(0)
    expect(poly.r).toBeLessThanOrEqual(255)
    expect(poly.a).toBeGreaterThan(0)
    expect(poly.a).toBeLessThanOrEqual(1)
  })
})

describe('randomGenome', () => {
  it('produces exactly `count` polygons', () => {
    const rng = mulberry32(2)
    const genome = randomGenome(rng, 7, 4)
    expect(genome).toHaveLength(7)
    for (const poly of genome) expect(poly.points).toHaveLength(8)
  })
})

describe('cloneGenome', () => {
  it('is a deep copy — mutating the clone does not affect the original', () => {
    const rng = mulberry32(3)
    const genome = randomGenome(rng, 2, 4)
    const clone = cloneGenome(genome)
    clone[0].points[0] = -999
    clone[0].r = -999
    expect(genome[0].points[0]).not.toBe(-999)
    expect(genome[0].r).not.toBe(-999)
  })
})

describe('mutate', () => {
  it('changes exactly one polygon, leaving the rest byte-for-byte identical', () => {
    const rng = mulberry32(42)
    const genome = randomGenome(rng, 6, 4)
    const before = cloneGenome(genome)
    const mutated = mutate(genome, rng)

    const changedPolygons = mutated.filter((poly, i) => JSON.stringify(poly) !== JSON.stringify(before[i]))
    expect(changedPolygons).toHaveLength(1)
  })

  it('never touches the input genome (pure function)', () => {
    const rng = mulberry32(9)
    const genome = randomGenome(rng, 3, 4)
    const before = JSON.stringify(genome)
    mutate(genome, rng)
    expect(JSON.stringify(genome)).toBe(before)
  })

  it('a forced vertex mutation moves exactly one coordinate pair within bounds', () => {
    // Fake rng sequence: pick polygon 0, kind='vertex' (< 0.5), vertex 0,
    // then two deltas. mutate() consumes: pi, kind, vi, dx, dy — 5 calls.
    const seq = [0, 0.1, 0, 0.9, 0.9]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const genome = [{ points: [0.5, 0.5, 0.1, 0.1, 0.9, 0.9], r: 10, g: 20, b: 30, a: 0.5 }]
    const mutated = mutate(genome, rng)
    expect(mutated[0].points[0]).not.toBe(0.5)
    expect(mutated[0].points[1]).not.toBe(0.5)
    // Untouched vertices stay put.
    expect(mutated[0].points[2]).toBe(0.1)
    expect(mutated[0].points[3]).toBe(0.1)
    expect(mutated[0].r).toBe(10)
    for (const v of mutated[0].points) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('a forced color mutation changes exactly one channel, leaving points untouched', () => {
    // pi=0, kind='color' (>= 0.5), channel=0 (r), delta.
    const seq = [0, 0.9, 0.0, 0.9]
    let i = 0
    const rng = () => seq[i++ % seq.length]
    const genome = [{ points: [0.5, 0.5, 0.1, 0.1, 0.9, 0.9], r: 10, g: 20, b: 30, a: 0.5 }]
    const mutated = mutate(genome, rng)
    expect(mutated[0].points).toEqual(genome[0].points)
    expect(mutated[0].g).toBe(20)
    expect(mutated[0].b).toBe(30)
    expect(mutated[0].a).toBe(0.5)
    expect(mutated[0].r).not.toBe(10)
    expect(mutated[0].r).toBeGreaterThanOrEqual(0)
    expect(mutated[0].r).toBeLessThanOrEqual(255)
  })
})
