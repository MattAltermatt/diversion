import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import { makeArena } from './testArena'
import { stepColony } from './colony'
import { spawnDrone } from './recruit'
import { render } from './render'

function arena(glyph: 'Spider' | 'Ant' | 'Dot') {
  const s = makeArena({ glyph, strength: 24, chunkSize: 4 })
  spawnDrone(s, s.picOriginCol - 0.5, s.picOriginRow + 0.5)
  for (let i = 0; i < 60; i++) stepColony(s, 0.05)
  return s
}

describe('render', () => {
  it('draws with every glyph on the mock context and leaves globalAlpha at 1', () => {
    for (const glyph of ['Spider', 'Ant', 'Dot'] as const) {
      const ctx = make2DContext()
      expect(() => render(arena(glyph), ctx)).not.toThrow()
      expect(ctx.calls).toContain('fillRect')
      expect(ctx.globalAlpha).toBe(1)
    }
  })
  it('sets globalAlpha in (0, 1] before every fill', () => {
    const s = arena('Spider')
    const ctx = make2DContext()
    const alphas: number[] = []
    let cur = 1
    Object.defineProperty(ctx, 'globalAlpha', { get: () => cur, set: (v: number) => { cur = v } })
    const fill = ctx.fill, fillRect = ctx.fillRect
    ctx.fill = ((...a: unknown[]) => { alphas.push(cur); return (fill as (...x: unknown[]) => void)(...a) }) as typeof ctx.fill
    ctx.fillRect = ((...a: unknown[]) => { alphas.push(cur); return (fillRect as (...x: unknown[]) => void)(...a) }) as typeof ctx.fillRect
    render(s, ctx)
    expect(alphas.length).toBeGreaterThan(0)
    for (const a of alphas) { expect(a).toBeGreaterThan(0); expect(a).toBeLessThanOrEqual(1) }
  })
})
