import { describe, it, expect } from 'vitest'
import {
  dropForward, dropInverse, combForward, combInverse, combNearDist,
  vortexForward, vortexInverse, vortexStrengthAt,
  dropRadiusAt, combPullAt, type CombOp, type DropOp, type VortexOp, type Vec2,
} from './ops'

const near = (a: Vec2, b: Vec2, eps = 1e-9) => {
  expect(Math.abs(a.x - b.x)).toBeLessThan(eps)
  expect(Math.abs(a.y - b.y)).toBeLessThan(eps)
}

describe('drop map', () => {
  const c: Vec2 = { x: 0.5, y: 0.5 }
  const r = 0.12

  it('forward∘inverse is identity for points outside the disk', () => {
    for (const p of [{ x: 0.9, y: 0.5 }, { x: 0.1, y: 0.2 }, { x: 0.7, y: 0.85 }]) {
      const fwd = dropForward(p, c, r) // this is where the point ends up after the drop
      const back = dropInverse(fwd, c, r)
      expect(back).not.toBeNull()
      near(back!, p)
    }
  })

  it('inverse returns null exactly inside the fresh disk (terminal → drop ink)', () => {
    expect(dropInverse({ x: 0.5, y: 0.5 }, c, r)).toBeNull() // dead centre
    expect(dropInverse({ x: 0.5 + r * 0.5, y: 0.5 }, c, r)).toBeNull() // inside
    expect(dropInverse({ x: 0.5 + r * 1.5, y: 0.5 }, c, r)).not.toBeNull() // outside
  })

  it('pushes points radially outward (never inward)', () => {
    const p = { x: 0.7, y: 0.55 }
    const fwd = dropForward(p, c, r)
    const before = Math.hypot(p.x - c.x, p.y - c.y)
    const after = Math.hypot(fwd.x - c.x, fwd.y - c.y)
    expect(after).toBeGreaterThan(before)
  })
})

describe('comb map', () => {
  const base: CombOp = {
    kind: 'comb', ax: 0.5, ay: 0.5, mx: 0, my: 1,
    spacing: 0.1, phase: 0, z: 0.08, falloff: 0.04, startMs: 0, durMs: 1,
  }

  it('forward∘inverse is identity (exact — perp distance invariant along M)', () => {
    for (const p of [{ x: 0.5, y: 0.5 }, { x: 0.33, y: 0.7 }, { x: 0.88, y: 0.12 }]) {
      near(combInverse(combForward(p, base), base), p, 1e-9)
    }
  })

  it('nearest-tooth distance is periodic in spacing and peaks at the half-gap', () => {
    // on a tooth line (perp = 0) distance is 0
    expect(combNearDist({ x: 0.5, y: 0.0 }, base)).toBeCloseTo(0, 12)
    // half a spacing away in x (perp direction, since M is vertical) → max distance
    expect(combNearDist({ x: 0.5 + base.spacing / 2, y: 0.0 }, base)).toBeCloseTo(base.spacing / 2, 12)
    // a full spacing away → back to a tooth
    expect(combNearDist({ x: 0.5 + base.spacing, y: 0.0 }, base)).toBeCloseTo(0, 12)
  })

  it('pulls hardest on a tooth, weakest between teeth', () => {
    const onTooth = combForward({ x: 0.5, y: 0.5 }, base)
    const between = combForward({ x: 0.5 + base.spacing / 2, y: 0.5 }, base)
    const pullOn = onTooth.y - 0.5
    const pullBetween = between.y - 0.5
    expect(pullOn).toBeGreaterThan(pullBetween)
    expect(pullOn).toBeCloseTo(base.z, 6) // full pull on the tooth
  })
})

describe('vortex map', () => {
  const o: VortexOp = {
    kind: 'vortex', cx: 0.5, cy: 0.5, strength: 2.5, radius: 0.2, startMs: 0, durMs: 1,
  }

  it('forward∘inverse is identity (rotation preserves radius → exact)', () => {
    for (const p of [{ x: 0.7, y: 0.55 }, { x: 0.3, y: 0.2 }, { x: 0.9, y: 0.8 }]) {
      near(vortexInverse(vortexForward(p, o), o), p, 1e-9)
    }
  })

  it('preserves distance to the centre (pure rotation)', () => {
    const p = { x: 0.8, y: 0.5 }
    const f = vortexForward(p, o)
    const rb = Math.hypot(p.x - 0.5, p.y - 0.5)
    const ra = Math.hypot(f.x - 0.5, f.y - 0.5)
    expect(ra).toBeCloseTo(rb, 12)
  })

  it('rotates the centre hardest, far field barely at all', () => {
    const nearC = vortexForward({ x: 0.5 + 0.02, y: 0.5 }, o)
    const farC = vortexForward({ x: 0.5 + 0.9, y: 0.5 }, o)
    const angNear = Math.atan2(nearC.y - 0.5, nearC.x - 0.5)
    const angFar = Math.atan2(farC.y - 0.5, farC.x - 0.5)
    expect(Math.abs(angNear)).toBeGreaterThan(Math.abs(angFar))
  })

  it('swirl strength ramps 0 → strength', () => {
    expect(vortexStrengthAt(o, -1)).toBe(0)
    expect(vortexStrengthAt(o, 0)).toBe(0)
    expect(vortexStrengthAt(o, 1)).toBeCloseTo(2.5, 12)
    expect(vortexStrengthAt(o, 999)).toBe(2.5)
    expect(vortexStrengthAt(o, 0.5)).toBeGreaterThan(0)
  })
})

describe('animated scalars', () => {
  const drop: DropOp = { kind: 'drop', cx: 0.5, cy: 0.5, r: 0.1, color: 0, startMs: 100, durMs: 200 }
  const comb: CombOp = {
    kind: 'comb', ax: 0.5, ay: 0.5, mx: 1, my: 0,
    spacing: 0.1, phase: 0, z: 0.1, falloff: 0.04, startMs: 100, durMs: 200,
  }

  it('drop radius grows 0 → r across its window', () => {
    expect(dropRadiusAt(drop, 50)).toBe(0) // before
    expect(dropRadiusAt(drop, 100)).toBe(0) // at start
    expect(dropRadiusAt(drop, 300)).toBeCloseTo(0.1, 12) // at end
    expect(dropRadiusAt(drop, 999)).toBe(0.1) // after (clamped)
    expect(dropRadiusAt(drop, 200)).toBeGreaterThan(0) // mid-bloom
  })

  it('comb pull ramps 0 → z linearly', () => {
    expect(combPullAt(comb, 50)).toBe(0)
    expect(combPullAt(comb, 200)).toBeCloseTo(0.05, 12) // halfway
    expect(combPullAt(comb, 300)).toBe(0.1)
    expect(combPullAt(comb, 999)).toBe(0.1)
  })
})
