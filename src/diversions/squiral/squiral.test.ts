import { describe, it, expect } from 'vitest'
import { squiralSchema } from './schema'
import {
  createSquiralState, stepWorm, idx, sampleCyclic, getWormColor as colorOf,
  stepSquiral, updateSquiralState, resizeSquiralState, type SquiralState,
} from './squiral'

const cfg = squiralSchema.parse({})

function freshState(over: Partial<typeof cfg> = {}): SquiralState {
  return createSquiralState({ ...cfg, ...over }, 200, 120)
}

describe('squiral grid', () => {
  it('idx wraps toroidally', () => {
    const st = freshState({ cellSize: 4 }) // 50 x 30 grid
    expect(idx(st, -1, 0)).toBe(idx(st, st.cols - 1, 0))
    expect(idx(st, 0, -1)).toBe(idx(st, 0, st.rows - 1))
    expect(idx(st, st.cols, st.rows)).toBe(idx(st, 0, 0))
  })
})

describe('worm step rule', () => {
  it('only enters empty cells and fills two per move', () => {
    const st = freshState({ count: 1, disorder: 0, seed: 1 })
    const w = st.worms[0]
    const before = st.coverage
    stepWorm(st, w)
    expect(st.coverage - before === 2 || st.coverage - before === 0).toBe(true)
    for (const cell of st.dirty) expect(st.fill[idx(st, cell.col, cell.row)]).toBe(1)
  })

  it('respawns when boxed in (all neighbours filled)', () => {
    const st = freshState({ count: 1, disorder: 0, seed: 1 })
    const w = st.worms[0]
    st.fill.fill(1)
    st.coverage = st.fill.length
    w.col = 5; w.row = 5
    const oldCol = w.col, oldRow = w.row
    stepWorm(st, w)
    expect(w.col === oldCol && w.row === oldRow).toBe(false)
  })
})

describe('color', () => {
  it('sampleCyclic wraps from last stop back to first', () => {
    const stops = ['#ff0000ff', '#00ff00ff']
    const at0 = sampleCyclic(stops, 0)
    const at1 = sampleCyclic(stops, 1) // wraps back to first
    expect(at1.r).toBeCloseTo(at0.r); expect(at1.g).toBeCloseTo(at0.g)
  })

  it('palette mode picks a stable per-worm colour when not cycling', () => {
    const st = createSquiralState(squiralSchema.parse({ cycle: false, seed: 5 }), 200, 120)
    const w = st.worms[0]
    const c1 = colorOf(st, w), c2 = colorOf(st, w)
    expect(c1).toEqual(c2)
  })

  it('gradient mode (no cycle) varies colour by position', () => {
    const st = createSquiralState(
      squiralSchema.parse({ cycle: false, color: { mode: 'gradient', stops: ['#000000ff', '#ffffffff'] } }),
      200, 120,
    )
    const w = st.worms[0]
    w.row = 0; const top = colorOf(st, w)
    w.row = st.rows - 1; const bot = colorOf(st, w)
    expect(top).not.toEqual(bot)
  })
})

describe('wall turning (#zen)', () => {
  it('squeezes a single-cell turn into an open neighbour instead of respawning', () => {
    const st = createSquiralState(squiralSchema.parse({ count: 1, disorder: 0 }), 200, 200)
    const w = st.worms[0]
    w.col = 10; w.row = 10; w.dir = 0; w.type = 0 // heading up; order [left, up, right]
    // Block every 2-cell stride (fail clearAhead in all dirs)…
    st.fill[idx(st, 10, 8)] = 1  // up   2-ahead
    st.fill[idx(st, 8, 10)] = 1  // left 2-ahead
    st.fill[idx(st, 12, 10)] = 1 // right 2-ahead
    // …and block the left/right single-cell openings, leaving only 'up' one cell open.
    st.fill[idx(st, 9, 10)] = 1  // left 1-ahead
    st.fill[idx(st, 11, 10)] = 1 // right 1-ahead
    stepWorm(st, w)
    // It steps one cell up into the gap rather than dying/respawning elsewhere.
    expect([w.col, w.row]).toEqual([10, 9])
    expect(st.fill[idx(st, 10, 9)]).toBe(1)
  })

  it('only respawns when walled in on every open-able side', () => {
    const st = createSquiralState(squiralSchema.parse({ count: 1, disorder: 0 }), 200, 200)
    const w = st.worms[0]
    w.col = 10; w.row = 10; w.dir = 0; w.type = 0
    // Block both 1-ahead AND 2-ahead for left, up, right → no stride, no squeeze.
    for (const [c, r] of [[10, 9], [10, 8], [9, 10], [8, 10], [11, 10], [12, 10]]) st.fill[idx(st, c, r)] = 1
    stepWorm(st, w)
    // Respawned somewhere fresh (not stuck at the walled-in 10,10).
    expect([w.col, w.row]).not.toEqual([10, 10])
  })
})

