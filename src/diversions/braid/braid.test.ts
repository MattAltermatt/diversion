import { describe, it, expect } from 'vitest'
import { braidSchema } from './schema'
import { buildBraid, computePeriod, type Braid } from './braid'

const W = 800
const H = 600
const base = braidSchema.parse({})

function isFinitePolar(braid: Braid): boolean {
  for (const s of braid.strands) {
    for (const p of s.pts) {
      if (!Number.isFinite(p.ang) || !Number.isFinite(p.rad) || p.rad <= 0) return false
    }
  }
  return true
}

describe('braid schema', () => {
  it('parses with valid defaults', () => {
    expect(base.strandCount).toBe(5)
    expect(base.twist).toBe(2)
    expect(base.colorMode).toBe('palette')
    expect(base.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every slider field declares min+max (invariant #4)', () => {
    const shape = braidSchema.shape
    for (const [key, field] of Object.entries(shape)) {
      const meta = (field as { meta?: () => Record<string, unknown> }).meta?.() ?? {}
      if (meta.ui === 'slider') {
        expect(typeof meta.min, `${key}.min`).toBe('number')
        expect(typeof meta.max, `${key}.max`).toBe('number')
        expect(typeof meta.step, `${key}.step`).toBe('number')
      }
    }
  })
})

describe('computePeriod', () => {
  it('returns the identity-closing period for the alternating plait', () => {
    expect(computePeriod(3)).toBe(6)
    expect(computePeriod(4)).toBe(8)
    // period is always even (a whole number of odd/even column pairs)
    for (let n = 3; n <= 8; n++) expect(computePeriod(n) % 2).toBe(0)
  })

  it('the alternating word actually returns to identity after `period` columns', () => {
    for (let n = 3; n <= 8; n++) {
      const period = computePeriod(n)
      const atLane = Array.from({ length: n }, (_, i) => i)
      for (let c = 0; c < period; c++) {
        const start = c % 2 === 0 ? 0 : 1
        for (let k = start; k + 1 < n; k += 2) {
          const t = atLane[k]; atLane[k] = atLane[k + 1]; atLane[k + 1] = t
        }
      }
      expect(atLane).toEqual([...Array(n).keys()])
    }
  })
})

describe('determinism', () => {
  it('same seed → identical braid word + strand paths', () => {
    const a = buildBraid(base, W, H)
    const b = buildBraid(base, W, H)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('different seed → different look (rotation / palette shift)', () => {
    const a = buildBraid(base, W, H)
    const b = buildBraid({ ...base, seed: base.seed + 1 }, W, H)
    const moved = a.phase0 !== b.phase0 || a.baseHue !== b.baseHue || a.parity !== b.parity
    expect(moved).toBe(true)
    // and the actual sampled geometry differs
    expect(a.strands[0].pts[0].ang).not.toBe(b.strands[0].pts[0].ang)
  })
})

describe('headline: a valid permutation braid with a consistent weave', () => {
  it('every column is a valid permutation of the lanes, and the ring closes', () => {
    for (let n = 3; n <= 8; n++) {
      const braid = buildBraid({ ...base, strandCount: n }, W, H)
      const sorted = [...Array(n).keys()]
      for (let c = 0; c <= braid.M; c++) {
        const lanesAtCol = braid.strands.map((s) => braid.laneSeq[s.index][c])
        expect([...lanesAtCol].sort((x, y) => x - y)).toEqual(sorted)
      }
      // closed: strand ends on the lane it started (permutation = identity)
      for (const s of braid.strands) {
        expect(braid.laneSeq[s.index][braid.M]).toBe(braid.laneSeq[s.index][0])
      }
    }
  })

  it('every generator swaps two ADJACENT lanes', () => {
    const braid = buildBraid(base, W, H)
    expect(braid.crossings.length).toBeGreaterThan(0)
    for (const x of braid.crossings) {
      expect(x.lowLane).toBeGreaterThanOrEqual(0)
      expect(x.lowLane).toBeLessThanOrEqual(braid.n - 2)
      // overLane is one of the swapped pair, and the over strand really sits on
      // that lane at this column (before the swap)
      expect([x.lowLane, x.lowLane + 1]).toContain(x.overLane)
      expect(braid.laneSeq[x.overStrand][x.col]).toBe(x.overLane)
    }
  })

  it('crossings follow the consistent plain-weave checkerboard, and both over/under occur', () => {
    const braid = buildBraid(base, W, H)
    let outerOver = 0
    let innerOver = 0
    for (const x of braid.crossings) {
      // recompute the rule and confirm the stored assignment matches it exactly
      const expected = (x.lowLane + braid.parity) % 2 === 0 ? x.lowLane + 1 : x.lowLane
      expect(x.overLane).toBe(expected)
      if (x.overLane === x.lowLane + 1) outerOver++
      else innerOver++
    }
    // alternation: the weave uses BOTH over and under, not one buried surface
    expect(outerOver).toBeGreaterThan(0)
    expect(innerOver).toBeGreaterThan(0)
  })

  it('strand paths are finite, non-degenerate, and never NaN', () => {
    for (let n = 3; n <= 8; n++) {
      for (const twist of [1, 3, 6]) {
        const braid = buildBraid({ ...base, strandCount: n, twist }, W, H)
        expect(braid.total).toBe(braid.M * braid.subSteps)
        for (const s of braid.strands) expect(s.pts.length).toBe(braid.total)
        expect(isFinitePolar(braid)).toBe(true)
        expect(braid.laneSpacing).toBeGreaterThan(0)
        expect(braid.meanR).toBeGreaterThan(0)
      }
    }
  })
})
