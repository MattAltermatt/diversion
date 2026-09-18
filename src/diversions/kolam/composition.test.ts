import { describe, it, expect } from 'vitest'
import { buildComposition, recordDraws, type Composition, type Role } from './composition'
import { DEFAULTS } from './config'

const W = 1200, H = 900
const SEEDS = Array.from({ length: 400 }, (_, i) => 11000 + i * 104729)
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
const STRUCTURE: Role[] = ['centre', 'band', 'lace']

/** The rng draw order at seed 12345, first 240 call sites. Regenerate ONLY when
 *  a change to the draw order is intended; a diff here means the world moved. */
const GOLDEN = 'vocabShuffle,vocabShuffle,vocabShuffle,vocabShuffle,vocabSize,c/chalkShuffle,c/chalkShuffle,c/chalkShuffle,c/chalkShuffle,c/chalkShuffle,c/chalkShuffle,c/chalkSize,centreR,centreP,wobble@centre,wobble@centre,wobble@centre,centreHatch,nMid,radiusJitter,radiusJitter,radiusJitter,radiusJitter,radiusJitter,bandGate,bandGate,bandGate,bandGate,bandGate,lobeGate,bandAmp,bandThick,bandShape,bandP,wobble@band,wobble@band,wobble@band,c/chalkGate,c/chalkPick,ringMult,ringPhase,motifPick,ringCount,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,lobeGate,bandAmp,bandThick,bandShape,wobble@band,wobble@band,wobble@band,c/chalkGate,c/chalkPick,ringMult,ringPhase,motifPick,ringCount,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,c/chalkGate,ringMult,ringPhase,motifPick,ringCount,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,wobble@ring,terminalGate,c/chalkGate,c/chalkPick,terminalK,terminalR,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,terminalSize,wobble@terminal,wobble@terminal,wobble@terminal,laceMult,laceDepth,wobble@lace,wobble@lace,wobble@lace,motifPick,c/chalkGate,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest,wobble@laceNest'

describe('the grammar', () => {
  it('always emits the fixed register order, outward', () => {
    const c = buildComposition(DEFAULTS, W, H, 42)
    const roles = c.strokes.map((s) => s.role)
    expect(roles[0]).toBe('centre')
    expect(roles).toContain('lace')
    expect(roles[roles.length - 1]).toBe('kaavi')
  })

  it('arc-length parameterises every stroke', () => {
    const bad: string[] = []
    for (const s of buildComposition(DEFAULTS, W, H, 7).strokes) {
      if (s.cum.length !== s.pts.length) bad.push(`cum ${s.cum.length} vs pts ${s.pts.length}`)
      if (Math.abs(s.cum[s.cum.length - 1] - s.len) > 1e-6) bad.push('cum tail != len')
      if (!(s.len > 0)) bad.push('zero-length stroke')
    }
    expect(bad).toEqual([])
  })
})

// ⚠️ Assertions are HOISTED out of the loops. This repo has two recorded CI
// timeouts from expect() inside a hot sim loop, and there is no global
// testTimeout. Collect violations, assert once.
describe('the composition guarantees', () => {
  it('always has at least TWO bands — a mostly-ring draw reads as scattered', () => {
    const bad = SEEDS.filter((s) =>
      buildComposition(DEFAULTS, W, H, s).types.filter((t) => t === 'band').length < 2)
    expect(bad).toEqual([])
  }, 30000)

  // Measured on exact integer repeat counts, never on geometry: two geometric
  // detectors were written during design and both were wrong, one of them
  // failing its own positive control.
  it('is at least N/2-fold', () => {
    const bad: string[] = []
    for (const N of [4, 6, 8, 10, 12, 16]) {
      for (const s of SEEDS.slice(0, 100)) {
        const c = buildComposition({ ...DEFAULTS, symmetry: N }, W, H, s)
        const g = c.repeats.reduce((a, r) => gcd(a, r), N)
        if (g < N / 2) bad.push(`N=${N} seed=${s} gcd=${g}`)
      }
    }
    expect(bad).toEqual([])
  }, 60000)

  // ⚠️ The floor is the SOLE guard for the omit-bandLobes mutant: every other
  // recorded source is a multiple of N/2, so the gcd assertion above is entirely
  // insensitive to the omission. Measured min 5, max 13 — an earlier draft
  // asserted > 8, which is red for 530 of 1000 builds.
  it('records every angular repeat, so the gcd is not vacuous', () => {
    const minLen = Math.min(...SEEDS.map((s) => buildComposition(DEFAULTS, W, H, s).repeats.length))
    expect(minLen).toBeGreaterThanOrEqual(5)
  }, 30000)

  it('never puts coloured chalk on STRUCTURE — by role, not by length', () => {
    const bad: string[] = []
    for (const s of SEEDS) {
      for (const st of buildComposition({ ...DEFAULTS, colouredChalk: 1 }, W, H, s).strokes) {
        if (STRUCTURE.includes(st.role) && st.col !== '#f7f3ea') bad.push(`${s}:${st.role}:${st.col}`)
      }
    }
    expect(bad).toEqual([])
  }, 30000)

  it('clears the stroke-count FLOOR', () => {
    const counts = SEEDS.map((s) => buildComposition(DEFAULTS, W, H, s).strokes.length)
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(70)
  }, 30000)

  it('colour cannot move the geometry — colouredChalk has its own rng stream', () => {
    const geom = (c: Composition) =>
      c.strokes.map((s) => `${s.pts.length}:${Math.round(s.len)}`).join('|')
    const bad = SEEDS.slice(0, 100).filter((s) =>
      geom(buildComposition({ ...DEFAULTS, colouredChalk: 0.4 }, W, H, s))
      !== geom(buildComposition({ ...DEFAULTS, colouredChalk: 0.9 }, W, H, s)))
    expect(bad).toEqual([])
  }, 30000)

  // ⚠️ SNAPSHOT THE TAGS, NOT THE VALUES. A PRNG's output SEQUENCE is invariant
  // under consumer reordering, so a plain draw log is byte-identical whether or
  // not two rng() calls are transposed — an earlier draft's golden vector
  // guarded only "mulberry32 is unchanged". Tags name the CALL SITE, so the
  // sequence is direction-sensitive.
  //
  // ⚠️ And snapshot a PREFIX. The point is that adding content at the END must
  // not go red. At this seed the stream is 330 tags; 240 covers the centre,
  // every register, the terminals and the lace, stopping before the interstitial
  // fill and the kaavi.
  it('pins the rng draw order by CALL SITE', () => {
    const { tags } = recordDraws(DEFAULTS, W, H, 12345)
    expect(tags.length).toBeGreaterThan(240)
    expect(tags.slice(0, 240).join(',')).toBe(GOLDEN)
  })

  // ⚠️ The >=2-bands guarantee does NOT pin the 0.58 probability — mutating it to
  // 0.20 or 0.95 still yields min 2 every time. The two claims need separate
  // tests. Measured share: 0.6461.
  it('bands are the MAJORITY of registers — the armature, not an accent', () => {
    let bands = 0, total = 0
    for (const s of SEEDS) {
      const t = buildComposition(DEFAULTS, W, H, s).types
      bands += t.filter((x) => x === 'band').length
      total += t.length
    }
    expect(bands / total).toBeGreaterThan(0.55)
    expect(bands / total).toBeLessThan(0.80)
  }, 30000)
})
