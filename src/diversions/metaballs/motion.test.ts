import { describe, it, expect } from 'vitest'
import { metaballsSchema } from './schema'
import { seedBlobs, stepBlobs, applyRadius, rescaleX } from './motion'

describe('metaballs motion', () => {
  it('seeds the configured number of blobs deterministically', () => {
    const cfg = metaballsSchema.parse({ seed: 7, blobCount: 5 })
    const a = seedBlobs(cfg, 1.6)
    const b = seedBlobs(cfg, 1.6)
    expect(a).toHaveLength(5)
    expect(a).toEqual(b) // same seed → identical blobs
  })

  it('is deterministic over a stepped run for a given seed', () => {
    const cfg = metaballsSchema.parse({ seed: 7 })
    const run = () => {
      const blobs = seedBlobs(cfg, 1.6)
      let t = 0
      for (let i = 0; i < 600; i++) t = stepBlobs(blobs, cfg, 16, t)
      return blobs.map((b) => [b.x, b.y, b.T])
    }
    expect(run()).toEqual(run())
  })

  it('keeps y and T bounded over a long run (float32-immortality)', () => {
    const cfg = metaballsSchema.parse({ seed: 3, speed: 2 })
    const blobs = seedBlobs(cfg, 1.6)
    let t = 0
    // Accumulate worst-case bounds across the whole run and assert once at the
    // end: calling expect() ~20000×N times inside the hot loop is pure harness
    // overhead (it timed out on slower CI runners). Same invariants, same
    // 20000-step run — just no per-iteration expect().
    let allFinite = true
    let minY = Infinity,
      maxY = -Infinity,
      minT = Infinity,
      maxT = -Infinity
    for (let i = 0; i < 20000; i++) {
      t = stepBlobs(blobs, cfg, 16, t)
      for (const b of blobs) {
        if (!Number.isFinite(b.y)) allFinite = false
        if (b.y < minY) minY = b.y
        if (b.y > maxY) maxY = b.y
        if (b.T < minT) minT = b.T
        if (b.T > maxT) maxT = b.T
      }
    }
    expect(allFinite).toBe(true)
    expect(minY).toBeGreaterThanOrEqual(-1.001)
    expect(maxY).toBeLessThanOrEqual(1.001)
    expect(minT).toBeGreaterThanOrEqual(-0.001)
    expect(maxT).toBeLessThanOrEqual(1.001)
  })

  it('makes most blobs individually traverse, not just collapse', () => {
    // Regression guard: the first thermal model had a stable equilibrium at
    // y=0, so blobs pooled onto a horizontal mid-line. Track each blob's own
    // vertical range — a per-blob check also catches a "split collapse" (some
    // pinned at the ceiling, some at the floor, none cycling) that an
    // aggregate top/bottom check would miss.
    const cfg = metaballsSchema.parse({ seed: 5 })
    const blobs = seedBlobs(cfg, 1.6)
    const lo = blobs.map((b) => b.y)
    const hi = blobs.map((b) => b.y)
    let t = 0
    for (let i = 0; i < 4000; i++) {
      t = stepBlobs(blobs, cfg, 16, t)
      blobs.forEach((b, j) => {
        if (b.y < lo[j]) lo[j] = b.y
        if (b.y > hi[j]) hi[j] = b.y
      })
    }
    // Each blob's vertical span > 1.0 means it crossed at least half the screen.
    const traversed = blobs.filter((_, j) => hi[j] - lo[j] > 1.0).length
    expect(traversed).toBeGreaterThanOrEqual(Math.ceil(blobs.length / 2))
  })

  it('re-derives radius from the seeded fraction without a reseed', () => {
    const cfg = metaballsSchema.parse({ seed: 1, radiusMin: 0.06, radiusMax: 0.16 })
    const blobs = seedBlobs(cfg, 1.6)
    applyRadius(blobs, { ...cfg, radiusMax: 0.3 })
    for (const b of blobs) {
      expect(b.radius).toBeCloseTo(0.06 + b.radiusFrac * (0.3 - 0.06), 6)
    }
  })

  it('rescales blob X proportionally when the aspect changes', () => {
    const cfg = metaballsSchema.parse({ seed: 2 })
    const blobs = seedBlobs(cfg, 2.0)
    const before = blobs.map((b) => b.x0)
    rescaleX(blobs, 2.0, 1.0) // aspect halves → X halves
    blobs.forEach((b, i) => expect(b.x0).toBeCloseTo(before[i] * 0.5, 6))
  })

  it('freezes motion at speed 0', () => {
    const cfg = metaballsSchema.parse({ seed: 9, speed: 0 })
    const blobs = seedBlobs(cfg, 1.6)
    let t = 0
    t = stepBlobs(blobs, cfg, 16, t) // settle to the nt=0 frozen position
    const before = blobs.map((b) => [b.x, b.y])
    for (let i = 0; i < 100; i++) t = stepBlobs(blobs, cfg, 16, t)
    expect(blobs.map((b) => [b.x, b.y])).toEqual(before) // no evolution over time
  })
})
