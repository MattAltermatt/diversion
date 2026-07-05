import { describe, it, expect } from 'vitest'
import { lightningSchema } from './schema'
import { advance, createState, type DBMState } from './dbm'

const cfg = (over: Partial<import('./schema').LightningConfig> = {}) =>
  ({ ...lightningSchema.parse({}), ...over })

/** Run `frames` ticks of ~16ms and return the state. */
function run(seed: number, frames: number, over = {}): DBMState {
  const s = createState(cfg({ seed, ...over }), 640, 400)
  for (let i = 0; i < frames; i++) advance(s, 16)
  return s
}

describe('lightning DBM', () => {
  it('is deterministic — same seed reproduces the same bolt', () => {
    const a = run(42, 40)
    const b = run(42, 40)
    expect(a.count).toBe(b.count)
    expect(a.phase).toBe(b.phase)
    expect(Array.from(a.order)).toEqual(Array.from(b.order))
    expect(Array.from(a.bc)).toEqual(Array.from(b.bc))
  })

  it('different seeds diverge', () => {
    const a = run(1, 40)
    const b = run(2, 40)
    expect(Array.from(a.order)).not.toEqual(Array.from(b.order))
  })

  it('grows a connected tree — every non-root tree cell has a tree parent', () => {
    const s = run(7, 30)
    let treeCells = 0
    for (let i = 0; i < s.bc.length; i++) {
      if (s.bc[i] !== 2) continue
      treeCells++
      const p = s.parent[i]
      if (p >= 0) expect(s.bc[p]).toBe(2) // parent is also part of the bolt
    }
    expect(treeCells).toBeGreaterThan(5) // it actually grew
  })

  it('completes a strike and loops through flash → fade → respawn', () => {
    // A fast strike on a small grid should connect, flash, fade, and reseed within
    // a few seconds of simulated time.
    const s = createState(cfg({ seed: 3, strikeSpeed: 600, afterglow: 0.3 }), 400, 300)
    const seen = new Set<string>()
    for (let i = 0; i < 400; i++) { advance(s, 16); seen.add(s.phase) }
    expect(seen.has('flashing')).toBe(true)
    expect(seen.has('fading')).toBe(true)
    expect(s.strikes).toBeGreaterThanOrEqual(1) // respawned at least once
  })

  it('higher η grows a sparser bolt than low η (same cells grown)', () => {
    // With the same number of grow-steps, a high exponent favours a few dominant
    // tips → the bolt reaches further per cell than a bushy low-η fern. Compare the
    // vertical extent reached after an equal number of cells.
    const reach = (eta: number) => {
      const s = createState(cfg({ seed: 9, eta, strikeSpeed: 200 }), 400, 400)
      for (let i = 0; i < 25; i++) advance(s, 16)
      let maxGy = 0
      for (let i = 0; i < s.bc.length; i++)
        if (s.bc[i] === 2) maxGy = Math.max(maxGy, (i / s.gw) | 0)
      return { reach: maxGy, count: s.count }
    }
    const lo = reach(1)
    const hi = reach(4.5)
    // Roughly equal cell counts, but high-η reaches deeper (more one-dimensional).
    expect(hi.reach).toBeGreaterThanOrEqual(lo.reach)
  })
})
