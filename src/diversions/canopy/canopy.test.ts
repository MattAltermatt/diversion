import { describe, it, expect } from 'vitest'
import { canopySchema } from './schema'
import { createCanopyState, expandTree, lightPass, step, type Plant } from './canopy'

const cfg = (over = {}) => canopySchema.parse({ ...over })

const bareLeafPlant = (x: number, leafY: number[]): Plant => ({
  x, genes: { height: 0.5, angle: 0.5, depth: 4 }, wiggle: 1, growth: 1, energy: 10, age: 0,
  segments: [], leaves: leafY.map((y) => ({ x, y, col: 0, light: 0 })), topY: Math.min(...leafY),
  builtGrowth: 1, absorbed: 0,
})

describe('canopy determinism', () => {
  it('same seed → identical initial forest', () => {
    const a = createCanopyState(cfg({ seed: 9 }), 800, 600)
    const b = createCanopyState(cfg({ seed: 9 }), 800, 600)
    const dump = (s: typeof a) => s.plants.map((p) => `${p.x.toFixed(2)},${p.genes.height.toFixed(3)},${p.genes.depth}`).join('|')
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different forest', () => {
    const a = createCanopyState(cfg({ seed: 1 }), 800, 600)
    const b = createCanopyState(cfg({ seed: 2 }), 800, 600)
    const dump = (s: typeof a) => s.plants.map((p) => p.x.toFixed(2)).join('|')
    expect(dump(a)).not.toEqual(dump(b))
  })
})

describe('tree expansion', () => {
  it('a taller height gene reaches a higher top (smaller y)', () => {
    const short: Plant = { x: 400, genes: { height: 0.15, angle: 0.5, depth: 4 }, wiggle: 7, growth: 1, energy: 5, age: 0, segments: [], leaves: [], topY: 0, builtGrowth: -1, absorbed: 0 }
    const tall: Plant = { ...short, genes: { height: 0.95, angle: 0.5, depth: 4 } }
    expandTree(short, 600)
    expandTree(tall, 600)
    expect(tall.topY).toBeLessThan(short.topY) // higher canopy = smaller y
    expect(short.leaves.length).toBeGreaterThan(0)
    expect(tall.leaves.length).toBeGreaterThan(0)
  })

  it('grows with maturity: more of the tree at growth=1 than growth=0.2', () => {
    const p: Plant = { x: 400, genes: { height: 0.6, angle: 0.5, depth: 4 }, wiggle: 3, growth: 0.2, energy: 5, age: 0, segments: [], leaves: [], topY: 0, builtGrowth: -1, absorbed: 0 }
    expandTree(p, 600)
    const youngTop = p.topY
    p.growth = 1
    expandTree(p, 600)
    expect(p.topY).toBeLessThan(youngTop) // taller when mature
  })
})

describe('light economy (per-column shadow)', () => {
  it('a leaf higher in a column gets more light than one below it', () => {
    const s = createCanopyState(cfg({ seed: 4 }), 120, 600)
    s.plants = [bareLeafPlant(60, [100, 300, 500])] // three leaves in one column, top→bottom
    lightPass(s)
    const [top, mid, bot] = s.plants[0].leaves
    expect(top.light).toBeGreaterThan(mid.light)
    expect(mid.light).toBeGreaterThan(bot.light)
  })

  it('a tall plant shades a short one sharing its column', () => {
    const s = createCanopyState(cfg({ seed: 4 }), 120, 600)
    const tall = bareLeafPlant(60, [80, 160]) // leaves up high
    const short = bareLeafPlant(60, [520]) // one leaf near the ground, same column
    s.plants = [tall, short]
    lightPass(s)
    expect(short.leaves[0].light).toBeLessThan(tall.leaves[0].light)
    expect(tall.absorbed).toBeGreaterThan(short.absorbed)
  })

  it('an unshaded leaf receives the full sunlight level', () => {
    const s = createCanopyState(cfg({ seed: 4, sunlight: 0.8 }), 120, 600)
    s.plants = [bareLeafPlant(60, [200])]
    lightPass(s)
    expect(s.plants[0].leaves[0].light).toBeCloseTo(0.8, 5)
  })
})

describe('simulation', () => {
  it('runs stably, keeps population within the cap, never NaNs', () => {
    const s = createCanopyState(cfg({ seed: 6, maxPlants: 60 }), 800, 600)
    for (let t = 0; t < 600; t++) step(s, 33)
    expect(s.plants.length).toBeGreaterThan(0)
    expect(s.plants.length).toBeLessThanOrEqual(60 + 5) // soft cap, small overshoot ok
    for (const p of s.plants) {
      expect(Number.isFinite(p.energy)).toBe(true)
      expect(Number.isFinite(p.growth)).toBe(true)
    }
    expect(s.meanHeight).toBeGreaterThanOrEqual(0)
    expect(s.meanHeight).toBeLessThanOrEqual(1)
  })

  it('the forest actually grows tall — some canopy reaches well up the frame', () => {
    const s = createCanopyState(cfg({ seed: 3, heightCost: 0.6, maxPlants: 100 }), 800, 600)
    for (let t = 0; t < 1500; t++) step(s, 33)
    const tallest = Math.max(...s.plants.map((p) => (600 - p.topY) / 600))
    expect(tallest).toBeGreaterThan(0.35) // canopy reaches past a third of the screen
    expect(s.plants.length).toBeGreaterThan(0)
  })
})