describe('edge mode', () => {
  // worm at the left edge (col 0) heading left, with both perpendicular strides
  // blocked so only the straight-into-the-edge move is left.
  const setup = (edges: 'wrap' | 'walls') => {
    const st = createSquiralState(squiralSchema.parse({ count: 1, disorder: 0, edges }), 200, 200)
    const w = st.worms[0]
    w.col = 0; w.row = 10; w.dir = 3; w.type = 0
    for (const r of [11, 12, 9, 8]) st.fill[idx(st, 0, r)] = 1 // block up/down strides
    return { st, w }
  }

  it('wrap mode carries a worm across the edge to the opposite side', () => {
    const { st, w } = setup('wrap')
    stepWorm(st, w)
    expect(st.fill[idx(st, st.cols - 1, 10)]).toBe(1) // filled the wrapped (right-edge) cell
  })

  it('walls mode treats the edge as a wall — no wrap across the boundary', () => {
    const { st, w } = setup('walls')
    stepWorm(st, w)
    expect(st.fill[idx(st, st.cols - 1, 10)]).toBe(0) // never crossed the edge
  })

  it('walls mode keeps every worm in-bounds over a long run', () => {
    const st = createSquiralState(squiralSchema.parse({ count: 8, disorder: 0.01, edges: 'walls' }), 160, 120)
    for (let i = 0; i < 3000; i++) stepSquiral(st, 16)
    for (const w of st.worms) {
      expect(w.col).toBeGreaterThanOrEqual(0); expect(w.col).toBeLessThan(st.cols)
      expect(w.row).toBeGreaterThanOrEqual(0); expect(w.row).toBeLessThan(st.rows)
    }
  })
})

describe('lifecycle', () => {
  it('fade mode enters fading at the fill threshold and regrows', () => {
    const st = createSquiralState(squiralSchema.parse({ clearMode: 'fade', fillThreshold: 20, count: 30, speed: 120 }), 160, 120)
    let guard = 0
    while (st.phase === 'spiraling' && guard++ < 5000) stepSquiral(st, 16)
    expect(st.phase).toBe('fading')
    for (let i = 0; i < 600 && st.phase === 'fading'; i++) stepSquiral(st, 16)
    expect(st.phase).toBe('spiraling')
    expect(st.coverage).toBeLessThan(st.fill.length)
  })

  it('rolling mode holds coverage near the threshold without a hard phase change', () => {
    const st = createSquiralState(squiralSchema.parse({ clearMode: 'rolling', fillThreshold: 50, count: 40, speed: 120 }), 160, 120)
    const cap = Math.floor(0.5 * st.fill.length)
    for (let i = 0; i < 4000; i++) stepSquiral(st, 16)
    expect(st.phase).toBe('spiraling')
    expect(st.coverage).toBeLessThanOrEqual(cap + 4)
  })

  it('update returns false for structural changes, true for live ones', () => {
    const st = createSquiralState(squiralSchema.parse({}), 160, 120)
    expect(updateSquiralState(st, squiralSchema.parse({ count: 60 }), { width: 160, height: 120 })).toBe(false)
    expect(updateSquiralState(st, squiralSchema.parse({ disorder: 0.02 }), { width: 160, height: 120 })).toBe(true)
    expect(st.cfg.disorder).toBe(0.02)
  })

  it('resize rebuilds the grid and flags a background repaint', () => {
    const st = createSquiralState(squiralSchema.parse({ cellSize: 4 }), 160, 120)
    resizeSquiralState(st, { width: 80, height: 80 })
    expect(st.cols).toBe(20); expect(st.rows).toBe(20)
    expect(st.needsClear).toBe(true)
  })
})

describe('determinism', () => {
  it('same seed → identical first 50 filled cells', () => {
    const run = () => {
      const st = freshState({ count: 3, seed: 42 })
      const cells: number[] = []
      for (let i = 0; i < 200 && cells.length < 50; i++) {
        for (const w of st.worms) { stepWorm(st, w) }
        for (const c of st.dirty) cells.push(idx(st, c.col, c.row))
        st.dirty.length = 0
      }
      return cells.slice(0, 50)
    }
    expect(run()).toEqual(run())
  })
})
