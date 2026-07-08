import { describe, it, expect } from 'vitest'
import { createState, evolveStep, stepEvolution, resize, applyConfig } from './geneticImage'
import { geneticImageSchema } from './schema'

const base = geneticImageSchema.parse({})

describe('createState', () => {
  it('scores a sane, finite non-negative initial error', () => {
    const s = createState({ ...base, seed: 1 }, 400, 300)
    expect(Number.isFinite(s.bestError)).toBe(true)
    expect(s.bestError).toBeGreaterThanOrEqual(0)
    expect(s.initialError).toBe(s.bestError)
  })

  it('genome has exactly polygonCount polygons of verticesPerPolygon vertices', () => {
    const s = createState({ ...base, polygonCount: 12, verticesPerPolygon: 5, seed: 1 }, 400, 300)
    expect(s.genome).toHaveLength(12)
    for (const poly of s.genome) expect(poly.points).toHaveLength(10)
  })

  it('sizes the working buffer to workingResolution, preserving canvas aspect', () => {
    const s = createState({ ...base, workingResolution: 64, seed: 1 }, 800, 400) // 2:1 aspect
    expect(s.scratch.height).toBe(64)
    expect(s.scratch.width).toBe(128)
  })
})

describe('determinism — same seed reproduces the identical evolution', () => {
  it('produces byte-identical genomes and error curves for N steps', () => {
    const cfg = { ...base, seed: 777, polygonCount: 6, mutationsPerFrame: 10 }
    const a = createState(cfg, 320, 240)
    const b = createState(cfg, 320, 240)

    for (let i = 0; i < 200; i++) {
      const ea = evolveStep(a)
      const eb = evolveStep(b)
      expect(eb).toBe(ea)
      expect(b.bestError).toBe(a.bestError)
    }
    expect(JSON.stringify(b.genome)).toBe(JSON.stringify(a.genome))
  })

  it('a different seed diverges from the original run', () => {
    const cfgA = { ...base, seed: 1, polygonCount: 6 }
    const cfgB = { ...base, seed: 2, polygonCount: 6 }
    const a = createState(cfgA, 320, 240)
    const b = createState(cfgB, 320, 240)
    for (let i = 0; i < 50; i++) {
      evolveStep(a)
      evolveStep(b)
    }
    expect(JSON.stringify(a.genome)).not.toBe(JSON.stringify(b.genome))
  })
})

describe('hill-climb monotonicity', () => {
  it('bestError never increases across any sequence of evolveStep calls', () => {
    const s = createState({ ...base, seed: 55, polygonCount: 8 }, 320, 240)
    let prev = s.bestError
    for (let i = 0; i < 500; i++) {
      evolveStep(s)
      expect(s.bestError).toBeLessThanOrEqual(prev)
      prev = s.bestError
    }
  })

  it('bestError strictly improves (or holds) over many stepEvolution frames', () => {
    const s = createState({ ...base, seed: 3, polygonCount: 8, mutationsPerFrame: 20 }, 320, 240)
    const start = s.bestError
    for (let i = 0; i < 40; i++) stepEvolution(s, 16)
    expect(s.bestError).toBeLessThanOrEqual(start)
  })
})

describe('resize', () => {
  it('updates w/h only — the fitness working buffers are untouched (same reference)', () => {
    const s = createState({ ...base, seed: 1 }, 320, 240)
    const scratchRef = s.scratch
    const targetRef = s.targetBuf
    resize(s, { width: 800, height: 600 })
    expect(s.w).toBe(800)
    expect(s.h).toBe(600)
    expect(s.scratch).toBe(scratchRef)
    expect(s.targetBuf).toBe(targetRef)
  })
})

describe('applyConfig (live update)', () => {
  it('applies a non-structural edit (background) live and returns true', () => {
    const s = createState({ ...base, seed: 1 }, 320, 240)
    const ok = applyConfig(s, { ...base, seed: 1, background: '#112233' })
    expect(ok).toBe(true)
    expect(s.cfg.background).toBe('#112233')
    expect(s.bg).toEqual([0x11, 0x22, 0x33])
  })

  it('rejects a structural edit (polygonCount) so the framework falls back to setup()', () => {
    const s = createState({ ...base, seed: 1 }, 320, 240)
    const ok = applyConfig(s, { ...base, seed: 1, polygonCount: base.polygonCount + 1 })
    expect(ok).toBe(false)
  })
})
