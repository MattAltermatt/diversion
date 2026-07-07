import { describe, it, expect } from 'vitest'
import { wanderSchema, type WanderConfig } from './schema'
import {
  createWanderState, stepWalker, runSteps, buildLut, reseed,
  coverageFraction, type Segment,
} from './wander'

const cfg = (over: Partial<WanderConfig> = {}): WanderConfig =>
  wanderSchema.parse({ ...over })

describe('wander schema', () => {
  it('parses with valid defaults', () => {
    const c = wanderSchema.parse({})
    expect(c.walkers).toBe(3)
    expect(c.edges).toBe('wrap')
    expect(c.trailStyle).toBe('accumulate')
    expect(c.colors.length).toBeGreaterThanOrEqual(2)
    expect(c.background).toMatch(/^#[0-9a-fA-F]{6}$/)
  })

  it('every field carries a default (codec relies on it)', () => {
    // A partial parse must fully populate — no field is left undefined.
    const c = wanderSchema.parse({}) as Record<string, unknown>
    for (const k of Object.keys(wanderSchema.shape)) {
      expect(c[k]).toBeDefined()
    }
  })
})

describe('buildLut', () => {
  it('returns 256 css colours, cyclic (endpoints differ, all rgb())', () => {
    const lut = buildLut(['#ff0000', '#00ff00', '#0000ff'])
    expect(lut).toHaveLength(256)
    expect(lut.every((c) => /^rgb\(\d+,\d+,\d+\)$/.test(c))).toBe(true)
    expect(lut[0]).not.toBe(lut[128])
  })
})

// Collect the walk path (walker positions) for N steps of a fresh state.
function walkPath(config: WanderConfig, n: number): Array<[number, number]> {
  const s = createWanderState(config, 800, 600)
  const path: Array<[number, number]> = []
  for (let i = 0; i < n; i++) {
    for (const wk of s.walkers) stepWalker(wk, s.cfg, s.w, s.h, s.lut)
    path.push([s.walkers[0].x, s.walkers[0].y])
  }
  return path
}

describe('determinism', () => {
  it('same seed → identical initial walkers', () => {
    const a = createWanderState(cfg({ seed: 123 }), 800, 600)
    const b = createWanderState(cfg({ seed: 123 }), 800, 600)
    expect(a.walkers.map((w) => [w.x, w.y, w.heading, w.phase]))
      .toEqual(b.walkers.map((w) => [w.x, w.y, w.heading, w.phase]))
  })

  it('same seed → identical walk path over 500 steps', () => {
    const p1 = walkPath(cfg({ seed: 77 }), 500)
    const p2 = walkPath(cfg({ seed: 77 }), 500)
    expect(p1).toEqual(p2)
  })

  it('different seed → different walk path', () => {
    const p1 = walkPath(cfg({ seed: 1 }), 200)
    const p2 = walkPath(cfg({ seed: 2 }), 200)
    expect(p1).not.toEqual(p2)
  })
})

describe('headline: walkers explore, stay bounded, stay smooth, no NaN', () => {
  it('explores a meaningful bounding box + many distinct cells', () => {
    const c = cfg({ seed: 42, walkers: 3 })
    const s = createWanderState(c, 800, 600)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    const cells = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      runSteps(s, 100, () => {}) // dt so a few steps fire per call
      for (const wk of s.walkers) {
        minX = Math.min(minX, wk.x); maxX = Math.max(maxX, wk.x)
        minY = Math.min(minY, wk.y); maxY = Math.max(maxY, wk.y)
        cells.add(`${Math.floor(wk.x / 20)},${Math.floor(wk.y / 20)}`)
      }
    }
    // Not stuck: spans a big share of the field and visits many distinct cells.
    expect(maxX - minX).toBeGreaterThan(400)
    expect(maxY - minY).toBeGreaterThan(300)
    expect(cells.size).toBeGreaterThan(200)
  })

  it('heading change per step is bounded by turnLever (smooth, wrap edges)', () => {
    const c = cfg({ seed: 9, turnLever: 0.3, edges: 'wrap', walkers: 1 })
    const s = createWanderState(c, 800, 600)
    const wk = s.walkers[0]
    let worst = 0
    for (let i = 0; i < 5000; i++) {
      const before = wk.heading
      stepWalker(wk, s.cfg, s.w, s.h, s.lut) // wrap never changes heading
      worst = Math.max(worst, Math.abs(wk.heading - before))
    }
    expect(worst).toBeLessThanOrEqual(0.3 + 1e-9)
  })

  it('stays in bounds via wrap; no NaN', () => {
    const c = cfg({ seed: 5, edges: 'wrap', walkers: 4 })
    const s = createWanderState(c, 640, 480)
    for (let i = 0; i < 4000; i++) {
      for (const wk of s.walkers) stepWalker(wk, s.cfg, s.w, s.h, s.lut)
      for (const wk of s.walkers) {
        expect(Number.isFinite(wk.x)).toBe(true)
        expect(Number.isFinite(wk.y)).toBe(true)
        expect(wk.x).toBeGreaterThanOrEqual(0)
        expect(wk.x).toBeLessThan(640)
        expect(wk.y).toBeGreaterThanOrEqual(0)
        expect(wk.y).toBeLessThan(480)
      }
    }
  })

  it('stays in bounds via bounce; no NaN', () => {
    const c = cfg({ seed: 8, edges: 'bounce', walkers: 4, turnLever: 0.6 })
    const s = createWanderState(c, 640, 480)
    for (let i = 0; i < 4000; i++) {
      for (const wk of s.walkers) stepWalker(wk, s.cfg, s.w, s.h, s.lut)
      for (const wk of s.walkers) {
        expect(Number.isFinite(wk.x) && Number.isFinite(wk.y)).toBe(true)
        expect(wk.x).toBeGreaterThanOrEqual(0)
        expect(wk.x).toBeLessThanOrEqual(640)
        expect(wk.y).toBeGreaterThanOrEqual(0)
        expect(wk.y).toBeLessThanOrEqual(480)
      }
    }
  })
})

