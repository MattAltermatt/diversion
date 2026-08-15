import { describe, it, expect } from 'vitest'
import { temperedPick, temperedWeights, resolveFleet, allocateFleet } from './scheduler'

const HIST = new Uint32Array([62, 21, 12, 5]) // the spec §5 worked example

function approx(actual: Float64Array, expected: number[], tol = 0.002) {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) expect(actual[i]).toBeCloseTo(expected[i], 3)
  void tol
}

describe('temperedWeights', () => {
  it('k=1 is strictly proportional', () => {
    approx(temperedWeights(HIST, 1), [0.62, 0.21, 0.12, 0.05])
  })

  it('k=0.5 is the shipped default from the spec table', () => {
    approx(temperedWeights(HIST, 0.5), [0.4337, 0.2524, 0.1908, 0.1231])
  })

  it('k=0 is flat over the EXPOSED bands only', () => {
    const h = new Uint32Array([62, 21, 0, 5]) // band 2 extinct
    approx(temperedWeights(h, 0), [1 / 3, 1 / 3, 0, 1 / 3])
  })

  it('k=2 piles onto the dominant band', () => {
    approx(temperedWeights(HIST, 2), [0.8631, 0.0990, 0.0323, 0.0056])
  })

  it('always sums to 1 when anything is exposed', () => {
    for (const k of [0, 0.25, 0.5, 1, 2, 4]) {
      const sum = temperedWeights(HIST, k).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1, 6)
    }
  })

  it('is all-zero when nothing is exposed', () => {
    const w = temperedWeights(new Uint32Array(4), 0.5)
    expect(w.reduce((a, b) => a + b, 0)).toBe(0)
  })
})

describe('temperedPick', () => {
  it('never returns an extinct band', () => {
    const h = new Uint32Array([50, 0, 0, 50])
    for (let i = 0; i < 400; i++) {
      const pick = temperedPick(h, 0, () => i / 400)
      expect(pick === 0 || pick === 3).toBe(true)
    }
  })

  it('returns -1 when nothing is exposed', () => {
    expect(temperedPick(new Uint32Array(4), 0.5, () => 0.5)).toBe(-1)
  })

  it('covers every exposed band across many draws', () => {
    let n = 0
    const seen = new Set<number>()
    for (let i = 0; i < 1000; i++) {
      n = (n * 1664525 + 1013904223) >>> 0
      seen.add(temperedPick(HIST, 0.5, () => n / 4294967296))
    }
    expect(seen).toEqual(new Set([0, 1, 2, 3]))
  })

  it('is in-range for rand() at both extremes', () => {
    expect(temperedPick(HIST, 0.5, () => 0)).toBe(0)
    expect(temperedPick(HIST, 0.5, () => 0.999999)).toBe(3)
  })
})

// ─── Fleet allocation ───────────────────────────────────────────────────────

const total = (...v: number[]) => Uint32Array.from(v)

describe('resolveFleet', () => {
  it('leaves a fleet larger than the band count alone', () => {
    expect(resolveFleet(20, 6)).toBe(20)
  })

  it('clamps UP to the band count, so no band can go unallocated', () => {
    expect(resolveFleet(4, 12)).toBe(12)
  })
})

describe('allocateFleet', () => {
  it('sums to exactly the fleet size', () => {
    const a = allocateFleet(total(5000, 3000, 1500, 500), 1, 20)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(20)
  })

  it('is proportional to band mass at k = 1', () => {
    // 50/50 in the picture means 50/50 of the turrets — the headline requirement.
    expect([...allocateFleet(total(4000, 4000), 1, 20)]).toEqual([10, 10])
    expect([...allocateFleet(total(6000, 2000), 1, 20)]).toEqual([15, 5])
  })

  it('is flat across bands at k = 0', () => {
    expect([...allocateFleet(total(9000, 900, 90), 0, 12)]).toEqual([4, 4, 4])
  })

  it('piles onto the dominant band above k = 1', () => {
    const a = allocateFleet(total(6000, 2000), 2, 20)
    expect(a[0]).toBeGreaterThan(15)
    expect(a[1]).toBeGreaterThanOrEqual(1)
  })

  it('gives a rounding-sliver band at least one turret', () => {
    // 1 cell out of 8001 is 0.0025 of 20 turrets. Without the reserved floor it
    // rounds to nothing, nothing ever shoots that band, and the picture can never
    // reach zero cells — a permanent hang, not a balance wobble.
    const a = allocateFleet(total(8000, 1), 1, 20)
    expect(a[1]).toBe(1)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(20)
  })

  it('gives every band one turret when the fleet equals the band count', () => {
    const a = allocateFleet(total(500, 400, 300, 200, 100, 50), 1, 6)
    expect([...a]).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('allocates nothing to a band with no cells', () => {
    const a = allocateFleet(total(500, 0, 300), 1, 9)
    expect(a[1]).toBe(0)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(9)
  })

  it('never over-allocates when the fleet cannot cover one per band', () => {
    // resolveFleet makes this unreachable from the running piece, but a direct
    // caller must not get back more turrets than it asked for.
    const a = allocateFleet(total(500, 400, 300, 200), 1, 2)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(2)
    expect([...a]).toEqual([1, 1, 0, 0])
  })
})
