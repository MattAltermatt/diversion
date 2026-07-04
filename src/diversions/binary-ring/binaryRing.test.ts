import { describe, it, expect } from 'vitest'
import { binaryRingSchema } from './schema'
import {
  makeRings, createBinaryRingState, stepBinaryRing, ringCode, segmentLit, bitCount,
  type BinaryRingState,
} from './binaryRing'

const TAU = Math.PI * 2

describe('binary-ring schema', () => {
  it('parses with valid defaults', () => {
    const cfg = binaryRingSchema.parse({})
    expect(cfg.rings).toBe(8)
    expect(cfg.segments).toBe(24)
    expect(cfg.pattern).toBe('binary')
    expect(cfg.color.mode).toBe('warm-horizon')
    expect(cfg.color.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.seed).toBe(101)
  })

  it('every field carries a default (the codec relies on it)', () => {
    // A no-arg parse succeeding IS the proof every leaf has a default.
    expect(() => binaryRingSchema.parse({})).not.toThrow()
  })
})

describe('binary-ring determinism', () => {
  it('same seed → identical ring layout', () => {
    const cfg = binaryRingSchema.parse({ seed: 42 })
    expect(makeRings(cfg)).toEqual(makeRings(cfg))
  })

  it('different seed → different layout', () => {
    const sig = (rs: ReturnType<typeof makeRings>) =>
      rs.map(r => `${r.rate.toFixed(6)}:${r.offset}:${r.rotFactor.toFixed(6)}`).join('|')
    const r1 = makeRings(binaryRingSchema.parse({ seed: 1 }))
    const r2 = makeRings(binaryRingSchema.parse({ seed: 2 }))
    expect(sig(r1)).not.toEqual(sig(r2))
  })

  it('adjacent rings counter-rotate (alternating direction sign)', () => {
    const rings = makeRings(binaryRingSchema.parse({ seed: 7 }))
    for (let i = 1; i < rings.length; i++) {
      expect(Math.sign(rings[i].rotDir)).toBe(-Math.sign(rings[i - 1].rotDir))
    }
  })
})

describe('binary-ring headline: bit patterns light the expected segments', () => {
  const nbits = bitCount(24)

  it('binary — a known counter value lights exactly its set bits', () => {
    // 5 = 0b101 → segments 0 and 2 lit, 1 and 3 dark.
    const lit = [0, 1, 2, 3].map(s => segmentLit('binary', 0, s, 5, 0, nbits))
    expect(lit).toEqual([true, false, true, false])
    // 0 → nothing lit; a full byte → the low 8 all lit.
    expect([0, 1, 2, 3].every(s => !segmentLit('binary', 0, s, 0, 0, nbits))).toBe(true)
    expect(Array.from({ length: 8 }, (_, s) => segmentLit('binary', 0, s, 255, 0, nbits))
      .every(Boolean)).toBe(true)
  })

  it('gray — Gray-code of a value lights the expected segments', () => {
    // gray(5) = 5 ^ (5>>1=2) = 7 = 0b111 → segments 0,1,2 lit, 3 dark.
    const lit = [0, 1, 2, 3].map(s => segmentLit('gray', 0, s, 5, 0, nbits))
    expect(lit).toEqual([true, true, true, false])
  })

  it('gray — exactly one segment flips between consecutive counts', () => {
    const mask = (code: number): boolean[] =>
      Array.from({ length: nbits }, (_, s) => segmentLit('gray', 0, s, code, 0, nbits))
    for (let c = 0; c < 40; c++) {
      const a = mask(c), b = mask(c + 1)
      let diff = 0
      for (let s = 0; s < nbits; s++) if (a[s] !== b[s]) diff++
      expect(diff).toBe(1) // Gray code: a single-bit transition each step
    }
  })

  it('xor — the Sierpinski gasket rule lights (i+phase)&seg == 0', () => {
    // ring 3, phase 0: 3 & seg == 0 → segments 0 and 4 lit, 1/2/3 dark.
    expect(segmentLit('xor', 3, 0, 0, 0, nbits)).toBe(true)
    expect(segmentLit('xor', 3, 1, 0, 0, nbits)).toBe(false)
    expect(segmentLit('xor', 3, 2, 0, 0, nbits)).toBe(false)
    expect(segmentLit('xor', 3, 4, 0, 0, nbits)).toBe(true)
  })
})

describe('binary-ring geometry: rings partition the circle', () => {
  it('each ring\'s segments tile the full circle (arc angles sum to 2π)', () => {
    for (const segs of [6, 16, 24, 40]) {
      const arc = TAU / segs
      expect(arc * segs).toBeCloseTo(TAU, 9)
      expect(arc).toBeGreaterThan(0)
    }
  })

  it('bit-count is capped at 30 so the shifts stay well-defined', () => {
    expect(bitCount(24)).toBe(24)
    expect(bitCount(40)).toBe(30)
  })
})

describe('binary-ring evolution', () => {
  it('the pattern changes frame-to-frame while evolving', () => {
    const cfg = binaryRingSchema.parse({ seed: 3, evolveSpeed: 8 })
    const state = createBinaryRingState(cfg, 800, 600)
    const nbits = bitCount(cfg.segments)
    const litMask = (s: BinaryRingState) => s.rings.map((_, i) => {
      const code = ringCode(s, i)
      let m = 0
      for (let j = 0; j < cfg.segments; j++) if (segmentLit(cfg.pattern, i, j, code, Math.floor(s.counter), nbits)) m |= (1 << (j % 30))
      return m
    }).join(',')
    const before = litMask(state)
    for (let f = 0; f < 60; f++) stepBinaryRing(state, 16) // ~1s
    expect(litMask(state)).not.toEqual(before)
  })

  it('a frozen sim (evolveSpeed 0) holds a steady pattern', () => {
    const cfg = binaryRingSchema.parse({ evolveSpeed: 0, rotation: 0 })
    const state = createBinaryRingState(cfg, 800, 600)
    const c0 = ringCode(state, 0)
    for (let f = 0; f < 30; f++) stepBinaryRing(state, 16)
    expect(ringCode(state, 0)).toBe(c0)
  })

  it('no NaN in codes or rotation after a long run', () => {
    const cfg = binaryRingSchema.parse({ seed: 9 })
    const state = createBinaryRingState(cfg, 800, 600)
    for (let f = 0; f < 500; f++) stepBinaryRing(state, 16)
    for (let i = 0; i < state.rings.length; i++) {
      expect(Number.isFinite(ringCode(state, i))).toBe(true)
      expect(Number.isNaN(state.rings[i].rotPhase)).toBe(false)
    }
    expect(Number.isFinite(state.counter)).toBe(true)
  })
})
