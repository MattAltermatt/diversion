import { describe, it, expect } from 'vitest'
import flockVsHunter from './index'
import { flockVsHunterSchema } from './schema'

function ctxStub() {
  return new Proxy({}, {
    get: (_t, p: string) => (p === 'canvas' ? { width: 800, height: 450 } : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
}

describe('flock-vs-hunter diversion', () => {
  it('has the required contract fields and kind 2d', () => {
    expect(flockVsHunter.id).toBe('flock-vs-hunter')
    expect(flockVsHunter.kind).toBe('2d')
    expect(flockVsHunter.schema).toBe(flockVsHunterSchema)
    expect(flockVsHunter.title.length).toBeGreaterThan(0)
    expect(flockVsHunter.description.length).toBeGreaterThan(0)
  })

  it('setup + a few frames run without throwing', () => {
    const cfg = flockVsHunterSchema.parse({ boidCount: 80, predatorCount: 2 })
    const size = { width: 800, height: 450 }
    const state = flockVsHunter.setup(ctxStub(), cfg, size)
    expect(() => { for (let i = 0; i < 5; i++) flockVsHunter.frame(state, ctxStub(), i / 60, 1 / 60) }).not.toThrow()
  })

  it('update returns false for structural changes (boidCount, seed)', () => {
    const cfg = flockVsHunterSchema.parse({})
    const state = flockVsHunter.setup(ctxStub(), cfg, { width: 800, height: 450 })
    expect(flockVsHunter.update?.(state, { ...cfg, boidCount: 300 }, { width: 800, height: 450 })).toBeFalsy()
    expect(flockVsHunter.update?.(state, { ...cfg, trailFade: 0.3 }, { width: 800, height: 450 })).toBeTruthy()
  })
})
