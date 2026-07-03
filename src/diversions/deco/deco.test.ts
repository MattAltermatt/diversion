import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { buildTree, maxReveal, type DecoNode } from './deco'
import type { DecoConfig } from './schema'

const cfg = (over: Partial<DecoConfig> = {}): DecoConfig => ({
  depth: 6, split: 'Golden', seed: 1, speed: 1.2, hold: 5, borderWidth: 5,
  palette: ['#f4f0e6', '#e02128', '#0b5ac0', '#f7c700', '#1a1a1e'],
  border: '#0c0c10',
  ...over,
})

const leaves = (n: DecoNode): number => (n.a === null ? 1 : leaves(n.a) + leaves(n.b!))
const rectsCover = (n: DecoNode): number => (n.a === null ? n.w * n.h : rectsCover(n.a) + rectsCover(n.b!))

describe('buildTree', () => {
  it('is deterministic per seed and varies across seeds', () => {
    const a = buildTree(0, 0, 800, 600, 0, cfg(), mulberry32(1))
    const b = buildTree(0, 0, 800, 600, 0, cfg(), mulberry32(1))
    expect(leaves(a)).toBe(leaves(b))
    const c = buildTree(0, 0, 800, 600, 0, cfg(), mulberry32(2))
    // different seed almost always yields a different subdivision
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c))
  })
  it('subdivides into more than one leaf and children exactly tile their parent', () => {
    const root = buildTree(0, 0, 800, 600, 0, cfg({ depth: 6 }), mulberry32(3))
    expect(leaves(root)).toBeGreaterThan(1)
    // leaf areas sum to the whole (no gaps/overlap in the tree partition)
    expect(rectsCover(root)).toBe(800 * 600)
  })
  it('respects the depth cap (shallower depth → fewer leaves)', () => {
    const shallow = leaves(buildTree(0, 0, 800, 600, 0, cfg({ depth: 3 }), mulberry32(4)))
    const deep = leaves(buildTree(0, 0, 800, 600, 0, cfg({ depth: 8 }), mulberry32(4)))
    expect(deep).toBeGreaterThan(shallow)
  })
})

describe('maxReveal', () => {
  it('is 0 for a single leaf and positive for a subdivided tree', () => {
    const leaf: DecoNode = { x: 0, y: 0, w: 10, h: 10, color: '#fff', revealAt: 1, a: null, b: null }
    expect(maxReveal(leaf)).toBe(0)
    const root = buildTree(0, 0, 800, 600, 0, cfg(), mulberry32(5))
    expect(maxReveal(root)).toBeGreaterThan(0)
  })
})
