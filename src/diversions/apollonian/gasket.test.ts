import { describe, expect, it } from 'vitest'
import { apollonianSchema } from './schema'
import { advance, createState, resizeState } from './gasket'

const cfg = apollonianSchema.parse({})

describe('gasket state', () => {
  it('resize preserves the gasket and the reveal timeline (no restart)', () => {
    const s = createState(cfg, 800, 600)
    advance(s, 5000) // reveal some circles + advance rotation
    const circlesRef = s.circles
    const revealed = s.revealed
    const rot = s.rotPhase
    resizeState(s, 1920, 1080)
    expect(s.w).toBe(1920)
    expect(s.h).toBe(1080)
    expect(s.circles).toBe(circlesRef) // same array — NOT regenerated
    expect(s.revealed).toBe(revealed) // reveal not reset to 0
    expect(s.rotPhase).toBe(rot) // spin not snapped back
  })

  it('different seeds give different starting orientations', () => {
    const a = createState(apollonianSchema.parse({ seed: 1 }), 800, 600)
    const b = createState(apollonianSchema.parse({ seed: 2 }), 800, 600)
    expect(a.rotPhase).not.toBe(b.rotPhase)
  })

  it('is deterministic: same seed → same rotation + circle count', () => {
    const a = createState(apollonianSchema.parse({ seed: 7 }), 800, 600)
    const b = createState(apollonianSchema.parse({ seed: 7 }), 800, 600)
    expect(a.rotPhase).toBe(b.rotPhase)
    expect(a.circles.length).toBe(b.circles.length)
  })

  it('growthSpeed 0 reveals the whole gasket on the first advance', () => {
    const s = createState(apollonianSchema.parse({ growthSpeed: 0 }), 800, 600)
    advance(s, 16)
    expect(s.revealed).toBe(s.circles.length)
  })
})
