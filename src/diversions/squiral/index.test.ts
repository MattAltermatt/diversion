import { describe, it, expect } from 'vitest'
import squiral from './index'
import { createSquiralState } from './squiral'
import { squiralSchema } from './schema'

// Minimal 2D context recording fills — enough for drawCell (square → fillRect).
function mockCtx() {
  const fills: string[] = []
  let fs = ''
  return {
    get fillStyle() { return fs },
    set fillStyle(v: string) { fs = v },
    fillRect() { fills.push(fs) },
    beginPath() {}, arc() {}, fill() {},
    _fills: fills,
  } as unknown as CanvasRenderingContext2D & { _fills: string[] }
}

describe('squiral leading-edge bloom (#zen)', () => {
  it('newly-filled cells fade in via the appearing list rather than popping', () => {
    const cfg = squiralSchema.parse({ count: 5, speed: 120, clearMode: 'rolling' })
    const state = createSquiralState(cfg, 200, 200)
    const ctx = mockCtx()

    squiral.frame!(state, ctx, 0, 16) // one step fills cells → they enter the bloom list
    expect(state.appearing.length).toBeGreaterThan(0)
    expect(state.dirty.length).toBe(0) // dirty is drained into appearing each frame

    // freeze the worms so no new cells are added, then run past the bloom window
    state.cfg = { ...cfg, speed: 0 }
    for (let i = 0; i < 16; i++) squiral.frame!(state, ctx, 0, 16) // 256ms > BLOOM_MS(220)
    expect(state.appearing.length).toBe(0) // every bloom settled and dropped out
  })

  it('cancels a bloom when its cell is recycled (rolling) — no stranded specks', () => {
    // High churn: low fill cap + many fast worms → recycle period < bloom window,
    // so cells get recycled mid-bloom. Each blooming cell must still be filled.
    const cfg = squiralSchema.parse({ count: 30, speed: 120, clearMode: 'rolling', fillThreshold: 20, cellSize: 6 })
    const state = createSquiralState(cfg, 240, 160)
    const ctx = mockCtx()
    for (let i = 0; i < 400; i++) squiral.frame!(state, ctx, 0, 16)
    for (const a of state.appearing) {
      expect(state.fill[a.row * state.cols + a.col]).toBe(1) // never blooming over a bg slot
    }
  })

  it('a settled cell is eventually drawn at its full target colour', () => {
    const cfg = squiralSchema.parse({ count: 3, speed: 120, clearMode: 'rolling',
      color: { mode: 'palette', colors: ['#ffffffff'], source: 'y', stops: ['#000000ff', '#ffffffff'] } })
    const state = createSquiralState(cfg, 120, 120)
    const ctx = mockCtx()
    squiral.frame!(state, ctx, 0, 16)
    state.cfg = { ...state.cfg, speed: 0 }
    for (let i = 0; i < 20; i++) squiral.frame!(state, ctx, 0, 16)
    // the white target should appear at full strength once bloomed in
    expect(ctx._fills.some((f) => f === 'rgba(255,255,255,1)')).toBe(true)
  })
})
