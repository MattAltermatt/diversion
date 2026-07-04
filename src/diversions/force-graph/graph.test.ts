import { describe, it, expect } from 'vitest'
import { forceGraphSchema, type ForceGraphConfig } from './schema'
import {
  createLayout, stepLayout, springEnergy, settleThreshold, type LayoutState,
} from './graph'

const cfg = (over: Partial<ForceGraphConfig> = {}): ForceGraphConfig =>
  forceGraphSchema.parse({ seed: 42, nodeCount: 90, ...over })

const run = (state: LayoutState, n: number) => { for (let i = 0; i < n; i++) stepLayout(state) }

// mean edge length vs mean random-pair distance
function distances(state: LayoutState) {
  const { nodes, edges } = state
  let edgeSum = 0
  for (const [a, b] of edges) edgeSum += Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y)
  const meanEdge = edgeSum / edges.length
  let randSum = 0, cnt = 0
  for (let i = 0; i < nodes.length; i += 3) for (let j = i + 5; j < nodes.length; j += 7) {
    randSum += Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y); cnt++
  }
  return { meanEdge, meanRand: randSum / cnt }
}

describe('forceGraphSchema', () => {
  it('parses to defaults (130 clustered nodes)', () => {
    const c = forceGraphSchema.parse({})
    expect(c.nodeCount).toBe(130)
    expect(c.graphType).toBe('clusters')
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
    expect(c.background).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('every slider field carries numeric min/max meta', () => {
    const shape = forceGraphSchema.shape
    for (const key of ['nodeCount', 'edgeDensity', 'repulsion', 'springStiffness',
      'springLength', 'damping', 'nodeSize', 'edgeOpacity', 'speed'] as const) {
      const m = (shape[key] as any).meta()
      expect(m.ui).toBe('slider')
      expect(typeof m.min).toBe('number')
      expect(typeof m.max).toBe('number')
    }
  })

  it('seed randomizes on fresh load (seedless share links)', () => {
    expect((forceGraphSchema.shape.seed as any).meta().randomizeOnFreshLoad).toBe(true)
  })

  it('nodeCount must be an integer within its band', () => {
    expect(() => forceGraphSchema.parse({ nodeCount: 90.5 })).toThrow()
    expect(() => forceGraphSchema.parse({ nodeCount: 5 })).toThrow()
    expect(() => forceGraphSchema.parse({ nodeCount: 9000 })).toThrow()
    expect(forceGraphSchema.parse({ nodeCount: 200 }).nodeCount).toBe(200)
  })
})

describe('graph generation', () => {
  it('builds a connected-backbone graph with valid, non-self edges', () => {
    for (const graphType of ['tree', 'clusters', 'small-world'] as const) {
      const s = createLayout(cfg({ graphType }), 800, 600)
      expect(s.nodes.length).toBe(90)
      expect(s.edges.length).toBeGreaterThanOrEqual(89) // >= spanning backbone
      for (const [a, b] of s.edges) {
        expect(a).not.toBe(b)
        expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThan(90)
        expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(90)
      }
      expect(s.communityCount).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('determinism', () => {
  it('same seed → identical graph AND identical layout after N steps', () => {
    const a = createLayout(cfg(), 800, 600)
    const b = createLayout(cfg(), 800, 600)
    expect(a.edges).toEqual(b.edges)
    run(a, 300); run(b, 300)
    for (let i = 0; i < a.nodes.length; i++) {
      expect(a.nodes[i].x).toBe(b.nodes[i].x)
      expect(a.nodes[i].y).toBe(b.nodes[i].y)
    }
  })

  it('different seed → different graph or layout', () => {
    const a = createLayout(cfg({ seed: 1 }), 800, 600)
    const b = createLayout(cfg({ seed: 2 }), 800, 600)
    run(a, 200); run(b, 200)
    const diff = a.nodes.some((nd, i) => nd.x !== b.nodes[i].x || nd.y !== b.nodes[i].y)
    expect(diff).toBe(true)
  })
})

describe('HEADLINE: the layout relaxes', () => {
  it('spring energy DECREASES from the scrambled start', () => {
    for (const graphType of ['tree', 'clusters', 'small-world'] as const) {
      const s = createLayout(cfg({ graphType }), 900, 700)
      run(s, 20)
      const early = springEnergy(s)
      run(s, 500)
      const late = springEnergy(s)
      expect(late).toBeLessThan(early)
    }
  })

  it('connected nodes end up closer than random pairs', () => {
    const s = createLayout(cfg({ graphType: 'clusters' }), 900, 700)
    run(s, 600)
    const { meanEdge, meanRand } = distances(s)
    expect(meanEdge).toBeLessThan(meanRand)
  })

  it('settles: mean node speed falls below the settle threshold', () => {
    const s = createLayout(cfg(), 900, 700)
    run(s, 2500)
    expect(s.meanSpeed).toBeLessThan(settleThreshold(s.cfg))
  })

  it('never explodes: all positions stay finite (no NaN / Infinity)', () => {
    const s = createLayout(cfg({ nodeCount: 200, graphType: 'clusters' }), 900, 700)
    run(s, 800)
    for (const nd of s.nodes) {
      expect(Number.isFinite(nd.x)).toBe(true)
      expect(Number.isFinite(nd.y)).toBe(true)
      expect(Number.isFinite(nd.vx)).toBe(true)
      expect(Number.isFinite(nd.vy)).toBe(true)
    }
    expect(Number.isFinite(springEnergy(s))).toBe(true)
  })
})
