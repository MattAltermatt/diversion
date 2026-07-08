import { describe, it, expect } from 'vitest'
import { createFlock, stepFlock, hashState, WORLD_W, WORLD_H } from './sim'
import { boidsSchema } from './schema'

const cfg = boidsSchema.parse({ count: 120, seed: 42 })

describe('sim', () => {
  it('is deterministic: same seed → identical state after many ticks', () => {
    const a = createFlock(cfg); for (let i = 0; i < 300; i++) stepFlock(a, 1 / 60)
    const b = createFlock(cfg); for (let i = 0; i < 300; i++) stepFlock(b, 1 / 60)
    expect(hashState(a)).toBe(hashState(b))
  })

  it('a different seed produces a different initial flock', () => {
    const a = createFlock(boidsSchema.parse({ count: 120, seed: 42 }))
    const b = createFlock(boidsSchema.parse({ count: 120, seed: 43 }))
    expect(hashState(a)).not.toBe(hashState(b))
  })

  it('a different seed produces a diverging trajectory', () => {
    const a = createFlock(boidsSchema.parse({ count: 120, seed: 1 }))
    const b = createFlock(boidsSchema.parse({ count: 120, seed: 2 }))
    for (let i = 0; i < 120; i++) { stepFlock(a, 1 / 60); stepFlock(b, 1 / 60) }
    expect(hashState(a)).not.toBe(hashState(b))
  })

  it('boids stay within the world bounds under both edge modes', () => {
    for (const edgeMode of ['wrap', 'steer'] as const) {
      const s = createFlock(boidsSchema.parse({ count: 150, seed: 9, edgeMode }))
      for (let i = 0; i < 600; i++) stepFlock(s, 1 / 60)
      for (let i = 0; i < s.n; i++) {
        expect(s.px[i]).toBeGreaterThanOrEqual(0)
        expect(s.px[i]).toBeLessThanOrEqual(WORLD_W)
        expect(s.py[i]).toBeGreaterThanOrEqual(0)
        expect(s.py[i]).toBeLessThanOrEqual(WORLD_H)
      }
    }
  })

  it('a dispersed spawn self-organizes: heading order parameter rises from random toward aligned', () => {
    // Classic Vicsek-style order parameter: |mean(unit heading vector)| across the
    // flock. Random headings → ~0; a coherent murmuration flying as one body → well
    // above 0. Separation deliberately keeps boids apart (so nearest-neighbor
    // distance is the wrong self-organization signal here) — heading correlation is
    // the correct proxy for "acts like one flock instead of independent points".
    const s = createFlock(boidsSchema.parse({ count: 200, seed: 5 }))
    const orderParam = () => {
      let sx = 0, sy = 0
      for (let i = 0; i < s.n; i++) {
        const sp = Math.hypot(s.vx[i], s.vy[i]) || 1
        sx += s.vx[i] / sp; sy += s.vy[i] / sp
      }
      return Math.hypot(sx, sy) / s.n
    }
    const before = orderParam()
    for (let i = 0; i < 900; i++) stepFlock(s, 1 / 60) // 15s of settling
    const after = orderParam()
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThan(0.4) // meaningfully aligned, not still near-random
  })

  it('does not collapse every boid onto a single point (separation holds a floor distance)', () => {
    const s = createFlock(boidsSchema.parse({ count: 200, seed: 5 }))
    for (let i = 0; i < 900; i++) stepFlock(s, 1 / 60)
    let minDist = Infinity
    for (let i = 0; i < s.n; i++) {
      for (let j = i + 1; j < s.n; j++) {
        const dx = s.px[i] - s.px[j], dy = s.py[i] - s.py[j]
        const d = Math.hypot(dx, dy)
        if (d < minDist) minDist = d
      }
    }
    expect(minDist).toBeGreaterThan(0.5)
  })

  it('wrap mode: a boid crossing the edge reappears on the opposite side (no dead zone)', () => {
    const s = createFlock(boidsSchema.parse({ count: 50, seed: 1, edgeMode: 'wrap' }))
    s.px[0] = WORLD_W - 1; s.py[0] = WORLD_H / 2
    s.vx[0] = 200; s.vy[0] = 0 // driving hard rightward, off the edge
    for (let i = 0; i < 30; i++) stepFlock(s, 1 / 60)
    expect(s.px[0]).toBeGreaterThanOrEqual(0)
    expect(s.px[0]).toBeLessThan(WORLD_W) // wrapped back in, not stuck past the edge
  })
})
