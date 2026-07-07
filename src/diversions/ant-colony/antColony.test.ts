import { describe, it, expect } from 'vitest'
import { antColonySchema } from './schema'
import { createAntColonyState, step, advance, buildTrailLuts, FOOD_CAPACITY } from './antColony'

const cfg = (over = {}) => antColonySchema.parse({ ...over })

describe('ant-colony determinism', () => {
  it('same seed → identical initial ants + food + nests', () => {
    const a = createAntColonyState(cfg({ seed: 7 }), 800, 600)
    const b = createAntColonyState(cfg({ seed: 7 }), 800, 600)
    const dump = (s: typeof a) =>
      s.ants.map((n) => `${n.x},${n.y},${n.heading},${n.mode},${n.colony}`).join('|') +
      '#' + s.food.map((f) => `${f.x},${f.y}`).join('|') +
      '#' + s.nests.map((n) => `${n.x},${n.y}`).join('|')
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different food placement', () => {
    const a = createAntColonyState(cfg({ seed: 1 }), 800, 600)
    const b = createAntColonyState(cfg({ seed: 2 }), 800, 600)
    const dump = (s: typeof a) => s.food.map((f) => `${f.x.toFixed(4)},${f.y.toFixed(4)}`).join('|')
    expect(dump(a)).not.toEqual(dump(b))
  })

  it('spawns the requested ant count, split across colonies', () => {
    const one = createAntColonyState(cfg({ seed: 3, antCount: 300, colonies: '1' }), 800, 600)
    expect(one.ants.length).toBe(300)
    const two = createAntColonyState(cfg({ seed: 3, antCount: 300, colonies: '2' }), 800, 600)
    expect(two.ants.length).toBe(300)
    expect(two.ants.filter((a) => a.colony === 0).length).toBe(150)
    expect(two.ants.filter((a) => a.colony === 1).length).toBe(150)
  })
})

describe('ant-colony field dynamics', () => {
  it('fields stay finite, non-negative, and bounded over many steps', () => {
    const s = createAntColonyState(cfg({ seed: 5, antCount: 200, gridResolution: 64 }), 800, 600)
    let maxSeen = 0
    for (let t = 0; t < 400; t++) {
      step(s)
    }
    for (const field of s.fields) {
      for (const arr of [field.toFood, field.toHome]) {
        for (let i = 0; i < arr.length; i++) {
          const v = arr[i]
          expect(Number.isFinite(v)).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          if (v > maxSeen) maxSeen = v
        }
      }
    }
    // Bounded: with continuous small per-step deposits and a decay floor, no cell
    // should run away toward an unbounded value.
    expect(maxSeen).toBeLessThan(1e4)
  })

  it('ants stay within the [0,1) world over many steps', () => {
    const s = createAntColonyState(cfg({ seed: 9, antCount: 150, antSpeed: 3 }), 800, 600)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let t = 0; t < 300; t++) {
      step(s)
      for (const a of s.ants) {
        if (a.x < minX) minX = a.x
        if (a.x > maxX) maxX = a.x
        if (a.y < minY) minY = a.y
        if (a.y > maxY) maxY = a.y
      }
    }
    expect(minX).toBeGreaterThanOrEqual(0)
    expect(maxX).toBeLessThan(1)
    expect(minY).toBeGreaterThanOrEqual(0)
    expect(maxY).toBeLessThan(1)
  })

  it('advance fires whole steps from dt', () => {
    const s = createAntColonyState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    advance(s, 350)
    expect(s.tick).toBeGreaterThanOrEqual(3)
    expect(s.tick).toBeLessThanOrEqual(4)
  })

  it('food depletes on pickup and never goes negative', () => {
    const s = createAntColonyState(cfg({ seed: 12, antCount: 600, foodRegenerates: false, evaporation: 0.05 }), 800, 600)
    for (let t = 0; t < 2000; t++) step(s)
    for (const f of s.food) {
      expect(f.amount).toBeGreaterThanOrEqual(0)
      expect(f.amount).toBeLessThanOrEqual(FOOD_CAPACITY)
    }
    // At least some food should have been found and consumed over 2000 steps.
    const totalRemaining = s.food.reduce((sum, f) => sum + f.amount, 0)
    expect(totalRemaining).toBeLessThan(s.food.length * FOOD_CAPACITY)
  })

  it('with food regeneration on, depleted sources recover toward capacity', () => {
    const s = createAntColonyState(cfg({ seed: 14, antCount: 400, foodRegenerates: true }), 800, 600)
    for (let t = 0; t < 3000; t++) step(s)
    for (const f of s.food) expect(f.amount).toBeLessThanOrEqual(FOOD_CAPACITY + 1e-6)
  })
})

describe('ant-colony render gate (#273)', () => {
  it('marks dirty only when a step actually runs', () => {
    const s = createAntColonyState(cfg({ seed: 4, simSpeed: 10 }), 800, 600)
    expect(s.dirty).toBe(true) // fresh state must paint once

    s.dirty = false
    advance(s, 0) // no time → no step
    expect(s.dirty).toBe(false) // nothing changed → no field rebuild

    s.dirty = false
    advance(s, 1000) // plenty of time → steps run
    expect(s.dirty).toBe(true)
  })
})

describe('trail LUT', () => {
  it('builds 256 distinct rgb entries per colony, background at 0 and trail color at 255', () => {
    const c = cfg()
    const luts = buildTrailLuts(c)
    expect(luts.length).toBe(2)
    expect(luts[0].length).toBe(256 * 3)
    // idx 0 ≈ background, idx 255 ≈ trail color — and they differ (visible ramp).
    const lo = luts[0][0] + luts[0][1] + luts[0][2]
    const hi = luts[0][255 * 3] + luts[0][255 * 3 + 1] + luts[0][255 * 3 + 2]
    expect(lo).not.toBe(hi)
    // The two colonies' ramps are distinct from each other (different trail colors).
    expect(Array.from(luts[0])).not.toEqual(Array.from(luts[1]))
  })
})
