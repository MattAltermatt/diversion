import { describe, it, expect, beforeAll } from 'vitest'
import { swirlingMagicSchema } from './schema'
import { createSwirlState, renderSwirl, resizeSwirl } from './swirl'

// renderSwirl uses Path2D + a 2D context, neither of which jsdom provides. Stub
// both with minimal no-op recorders so the render path is exercised in-test.
beforeAll(() => {
  ;(globalThis as unknown as { Path2D: unknown }).Path2D = class {
    moveTo() {}
    lineTo() {}
  }
})

function fakeCtx() {
  const rec = { strokes: 0 }
  const ctx = {
    globalCompositeOperation: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    get strokes() { return rec.strokes },
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {},
    fillRect() {}, stroke() { rec.strokes++ },
  }
  return ctx as unknown as CanvasRenderingContext2D & { strokes: number }
}

const cfg = swirlingMagicSchema.parse({})

describe('swirling-magic determinism', () => {
  it('same seed → identical initial ribbons', () => {
    const a = createSwirlState({ ...cfg, seed: 4 }, 800, 600)
    const b = createSwirlState({ ...cfg, seed: 4 }, 800, 600)
    expect(a.ribbons).toEqual(b.ribbons)
  })

  it('different seed → different ribbons', () => {
    const a = createSwirlState({ ...cfg, seed: 1 }, 800, 600)
    const b = createSwirlState({ ...cfg, seed: 2 }, 800, 600)
    expect(a.ribbons).not.toEqual(b.ribbons)
  })

  it('vortex evolves identically for the same seed over many frames', () => {
    const run = (seed: number) => {
      const st = createSwirlState({ ...cfg, seed, generator: 'Vortex' }, 800, 600)
      for (let i = 0; i < 40; i++) renderSwirl(st, fakeCtx(), 1 / 60)
      return st.ribbons.map((r) => [r.theta, r.r])
    }
    expect(run(9)).toEqual(run(9))
  })
})

describe('swirling-magic render', () => {
  it('advances time and strokes for the Vortex generator', () => {
    const st = createSwirlState({ ...cfg, generator: 'Vortex' }, 800, 600)
    const ctx = fakeCtx() as ReturnType<typeof fakeCtx>
    for (let i = 0; i < 30; i++) renderSwirl(st, ctx, 1 / 60)
    expect(st.t).toBeGreaterThan(0)
    expect(ctx.strokes).toBeGreaterThan(0)
  })

  it('renders the Web generator without throwing', () => {
    const st = createSwirlState({ ...cfg, generator: 'Web', webPoints: 120, weave: 5 }, 800, 600)
    const ctx = fakeCtx() as ReturnType<typeof fakeCtx>
    expect(() => renderSwirl(st, ctx, 1 / 60)).not.toThrow()
    expect(ctx.strokes).toBeGreaterThan(0)
  })

  it('resize recenters and flags a clear', () => {
    const st = createSwirlState(cfg, 800, 600)
    renderSwirl(st, fakeCtx(), 1 / 60) // consumes the initial clear
    resizeSwirl(st, 1000, 400)
    expect(st.cx).toBe(500)
    expect(st.cy).toBe(200)
    expect(st.needClear).toBe(true)
  })
})
