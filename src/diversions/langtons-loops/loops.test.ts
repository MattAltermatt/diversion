import { describe, it, expect } from 'vitest'
import { createLoopsState, stepLoops, SEED_W, SEED_H } from './loops'
import { langtonsLoopsSchema } from './schema'

// Pin scale to a single small-celled seed so the mechanic has room to grow,
// independent of the (cosmetic) cellSize/seeds UI defaults.
const cfg = langtonsLoopsSchema.parse({ cellSize: 4, seeds: 1 })
// a canvas big enough for the 10x10 seed + room to grow
const mk = () => createLoopsState(cfg, 200, 200)

describe('Langton loops sim', () => {
  it('plants seed cells (the grid is not all empty after setup)', () => {
    const st = mk()
    let nonZero = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) nonZero++
    // the canonical 10x10 seed has well over 30 non-empty cells
    expect(nonZero).toBeGreaterThan(30)
    expect(SEED_W).toBe(10)
    expect(SEED_H).toBe(10)
  })

  it('is deterministic for a fixed seed', () => {
    const a = createLoopsState(cfg, 200, 200)
    const b = createLoopsState(cfg, 200, 200)
    for (let s = 0; s < 20; s++) { stepLoops(a); stepLoops(b) }
    expect(Array.from(a.cur)).toEqual(Array.from(b.cur))
  })

  it('actually evolves: the seed reproduces (grows past its initial live-cell count)', () => {
    const st = mk()
    let initialLive = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) initialLive++
    for (let s = 0; s < 120; s++) stepLoops(st)
    let laterLive = 0
    for (let i = 0; i < st.cur.length; i++) if (st.cur[i] !== 0) laterLive++
    expect(laterLive).toBeGreaterThan(initialLive) // the colony grew
  })

  it('records changed-cell indices each step for incremental repaint', () => {
    const st = mk()
    stepLoops(st)
    expect(st.changed.length).toBeGreaterThan(0)
  })

  it('reaches the HOLD phase once growth stalls in a tiny grid', () => {
    // a grid only a little bigger than the seed fills and goes quiescent fast
    const small = createLoopsState(cfg, 80, 80)
    let phase = small.phase
    for (let s = 0; s < 5000 && phase === 'running'; s++) { stepLoops(small); phase = small.phase }
    expect(small.phase).not.toBe('running') // transitioned out of running
  })
})
