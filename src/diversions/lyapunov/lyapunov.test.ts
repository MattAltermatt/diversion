import { describe, it, expect } from 'vitest'
import {
  seqBits, computeView, lyapunovExponent, FRAG_SRC, MAX_ITER, MAX_SEQ,
} from './lyapunov'
import { SEQUENCES } from './schema'

describe('seqBits', () => {
  it('maps A→0 and B→1', () => {
    expect(seqBits('AB')).toEqual([0, 1])
    expect(seqBits('AABAB')).toEqual([0, 0, 1, 0, 1])
    expect(seqBits('BBBBBBAAAAAA')).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0])
  })
  it('every schema sequence fits the shader uniform bound', () => {
    for (const s of SEQUENCES) expect(seqBits(s).length).toBeLessThanOrEqual(MAX_SEQ)
  })
})

describe('computeView', () => {
  it('is deterministic per seed + time', () => {
    expect(computeView(7, 0.5, 3.2)).toEqual(computeView(7, 0.5, 3.2))
  })
  it('varies across seeds', () => {
    expect(computeView(1, 0.5, 0)).not.toEqual(computeView(2, 0.5, 0))
  })
  it('always keeps the window inside the valid logistic band [1.9, 4.0]', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const t of [0, 5, 50, 500, 5000]) {
        const { cx, cy, hw } = computeView(seed, 0.9, t)
        expect(cx - hw).toBeGreaterThanOrEqual(1.9 - 1e-9)
        expect(cx + hw).toBeLessThanOrEqual(4.0 + 1e-9)
        expect(cy - hw).toBeGreaterThanOrEqual(1.9 - 1e-9)
        expect(cy + hw).toBeLessThanOrEqual(4.0 + 1e-9)
        expect(hw).toBeGreaterThan(0)
      }
    }
  })
  it('honors zoom as the half-width when there is room', () => {
    // seed 1's centre is well away from the band edges, so a small zoom passes through.
    const { hw } = computeView(1, 0.3, 0)
    expect(hw).toBeCloseTo(0.3, 5)
  })
})

describe('lyapunovExponent (CPU reference — sign correctness)', () => {
  it('is NEGATIVE in a stable region (a=b=2.5 → attracting fixed point)', () => {
    // logistic map at r=2.5 converges to x*=0.6 with |f\'|=0.5 < 1 → λ = ln(0.5) < 0
    const lambda = lyapunovExponent(2.5, 2.5, seqBits('AB'), 300)
    expect(lambda).toBeLessThan(0)
    expect(lambda).toBeCloseTo(Math.log(0.5), 1)
  })
  it('is POSITIVE in a chaotic region (a=b=3.9 → chaotic, exponentially diverging)', () => {
    // r=3.9 is deep in the chaotic band; the orbit never settles → λ > 0. (Exactly
    // r=4 is degenerate from x₀=0.5, so we sample just inside the chaotic regime.)
    const lambda = lyapunovExponent(3.9, 3.9, seqBits('AB'), 400)
    expect(lambda).toBeGreaterThan(0.2)
  })
  it('a mixed A/B window straddles the boundary (one side stable, one chaotic)', () => {
    // a stable-ish (2.6) mixed with a chaotic (3.9) — the exponent stays finite & real
    const lambda = lyapunovExponent(2.6, 3.9, seqBits('AABAB'), 300)
    expect(Number.isFinite(lambda)).toBe(true)
  })
})

describe('FRAG_SRC', () => {
  it('declares every uniform the renderer sets', () => {
    for (const u of ['u_res', 'u_center', 'u_hw', 'u_shimmer', 'u_iter', 'u_seq', 'u_seqLen',
                     'u_depth', 'u_cycle', 'u_chaos', 'u_cityEdge', 'u_cityDeep']) {
      expect(FRAG_SRC).toContain(u)
    }
  })
  it('unrolls the iteration loop to the compile-time MAX_ITER bound', () => {
    expect(FRAG_SRC).toContain('k < 400')
    expect(MAX_ITER).toBe(400)
  })
})
