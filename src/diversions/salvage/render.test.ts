import { describe, it, expect } from 'vitest'
import { make2DContext } from '../../test-setup'
import { makeArena } from './testArena'
import { stepColony } from './colony'
import { spawnDrone } from './recruit'
import { render } from './render'
import { GLYPH_MIN_PX } from './state'

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
  it('Drone size scales the glyph, not its placement', () => {
    const probe = (droneSize: number) => {
      const s = makeArena({ glyph: 'Spider', strength: 24, chunkSize: 4, droneSize })
      spawnDrone(s, s.picOriginCol - 0.5, s.picOriginRow + 0.5)
      const ctx = make2DContext()
      const radii: number[] = [], moves: number[][] = []
      ctx.ellipse = ((_x: number, _y: number, rx: number) => { radii.push(rx) }) as typeof ctx.ellipse
      ctx.translate = ((x: number, y: number) => { moves.push([x, y]) }) as typeof ctx.translate
      render(s, ctx)
      return { radius: radii[0], at: moves[0] }
    }
    const one = probe(1), small = probe(0.75)
    expect(one.radius).toBeCloseTo(10 * 0.45)          // cell 10 in the test arena
    expect(small.radius).toBeCloseTo(one.radius * 0.75)
    expect(small.at).toEqual(one.at)
  })

  it('never draws a drone smaller than GLYPH_MIN_PX, whatever the cell (#322)', () => {
    const s = makeArena({ glyph: 'Spider', strength: 24, chunkSize: 4, droneSize: 0.8 })
    spawnDrone(s, s.picOriginCol - 0.5, s.picOriginRow + 0.5)
    s.cell = 4 // a phone or a gallery tile
    const ctx = make2DContext()
    const radii: number[] = []
    ctx.ellipse = ((_x: number, _y: number, rx: number) => { radii.push(rx) }) as typeof ctx.ellipse
    render(s, ctx)
    expect(radii[0]).toBeCloseTo(GLYPH_MIN_PX * 0.45) // not 4 * 0.8 * 0.45 = 1.44
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
