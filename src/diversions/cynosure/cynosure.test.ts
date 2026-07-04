import { describe, it, expect } from 'vitest'
import { cynosureSchema } from './schema'
import { createState, envelope, step, type Rect } from './cynosure'

const cfg = (over: Partial<Record<string, unknown>> = {}) =>
  cynosureSchema.parse({ ...over })

// AABB (ignoring rotation) at a concrete canvas size, for the overlap probe.
function aabb(r: Rect, w: number, h: number) {
  const minEdge = Math.min(w, h)
  const pw = r.wFrac * minEdge
  const ph = r.hFrac * minEdge
  const cx = r.cx * w
  const cy = r.cy * h
  return { x0: cx - pw / 2, y0: cy - ph / 2, x1: cx + pw / 2, y1: cy + ph / 2 }
}

function overlaps(a: ReturnType<typeof aabb>, b: ReturnType<typeof aabb>) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
}

const allFinite = (r: Rect) =>
  [r.cx, r.cy, r.size, r.wFrac, r.hFrac, r.colorT, r.angle, r.spin, r.dirx, r.diry, r.age, r.life]
    .every((n) => Number.isFinite(n))

describe('cynosure schema', () => {
  it('parses with valid defaults', () => {
    const c = cfg()
    expect(c.rectCount).toBe(16)
    expect(c.sizeMax).toBeGreaterThan(c.sizeMin)
    expect(c.opacity).toBeGreaterThan(0)
    expect(c.palette.length).toBeGreaterThanOrEqual(2)
    // seed is pin-only (randomizeOnFreshLoad)
    expect(cynosureSchema.shape.seed.meta()?.randomizeOnFreshLoad).toBe(true)
  })
})

describe('cynosure determinism', () => {
  it('same seed → identical initial pool', () => {
    const a = createState(cfg({ seed: 42 }), 800, 600)
    const b = createState(cfg({ seed: 42 }), 800, 600)
    expect(a.rects).toEqual(b.rects)
  })

  it('different seed → different pool', () => {
    const a = createState(cfg({ seed: 42 }), 800, 600)
    const b = createState(cfg({ seed: 43 }), 800, 600)
    expect(a.rects).not.toEqual(b.rects)
  })
})

describe('cynosure headline probe', () => {
  it('pool has the configured count, rects overlap, sizes in bounds, no NaN', () => {
    const c = cfg({ seed: 7 })
    const st = createState(c, 800, 600)

    // configured count
    expect(st.rects.length).toBe(c.rectCount)

    // sizes within the configured band, and everything finite
    for (const r of st.rects) {
      expect(allFinite(r)).toBe(true)
      expect(r.size).toBeGreaterThanOrEqual(c.sizeMin - 1e-9)
      expect(r.size).toBeLessThanOrEqual(c.sizeMax + 1e-9)
      expect(r.wFrac).toBeGreaterThan(0)
      expect(r.hFrac).toBeGreaterThan(0)
    }

    // at least one pair of rectangles overlaps → translucent blending actually occurs
    const boxes = st.rects.map((r) => aabb(r, 800, 600))
    let pairs = 0
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        if (overlaps(boxes[i], boxes[j])) pairs++
    expect(pairs).toBeGreaterThan(0)
  })

  it('birth/death fade envelope stays in 0..1 and steps without NaN', () => {
    const st = createState(cfg({ seed: 3 }), 800, 600)
    for (let i = 0; i < 400; i++) step(st, 0.1) // ~40s: forces respawns
    expect(st.rects.length).toBe(st.cfg.rectCount)
    for (const r of st.rects) {
      const e = envelope(r)
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
      expect(allFinite(r)).toBe(true)
    }
  })
})
