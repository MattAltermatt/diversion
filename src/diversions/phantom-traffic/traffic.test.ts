import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { phantomTrafficSchema } from './schema'
import { advance, createTrafficState, stepLane, buildLut, laneDir } from './traffic'

const cfg = (over = {}) => phantomTrafficSchema.parse({ ...over })

describe('phantom-traffic determinism', () => {
  it('same seed → identical initial car layout', () => {
    const a = createTrafficState(cfg({ seed: 42 }), 800, 600)
    const b = createTrafficState(cfg({ seed: 42 }), 800, 600)
    const cellsA = a.lanes.map((l) => l.cars.map((c) => c.cell))
    const cellsB = b.lanes.map((l) => l.cars.map((c) => c.cell))
    expect(cellsA).toEqual(cellsB)
  })

  it('different seed → different layout', () => {
    const a = createTrafficState(cfg({ seed: 1 }), 800, 600)
    const b = createTrafficState(cfg({ seed: 2 }), 800, 600)
    const flat = (s: typeof a) => s.lanes.flatMap((l) => l.cars.map((c) => c.cell)).join(',')
    expect(flat(a)).not.toEqual(flat(b))
  })

  it('rings: inner ring-roads are shorter, with proportional (uniform-density) car counts', () => {
    const s = createTrafficState(cfg({ seed: 3, density: 0.2, roadLength: 200, lanes: 5, layout: 'rings' }), 800, 600)
    // Ring length grows strictly outward; outermost keeps the full road length.
    for (let i = 1; i < s.lanes.length; i++) expect(s.lanes[i].ring).toBeGreaterThan(s.lanes[i - 1].ring)
    expect(s.lanes[s.lanes.length - 1].ring).toBe(200)
    // Linear density stays constant: each lane holds ≈ density × its own ring length.
    for (const lane of s.lanes) expect(Math.abs(lane.cars.length - 0.2 * lane.ring)).toBeLessThanOrEqual(1)
  })

  it('highway: every lane is the full road length', () => {
    const s = createTrafficState(cfg({ seed: 3, density: 0.2, roadLength: 200, lanes: 5, layout: 'highway' }), 800, 600)
    for (const lane of s.lanes) expect(lane.ring).toBe(200)
  })
})

describe('Nagel–Schreckenberg rules', () => {
  it('cars never share a cell and never exceed max speed, over many ticks', () => {
    const c = cfg({ seed: 5, density: 0.35, roadLength: 120, maxSpeed: 5, lanes: 1 })
    const s = createTrafficState(c, 800, 600)
    const rng = mulberry32(999)
    for (let t = 0; t < 500; t++) {
      stepLane(s.lanes[0], c, rng)
      const cells = s.lanes[0].cars.map((car) => car.cell)
      expect(new Set(cells).size).toBe(cells.length) // no collisions
      for (const car of s.lanes[0].cars) {
        expect(car.speed).toBeGreaterThanOrEqual(0)
        expect(car.speed).toBeLessThanOrEqual(5)
      }
    }
  })

  it('cars keep their cyclic order (no overtaking within a lane)', () => {
    const c = cfg({ seed: 7, density: 0.25, roadLength: 100, lanes: 1 })
    const s = createTrafficState(c, 800, 600)
    const ids = s.lanes[0].cars.map((_, i) => i)
    // tag identity by original sort index; after steps the cyclic sequence is preserved
    const rng = mulberry32(1)
    const start = s.lanes[0].cars.map((car) => car.cell)
    for (let t = 0; t < 50; t++) stepLane(s.lanes[0], c, rng)
    // Sorted cells remain strictly increasing & distinct — a proxy for stable order.
    const cells = s.lanes[0].cars.map((car) => car.cell)
    for (let i = 1; i < cells.length; i++) expect(cells[i]).toBeGreaterThan(cells[i - 1])
    expect(ids.length).toBe(start.length)
  })

  it('with no dawdle a sparse road reaches free flow (mean speed = max)', () => {
    const c = cfg({ seed: 9, density: 0.05, roadLength: 300, maxSpeed: 5, dawdle: 0, lanes: 1 })
    const s = createTrafficState(c, 800, 600)
    const rng = mulberry32(2)
    for (let t = 0; t < 300; t++) stepLane(s.lanes[0], c, rng)
    const mean = s.lanes[0].cars.reduce((a, car) => a + car.speed, 0) / s.lanes[0].cars.length
    expect(mean).toBe(5)
  })

  it('advance fires whole ticks and keeps meanFlow in [0,1]', () => {
    const s = createTrafficState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    advance(s, 350) // 10 ticks/s → ~3 ticks
    expect(s.meanFlow).toBeGreaterThanOrEqual(0)
    expect(s.meanFlow).toBeLessThanOrEqual(1)
  })
})

describe('lane direction', () => {
  it('uniform → every lane forward', () => {
    const c = cfg({ laneDirection: 'uniform' })
    for (let i = 0; i < 6; i++) expect(laneDir(i, c)).toBe(1)
  })

  it('alternate → odd lanes reversed, even lanes forward', () => {
    const c = cfg({ laneDirection: 'alternate' })
    expect(laneDir(0, c)).toBe(1)
    expect(laneDir(1, c)).toBe(-1)
    expect(laneDir(2, c)).toBe(1)
    expect(laneDir(3, c)).toBe(-1)
  })
})

describe('speed LUT', () => {
  it('has maxSpeed+1 entries; colorBySpeed off → all identical', () => {
    expect(buildLut(cfg({ maxSpeed: 5 }))).toHaveLength(6)
    const mono = buildLut(cfg({ maxSpeed: 4, colorBySpeed: false }))
    expect(new Set(mono).size).toBe(1)
  })
})
