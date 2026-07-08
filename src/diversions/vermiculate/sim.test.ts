import { describe, it, expect } from 'vitest'
import { advance, createState, GRID_CELL, applyConfig, shouldReseed } from './sim'
import { vermiculateSchema, type VermiculateConfig } from './schema'

const cfg = (over: Partial<VermiculateConfig> = {}): VermiculateConfig => vermiculateSchema.parse({ ...over })

describe('Vermiculate — determinism', () => {
  it('same seed produces identical initial turtles', () => {
    const a = createState(cfg({ seed: 42, worms: 8 }), 400, 300)
    const b = createState(cfg({ seed: 42, worms: 8 }), 400, 300)
    expect(a.turtles).toEqual(b.turtles)
    expect(a.colorOffset).toEqual(b.colorOffset)
  })

  it('different seeds produce different initial turtles', () => {
    const a = createState(cfg({ seed: 1, worms: 8 }), 400, 300)
    const b = createState(cfg({ seed: 2, worms: 8 }), 400, 300)
    expect(a.turtles).not.toEqual(b.turtles)
  })

  it('same seed produces an identical trail after several frames', () => {
    const a = createState(cfg({ seed: 7, worms: 5 }), 320, 240)
    const b = createState(cfg({ seed: 7, worms: 5 }), 320, 240)
    for (let i = 0; i < 40; i++) {
      advance(a, 16)
      advance(b, 16)
    }
    expect(a.turtles).toEqual(b.turtles)
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
  })
})

describe('Vermiculate — turtle-step unit (via advance)', () => {
  it('a single step lands a turtle at the expected point when wander is off', () => {
    // wander=0 -> turnVel never drifts, and it starts at 0 -> heading is fixed,
    // so the turtle should move exactly stepSize along its initial heading.
    const c = cfg({ seed: 3, worms: 1, wander: 0, stepSize: 5, speed: 240 })
    const s = createState(c, 1000, 1000) // large canvas so wrap never kicks in
    const heading = s.turtles[0].heading
    const x0 = s.turtles[0].x
    const y0 = s.turtles[0].y
    advance(s, 5) // speed 240/s -> at least one step in 5ms
    const t = s.turtles[0]
    expect(t.heading).toBeCloseTo(heading, 10) // turn never drifted
    expect(t.x).toBeCloseTo(x0 + 5 * Math.cos(heading), 6)
    expect(t.y).toBeCloseTo(y0 + 5 * Math.sin(heading), 6)
  })
})

describe('Vermiculate — occupancy + lifecycle', () => {
  it('marks grid cells visited and grows filledCells monotonically', () => {
    const s = createState(cfg({ seed: 5, worms: 6, speed: 240 }), 300, 220)
    expect(s.filledCells).toBe(0)
    let prev = 0
    for (let i = 0; i < 50; i++) {
      advance(s, 16)
      expect(s.filledCells).toBeGreaterThanOrEqual(prev)
      prev = s.filledCells
    }
    expect(s.filledCells).toBeGreaterThan(0)
    expect(s.totalCells).toBe(s.gw * s.gh)
  })

  it('eventually fills and holds, then asks the framework to reseed', () => {
    const s = createState(cfg({ seed: 9, worms: 10, speed: 240, stepSize: 4 }), 160, 120)
    let guard = 0
    while (!s.filled && guard < 20000) {
      advance(s, 100)
      guard++
    }
    expect(s.filled).toBe(true)
    expect(shouldReseed(s)).toBe(false) // just filled — hold not elapsed
    advance(s, 4000)
    expect(shouldReseed(s)).toBe(true)
  })

  it('a worm stuck in dense territory eventually relocates instead of freezing forever', () => {
    // Tiny canvas + high speed + many worms densifies fast; every turtle should
    // keep producing fresh segments (i.e. never gets permanently wedged) until fill.
    const s = createState(cfg({ seed: 11, worms: 4, speed: 240, stepSize: 2 }), 80, 60)
    for (let i = 0; i < 300 && !s.filled; i++) advance(s, 100)
    for (const t of s.turtles) expect(t.stuckStreak).toBeLessThanOrEqual(16)
  })
})

describe('Vermiculate — grid sizing', () => {
  it('grid dimensions track canvas size at GRID_CELL resolution', () => {
    const s = createState(cfg(), 240, 120)
    expect(s.gw).toBe(Math.ceil(240 / GRID_CELL))
    expect(s.gh).toBe(Math.ceil(120 / GRID_CELL))
  })
})

describe('Vermiculate — applyConfig', () => {
  it('rejects a seed change (structural) for a full re-setup', () => {
    const s = createState(cfg({ seed: 1 }), 300, 200)
    expect(applyConfig(s, cfg({ seed: 2 }))).toBe(false)
  })

  it('adds/removes turtles live when worms changes, without a rebuild', () => {
    const s = createState(cfg({ worms: 4 }), 300, 200)
    expect(applyConfig(s, cfg({ worms: 8 }))).toBe(true)
    expect(s.turtles.length).toBe(8)
    expect(s.colorOffset.length).toBe(8)
    expect(applyConfig(s, cfg({ worms: 3 }))).toBe(true)
    expect(s.turtles.length).toBe(3)
  })

  it('applies cosmetic edits (trailWidth, glow, palette) live', () => {
    const s = createState(cfg(), 300, 200)
    expect(applyConfig(s, cfg({ trailWidth: 5, glow: 0.9, colors: ['#000000', '#ffffff'] }))).toBe(true)
    expect(s.cfg.trailWidth).toBe(5)
  })
})
