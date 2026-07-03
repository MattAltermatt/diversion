import { describe, it, expect } from 'vitest'
import { differentialGrowthSchema, type DifferentialGrowthConfig } from './schema'
import {
  createGrowthState, stepGrowth, buildGrid, neighborsWithin, curvatureAt, type GrowthNode,
} from './growth'

const cfg = (over: Partial<DifferentialGrowthConfig> = {}): DifferentialGrowthConfig =>
  differentialGrowthSchema.parse({ ...over })

const positions = (nodes: GrowthNode[]) => nodes.map((p) => [p.x, p.y])

describe('differential growth — determinism (seed contract keystone)', () => {
  it('same seed → identical initial ring', () => {
    const a = createGrowthState(cfg({ seed: 42 }), 1600, 900)
    const b = createGrowthState(cfg({ seed: 42 }), 1600, 900)
    expect(positions(a.nodes)).toEqual(positions(b.nodes))
  })

  it('different seed → different initial ring', () => {
    const a = createGrowthState(cfg({ seed: 1 }), 1600, 900)
    const b = createGrowthState(cfg({ seed: 2 }), 1600, 900)
    expect(positions(a.nodes)).not.toEqual(positions(b.nodes))
  })

  it('same seed → identical curve after N sub-steps (count + positions)', () => {
    const a = createGrowthState(cfg({ seed: 7 }), 1600, 900)
    const b = createGrowthState(cfg({ seed: 7 }), 1600, 900)
    for (let i = 0; i < 120; i++) {
      stepGrowth(a)
      stepGrowth(b)
    }
    expect(a.nodes.length).toBe(b.nodes.length)
    expect(positions(a.nodes)).toEqual(positions(b.nodes))
  })

  it('the ring grows (nodes are inserted as edges stretch)', () => {
    const s = createGrowthState(cfg({ seed: 3 }), 1600, 900)
    const start = s.nodes.length
    for (let i = 0; i < 200; i++) stepGrowth(s)
    expect(s.nodes.length).toBeGreaterThan(start)
  })

  it('growth stops at the node cap', () => {
    const s = createGrowthState(cfg({ seed: 3, maxNodes: 300, speed: 120 }), 1600, 900)
    for (let i = 0; i < 4000; i++) stepGrowth(s)
    expect(s.nodes.length).toBeLessThanOrEqual(300)
  })
})

describe('spatial hash', () => {
  it('neighborsWithin returns exactly the brute-force set within R', () => {
    const s = createGrowthState(cfg({ seed: 9 }), 1600, 900)
    for (let i = 0; i < 60; i++) stepGrowth(s)
    const R = 22
    const grid = buildGrid(s.nodes, R)
    for (let i = 0; i < s.nodes.length; i++) {
      const viaHash = neighborsWithin(s.nodes, grid, R, i, R).sort((a, b) => a - b)
      const brute: number[] = []
      for (let k = 0; k < s.nodes.length; k++) {
        if (k === i) continue
        const dx = s.nodes[k].x - s.nodes[i].x
        const dy = s.nodes[k].y - s.nodes[i].y
        if (dx * dx + dy * dy < R * R) brute.push(k)
      }
      expect(viaHash).toEqual(brute)
    }
  })
})

describe('curvature helper', () => {
  const n = (x: number, y: number): GrowthNode => ({ x, y, born: 0, dx: 0, dy: 0 })

  it('is ~0 on a straight run', () => {
    const nodes = [n(0, 0), n(10, 0), n(20, 0)]
    expect(curvatureAt(nodes, 1)).toBeCloseTo(0, 6)
  })

  it('is positive at a corner', () => {
    const nodes = [n(0, 0), n(10, 0), n(10, 10)]
    expect(curvatureAt(nodes, 1)).toBeGreaterThan(0)
  })
})
