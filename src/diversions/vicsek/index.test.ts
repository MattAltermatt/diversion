import { describe, it, expect } from 'vitest'
import vicsek from './index'
import { vicsekSchema } from './schema'

function ctxStub() {
  return new Proxy({}, {
    get: (_t, p: string) => (p === 'canvas' ? { width: 800, height: 450 } : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
}

describe('vicsek diversion', () => {
  it('has the required contract fields and kind 2d', () => {
    expect(vicsek.id).toBe('vicsek')
    expect(vicsek.kind).toBe('2d')
    expect(vicsek.schema).toBe(vicsekSchema)
    expect(vicsek.title.length).toBeGreaterThan(0)
    expect(vicsek.description.length).toBeGreaterThan(0)
  })

  it('setup + a few frames run without throwing', () => {
    const cfg = vicsekSchema.parse({ particleCount: 200 })
    const size = { width: 800, height: 450 }
    const state = vicsek.setup(ctxStub(), cfg, size)
    expect(() => { for (let i = 0; i < 5; i++) vicsek.frame(state, ctxStub(), i / 60, 1 / 60) }).not.toThrow()
  })

  it('update returns false for structural changes (particleCount, neighborRadius, worldSize, seed)', () => {
    const cfg = vicsekSchema.parse({})
    const size = { width: 800, height: 450 }
    const state = vicsek.setup(ctxStub(), cfg, size)
    expect(vicsek.update?.(state, { ...cfg, particleCount: 500 }, size)).toBeFalsy()
    expect(vicsek.update?.(state, { ...cfg, neighborRadius: 30 }, size)).toBeFalsy()
    expect(vicsek.update?.(state, { ...cfg, worldSize: 1000 }, size)).toBeFalsy()
    expect(vicsek.update?.(state, { ...cfg, seed: 999 }, size)).toBeFalsy()
  })

  it('update applies live for noise/speed/palette/background/showOrderParameter', () => {
    const cfg = vicsekSchema.parse({})
    const size = { width: 800, height: 450 }
    const state = vicsek.setup(ctxStub(), cfg, size)
    expect(vicsek.update?.(state, { ...cfg, noise: 3 }, size)).toBeTruthy()
    expect(vicsek.update?.(state, { ...cfg, speed: 100 }, size)).toBeTruthy()
    expect(vicsek.update?.(state, { ...cfg, showOrderParameter: false }, size)).toBeTruthy()
    expect(vicsek.update?.(state, { ...cfg, background: '#000000' }, size)).toBeTruthy()
  })

  it('every declared preset patches the same key-set within its group', () => {
    for (const group of vicsek.presets ?? []) {
      const keySets = group.options.map(o => Object.keys(o.patch).sort().join(','))
      expect(new Set(keySets).size, `${group.label} preset options disagree on keys`).toBe(1)
    }
  })
})