describe('lifecycle', () => {
  it('accumulate: fills to threshold then flips to fade, and reseed restarts', () => {
    const c = cfg({ seed: 3, trailStyle: 'accumulate', fillThreshold: 40, walkers: 6, speed: 200 })
    const s = createWanderState(c, 400, 300)
    let guard = 0
    while (s.life === 'draw' && guard++ < 20000) runSteps(s, 100, () => {})
    expect(s.life).toBe('fade')
    expect(coverageFraction(s)).toBeGreaterThanOrEqual(0.4)
    const gen = s.generation
    reseed(s)
    expect(s.life).toBe('draw')
    expect(s.generation).toBe(gen + 1)
    expect(s.covCount).toBe(0)
  })

  it('accumulate: a stuck billiard (turnLever=0, bounce) renews via the coverage-stall fallback', () => {
    const c = cfg({ seed: 3, trailStyle: 'accumulate', fillThreshold: 90, walkers: 1, turnLever: 0, edges: 'bounce', speed: 200 })
    const s = createWanderState(c, 400, 300)
    // Force a pure horizontal billiard: covers a single row of cells (~4%), so the
    // fillThreshold (90%) is never reached — without the stall fallback this loops
    // forever and the accumulation buffer never renews.
    s.walkers[0].heading = 0
    s.walkers[0].y = 150
    let guard = 0
    while (s.life === 'draw' && guard++ < 100_000) runSteps(s, 100, () => {})
    expect(s.life).toBe('fade')
    expect(coverageFraction(s)).toBeLessThan(0.9)
  })

  it('fade style never flips to the fade lifecycle (index.ts fades the buffer instead)', () => {
    const c = cfg({ seed: 3, trailStyle: 'fade', fillThreshold: 20, walkers: 6, speed: 200 })
    const s = createWanderState(c, 300, 200)
    const drawn: Segment[] = []
    for (let i = 0; i < 500; i++) runSteps(s, 100, (seg) => drawn.push(seg))
    expect(s.life).toBe('draw')
    expect(drawn.length).toBeGreaterThan(0)
  })
})
