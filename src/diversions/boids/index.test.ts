import { describe, it, expect } from 'vitest'
import boids from './index'
import { boidsSchema } from './schema'

function ctxStub() {
  return new Proxy({}, {
    get: (_t, p: string) => (p === 'canvas' ? { width: 800, height: 450 } : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
}

describe('boids diversion', () => {
  it('has the required contract fields and kind 2d', () => {
    expect(boids.id).toBe('boids')
    expect(boids.kind).toBe('2d')
    expect(boids.schema).toBe(boidsSchema)
    expect(boids.title.length).toBeGreaterThan(0)
    expect(boids.description.length).toBeGreaterThan(0)
  })

  it('setup + many frames run without throwing, at every edge mode', () => {
    for (const edgeMode of ['wrap', 'steer'] as const) {
      const cfg = boidsSchema.parse({ count: 80, edgeMode })
      const size = { width: 800, height: 450 }
      const state = boids.setup(ctxStub(), cfg, size)
      expect(() => { for (let i = 0; i < 30; i++) boids.frame(state, ctxStub(), i / 60, 1000 / 60) }).not.toThrow()
    }
  })

  it('setup + frame does not call requestAnimationFrame itself', () => {
    const raf = globalThis.requestAnimationFrame
    let called = false
    // @ts-expect-error stubbing for the assertion
    globalThis.requestAnimationFrame = () => { called = true }
    const cfg = boidsSchema.parse({ count: 60 })
    const state = boids.setup(ctxStub(), cfg, { width: 800, height: 450 })
    boids.frame(state, ctxStub(), 0, 16)
    expect(called).toBe(false)
    globalThis.requestAnimationFrame = raf
  })

  it('update returns false for structural changes (count, seed), true otherwise', () => {
    const cfg = boidsSchema.parse({})
    const state = boids.setup(ctxStub(), cfg, { width: 800, height: 450 })
    expect(boids.update?.(state, { ...cfg, count: 300 }, { width: 800, height: 450 })).toBeFalsy()
    expect(boids.update?.(state, { ...cfg, seed: cfg.seed + 1 }, { width: 800, height: 450 })).toBeFalsy()
  })

  it('update applies live for weights/perception/maxSpeed/edgeMode/predator/color/trail', () => {
    const cfg = boidsSchema.parse({})
    const state = boids.setup(ctxStub(), cfg, { width: 800, height: 450 })
    const next = {
      ...cfg,
      separation: 1.8, alignment: 0.4, cohesion: 0.3, perception: 90, maxSpeed: 150,
      edgeMode: 'wrap' as const, predator: true, boidSize: 10, fadeTrails: false,
      background: '#000000',
    }
    expect(boids.update?.(state, next, { width: 800, height: 450 })).toBeTruthy()
    expect(() => { for (let i = 0; i < 30; i++) boids.frame(state, ctxStub(), i / 60, 16) }).not.toThrow()
  })
})
