import { describe, it, expect } from 'vitest'
import { advance, applyConfig, createState, type BoxfitState, type Shape } from './boxfit'
import { boxfitSchema, type BoxfitConfig } from './schema'

const cfg = (over: Partial<BoxfitConfig> = {}): BoxfitConfig => boxfitSchema.parse({ ...over })

function pack(c: BoxfitConfig, w: number, h: number, ms: number): BoxfitState {
  const s = createState(c, w, h)
  for (let i = 0; i < ms / 16; i++) advance(s, 16)
  return s
}

// ── geometric overlap oracle (independent of the sim's internal test) ──
function extents(sh: Shape, half: number): [number, number] {
  return sh.box ? [half * sh.ar, half] : [half, half]
}
/** Signed clearance between two frozen shapes (>= 0 means no overlap). Negative =
 *  interpenetration by that many px. Uniform over box/circle/mixed pairs. */
function clearance(a: Shape, b: Shape): number {
  const dx = Math.abs(a.cx - b.cx)
  const dy = Math.abs(a.cy - b.cy)
  const [ahw, ahh] = extents(a, a.half)
  const [bhw, bhh] = extents(b, b.half)
  if (a.box && b.box) {
    // AABB: separated if either axis gap is >= 0; clearance = the larger axis gap.
    return Math.max(dx - (ahw + bhw), dy - (ahh + bhh))
  }
  if (!a.box && !b.box) {
    return Math.hypot(dx, dy) - (a.half + b.half)
  }
  const box = a.box ? a : b
  const circ = a.box ? b : a
  const [bxw, bxh] = extents(box, box.half)
  const qx = Math.max(Math.abs(box.cx - circ.cx) - bxw, 0)
  const qy = Math.max(Math.abs(box.cy - circ.cy) - bxh, 0)
  return Math.hypot(qx, qy) - circ.half
}

describe('boxfit schema', () => {
  it('parses with valid defaults', () => {
    const c = cfg()
    expect(c.shape).toBe('boxes')
    expect(c.colors.length).toBeGreaterThan(0)
    expect(c.gap).toBeGreaterThanOrEqual(0)
    expect(c.maxSize).toBeGreaterThan(0)
  })
})

describe('boxfit determinism', () => {
  const serialize = (s: BoxfitState) =>
    s.shapes.map((sh) => `${sh.box ? 'b' : 'c'}:${sh.cx.toFixed(3)},${sh.cy.toFixed(3)},${sh.half.toFixed(3)},${sh.ar.toFixed(3)}`)

  it('same seed → identical packing', () => {
    const a = pack(cfg({ seed: 42 }), 400, 300, 3000)
    const b = pack(cfg({ seed: 42 }), 400, 300, 3000)
    expect(a.shapes.length).toBe(b.shapes.length)
    expect(serialize(a)).toEqual(serialize(b))
  })
  it('different seed → different packing', () => {
    const a = pack(cfg({ seed: 1 }), 400, 300, 3000)
    const b = pack(cfg({ seed: 2 }), 400, 300, 3000)
    expect(serialize(a)).not.toEqual(serialize(b))
  })
})

describe('boxfit correctness (headline)', () => {
  it('no two frozen shapes overlap — every mode respects the gap, no NaN, real coverage', () => {
    for (const shape of ['boxes', 'circles', 'mixed'] as const) {
      const gap = 2
      const s = pack(cfg({ shape, gap, seed: 5, growthSpeed: 200, spawnRate: 24 }), 420, 320, 6000)

      // meaningful packing assembled
      expect(s.shapes.length).toBeGreaterThan(40)

      // no NaN / finite everywhere
      for (const sh of s.shapes) {
        expect(Number.isFinite(sh.cx) && Number.isFinite(sh.cy) && Number.isFinite(sh.half)).toBe(true)
        expect(sh.half).toBeGreaterThan(0)
      }

      // pairwise: no overlap, and the gap is respected (allow 0.5px float slack)
      let worst = Infinity
      for (let i = 0; i < s.shapes.length; i++) {
        for (let j = i + 1; j < s.shapes.length; j++) {
          const c = clearance(s.shapes[i], s.shapes[j])
          if (c < worst) worst = c
        }
      }
      expect(worst).toBeGreaterThanOrEqual(gap - 0.5)

      // covers a meaningful fraction of the plane
      expect(s.coverage).toBeGreaterThan(0.3)
    }
  })

  it('marks the plane filled and stops growing once packed', () => {
    const s = createState(cfg({ seed: 3, growthSpeed: 300, spawnRate: 40, gap: 1 }), 240, 180)
    for (let i = 0; i < 4000 && !s.filled; i++) advance(s, 16)
    expect(s.filled).toBe(true)
    const n = s.shapes.length
    advance(s, 16)
    expect(s.shapes.length).toBe(n) // filled → no further growth
  })
})

describe('boxfit applyConfig', () => {
  it('applies colour edits live and flags a redraw', () => {
    const s = createState(cfg({ colorMode: 'by-size' }), 400, 300)
    s.needsFullRedraw = false
    expect(applyConfig(s, cfg({ colorMode: 'random' }))).toBe(true)
    expect(s.needsFullRedraw).toBe(true)
  })
  it('rejects structural edits (shape / seed) for a full re-setup', () => {
    const s = createState(cfg({ seed: 1, shape: 'boxes' }), 400, 300)
    expect(applyConfig(s, cfg({ seed: 2 }))).toBe(false)
    expect(applyConfig(s, cfg({ shape: 'circles' }))).toBe(false)
  })
})
