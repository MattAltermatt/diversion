import { describe, it, expect } from 'vitest'
import { forestSchema, type ForestConfig } from './schema'
import {
  createForestState,
  advanceForest,
  fadeAlpha,
  shouldReseed,
  needsRebuild,
  localFront,
} from './forest'
import { buildTree, mulberry32 } from './tree'

const defaults = (): ForestConfig => forestSchema.parse({})

describe('schema', () => {
  it('parses with valid defaults', () => {
    const cfg = defaults()
    expect(cfg.treeCount).toBe(16)
    expect(cfg.depth).toBe(7)
    expect(cfg.season).toBe('Autumn')
    expect(cfg.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    // every field is present + parseable (round-trips through the codec later)
    expect(() => forestSchema.parse(cfg)).not.toThrow()
  })
})

describe('determinism', () => {
  it('same seed → identical forest geometry', () => {
    const cfg = defaults()
    const a = createForestState(cfg, 800, 600)
    const b = createForestState(cfg, 800, 600)
    expect(a.trees.length).toBe(cfg.treeCount)
    expect(b.trees.length).toBe(cfg.treeCount)
    for (let i = 0; i < a.trees.length; i++) {
      expect(a.trees[i].z).toBe(b.trees[i].z)
      expect(a.trees[i].baseXfrac).toBe(b.trees[i].baseXfrac)
      const ba = a.trees[i].geo.branches
      const bb = b.trees[i].geo.branches
      expect(ba.length).toBe(bb.length)
      expect(ba.length).toBeGreaterThan(0)
      // spot-check a middle branch's coordinates match exactly
      const m = Math.floor(ba.length / 2)
      expect(ba[m].x1).toBe(bb[m].x1)
      expect(ba[m].y1).toBe(bb[m].y1)
    }
  })

  it('different seed → different forest', () => {
    const a = createForestState(defaults(), 800, 600)
    const b = createForestState({ ...defaults(), seed: 999 }, 800, 600)
    const za = a.trees.map((t) => t.z).join(',')
    const zb = b.trees.map((t) => t.z).join(',')
    expect(za).not.toBe(zb)
  })
})

describe('headline: a forest of branching trees with depth', () => {
  const cfg = defaults()
  const state = createForestState(cfg, 1000, 700)

  it('every tree actually branches (multiple depth levels + multiple tips)', () => {
    for (const tree of state.trees) {
      const maxDepth = tree.geo.branches.reduce((m, b) => Math.max(m, b.depth), 0)
      expect(maxDepth).toBeGreaterThan(1)
      expect(tree.geo.tips.length).toBeGreaterThan(1)
      expect(tree.geo.byDepth.length).toBe(cfg.depth)
    }
  })

  it('trees span a range of depths (near ↔ far) for parallax', () => {
    const zs = state.trees.map((t) => t.z)
    const range = Math.max(...zs) - Math.min(...zs)
    expect(range).toBeGreaterThan(0.4)
    // sorted far → near (painter order)
    for (let i = 1; i < zs.length; i++) expect(zs[i]).toBeGreaterThanOrEqual(zs[i - 1])
  })

  it('each tree has a non-degenerate bbox and no NaN coordinates', () => {
    for (const tree of state.trees) {
      expect(tree.geo.height).toBeGreaterThan(0)
      expect(Number.isFinite(tree.geo.cx)).toBe(true)
      for (const b of tree.geo.branches) {
        expect(Number.isFinite(b.x0)).toBe(true)
        expect(Number.isFinite(b.y0)).toBe(true)
        expect(Number.isFinite(b.x1)).toBe(true)
        expect(Number.isFinite(b.y1)).toBe(true)
        expect(b.growEnd).toBeGreaterThan(b.growStart)
      }
    }
  })

  it('split=3 grows a fuller crown than split=2', () => {
    const two = buildTree({ ...cfg, splitFactor: 2 }, mulberry32(1))
    const three = buildTree({ ...cfg, splitFactor: 3 }, mulberry32(1))
    expect(three.branches.length).toBeGreaterThan(two.branches.length)
  })
})

describe('reveal + lifecycle', () => {
  it('nearer trees lag (back-to-front sprout wave)', () => {
    const state = createForestState(defaults(), 800, 600)
    const far = state.trees[0] // z smallest
    const near = state.trees[state.trees.length - 1] // z largest
    expect(near.delay).toBeGreaterThanOrEqual(far.delay)
    // at a mid front, the far tree is further along than the near one
    expect(localFront(far, 0.3)).toBeGreaterThanOrEqual(localFront(near, 0.3))
  })

  it('cycles grow → settle → fade → reseed', () => {
    const state = createForestState(defaults(), 800, 600)
    expect(state.phase).toBe('growing')
    expect(shouldReseed(state)).toBe(false)

    for (let i = 0; i < 5000 && state.phase === 'growing'; i++) advanceForest(state, 16)
    expect(state.phase).toBe('settled')
    expect(fadeAlpha(state)).toBe(1)

    for (let i = 0; i < 2000 && state.phase !== 'fading'; i++) advanceForest(state, 16)
    expect(state.phase).toBe('fading')

    for (let i = 0; i < 2000 && !shouldReseed(state); i++) advanceForest(state, 16)
    expect(shouldReseed(state)).toBe(true)
    expect(fadeAlpha(state)).toBe(0)
  })
})

describe('needsRebuild', () => {
  it('geometry fields force a rebuild; render fields do not', () => {
    const a = defaults()
    expect(needsRebuild(a, a)).toBe(false)
    expect(needsRebuild(a, { ...a, seed: a.seed + 1 })).toBe(true)
    expect(needsRebuild(a, { ...a, treeCount: 12 })).toBe(true)
    expect(needsRebuild(a, { ...a, depth: 8 })).toBe(true)
    expect(needsRebuild(a, { ...a, splitFactor: 3 })).toBe(true)
    // render-only tweaks apply live
    expect(needsRebuild(a, { ...a, season: 'Winter' })).toBe(false)
    expect(needsRebuild(a, { ...a, taper: 0.8 })).toBe(false)
    expect(needsRebuild(a, { ...a, atmosphere: 0.2 })).toBe(false)
    expect(needsRebuild(a, { ...a, growthSpeed: 0.3 })).toBe(false)
  })
})
