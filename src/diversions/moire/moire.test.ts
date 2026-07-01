import { describe, it, expect } from 'vitest'
import { moireSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { createMoireState, ringRadii, ringAlpha, culledRingCount, effectiveSpeed, stepMoire, updateMoireState, resizeMoireState } from './moire'

const defaults = moireSchema.parse({})

describe('moire schema', () => {
  it('parses to defaults at the calm end of ranges', () => {
    expect(defaults.centers).toBe(3)
    expect(defaults.color.mode).toBe('glow')
  })

  it('codec round-trips a full config snapshot', () => {
    const params = encodeConfig(moireSchema, defaults)
    const back = decodeConfig(moireSchema, params)
    expect(back).toEqual(defaults)
  })

  it('every top-level field carries a label in meta', () => {
    for (const [key, field] of Object.entries(moireSchema.shape)) {
      expect(field.meta()?.label, `${key} needs a label`).toBeTruthy()
    }
  })
})

describe('createMoireState determinism', () => {
  const cfg = moireSchema.parse({})

  it('places centers identically for the same seed', () => {
    const a = createMoireState(cfg, 800, 600)
    const b = createMoireState(cfg, 800, 600)
    expect(a.centers).toEqual(b.centers)
  })

  it('places centers differently for a different seed', () => {
    const a = createMoireState({ ...cfg, seed: 1 }, 800, 600)
    const b = createMoireState({ ...cfg, seed: 2 }, 800, 600)
    expect(a.centers).not.toEqual(b.centers)
  })

  it('creates exactly `centers` sources, all inside the canvas', () => {
    const s = createMoireState({ ...cfg, centers: 5 }, 800, 600)
    expect(s.centers).toHaveLength(5)
    for (const c of s.centers) {
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x).toBeLessThanOrEqual(800)
      expect(c.y).toBeGreaterThanOrEqual(0); expect(c.y).toBeLessThanOrEqual(600)
    }
  })

  it('derives maxR as the canvas diagonal', () => {
    const s = createMoireState(cfg, 800, 600)
    expect(s.maxR).toBeCloseTo(1000, 0) // sqrt(800^2 + 600^2)
  })
})

describe('ringRadii', () => {
  it('lists rings at phase - k*spacing, descending, within (0, maxR]', () => {
    expect(ringRadii(100, 40, 1000)).toEqual([100, 60, 20])
  })

  it('drops rings that have expanded past maxR', () => {
    expect(ringRadii(130, 40, 100)).toEqual([90, 50, 10])
  })

  it('returns empty before the first ring is born', () => {
    expect(ringRadii(0, 40, 1000)).toEqual([])
  })
})

describe('culledRingCount (solid-mode flash guard)', () => {
  // The flash bug: solid mode XOR-fills concentric discs; any disc with r > maxR
  // covers the whole canvas, so dropping an odd number of them flips the entire
  // parity field in one frame. The invariant that kills it: the dropped count
  // plus the kept (windowed) count must always equal the TRUE unbounded disc
  // count, ceil(phase/spacing) — so no disc is ever silently lost as phase grows.
  it('kept + culled equals the true unbounded disc count across a phase sweep', () => {
    const spacing = 64, maxR = 500
    let worstMismatch = 0
    for (let phase = 0; phase <= 4000; phase += 7) {
      const kept = ringRadii(phase, spacing, maxR).length
      const culled = culledRingCount(phase, spacing, maxR)
      const trueCount = phase > 0 ? Math.ceil(phase / spacing) : 0
      worstMismatch = Math.max(worstMismatch, Math.abs(kept + culled - trueCount))
    }
    expect(worstMismatch).toBe(0)
  })

  it('is zero while every ring still fits on screen', () => {
    expect(culledRingCount(400, 64, 500)).toBe(0)
  })

  it('counts the discs the windowing dropped past maxR', () => {
    // phase 1000, spacing 64, maxR 500 -> 8 discs pushed off screen.
    expect(culledRingCount(1000, 64, 500)).toBe(8)
  })
})

describe('ringAlpha', () => {
  it('is ~0 at birth (radius 0) and at death (radius maxR)', () => {
    expect(ringAlpha(0, 1000, 0.1)).toBeCloseTo(0, 2)
    expect(ringAlpha(1000, 1000, 0.1)).toBeCloseTo(0, 2)
  })

  it('is full in the mid-life band', () => {
    expect(ringAlpha(500, 1000, 0.1)).toBeCloseTo(1, 2)
  })
})

describe('effectiveSpeed', () => {
  it('equals ringSpeed when breathAmount is 0', () => {
    const cfg = moireSchema.parse({ breathAmount: 0 })
    expect(effectiveSpeed(1234, cfg)).toBeCloseTo(cfg.ringSpeed, 5)
  })

  it('stays within +/- breathAmount of ringSpeed', () => {
    const cfg = moireSchema.parse({ breathAmount: 0.5, ringSpeed: 20 })
    let lo = Infinity, hi = -Infinity
    for (let ms = 0; ms < 60000; ms += 250) {
      const s = effectiveSpeed(ms, cfg)
      if (s < lo) lo = s
      if (s > hi) hi = s
    }
    expect(lo).toBeGreaterThanOrEqual(20 * 0.5 - 1e-6)
    expect(hi).toBeLessThanOrEqual(20 * 1.5 + 1e-6)
  })
})

describe('stepMoire drift', () => {
  it('advances phase by the per-frame expansion distance', () => {
    const cfg = moireSchema.parse({ ringSpeed: 20, breathAmount: 0, driftSpeed: 0 })
    const s = createMoireState(cfg, 800, 600)
    const before = s.centers[0].phase
    stepMoire(s, 1000) // 1 second
    expect(s.centers[0].phase).toBeCloseTo(before + 20, 5) // 20 px/s * 1s
  })

  it('keeps centers in bounds and reverses velocity on edge contact', () => {
    const cfg = moireSchema.parse({ driftSpeed: 40, centers: 1, breathAmount: 0 })
    const s = createMoireState(cfg, 200, 200)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (let i = 0; i < 2000; i++) {
      stepMoire(s, 16)
      const c = s.centers[0]
      if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x
      if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y
    }
    expect(minX).toBeGreaterThanOrEqual(0); expect(maxX).toBeLessThanOrEqual(200)
    expect(minY).toBeGreaterThanOrEqual(0); expect(maxY).toBeLessThanOrEqual(200)
  })
})

describe('updateMoireState live vs structural', () => {
  const base = moireSchema.parse({})

  it('applies colour/softness/speed changes live (returns true)', () => {
    const s = createMoireState(base, 800, 600)
    const ok = updateMoireState(s, { ...base, softness: 0.9, ringSpeed: 40 }, 800, 600)
    expect(ok).toBe(true)
    expect(s.cfg.softness).toBe(0.9)
  })

  it('requires re-setup for a center-count change (returns false)', () => {
    const s = createMoireState(base, 800, 600)
    expect(updateMoireState(s, { ...base, centers: 7 }, 800, 600)).toBe(false)
  })

  it('requires re-setup for a seed change (returns false)', () => {
    const s = createMoireState(base, 800, 600)
    expect(updateMoireState(s, { ...base, seed: 99 }, 800, 600)).toBe(false)
  })

  it('recomputes drift velocity live so Drift speed edits are not a no-op', () => {
    const cfg = { ...base, driftSpeed: 10 }
    const s = createMoireState(cfg, 800, 600)
    updateMoireState(s, { ...cfg, driftSpeed: 50 }, 800, 600)
    for (const c of s.centers) {
      expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(50, 5)
    }
  })

  it('recovers drift direction when speed goes from 0 back up', () => {
    const cfg = { ...base, driftSpeed: 0 }
    const s = createMoireState(cfg, 800, 600)
    const angles = s.centers.map((c) => c.angle)
    updateMoireState(s, { ...cfg, driftSpeed: 30 }, 800, 600)
    s.centers.forEach((c, i) => {
      expect(Math.hypot(c.vx, c.vy)).toBeCloseTo(30, 5)
      expect(c.vx).toBeCloseTo(Math.cos(angles[i]) * 30, 5)
      expect(c.vy).toBeCloseTo(Math.sin(angles[i]) * 30, 5)
    })
  })
})

describe('resizeMoireState', () => {
  it('keeps centers in-bounds and rescales maxR', () => {
    const s = createMoireState(moireSchema.parse({}), 800, 600)
    resizeMoireState(s, 400, 300)
    expect(s.maxR).toBeCloseTo(500, 0)
    for (const c of s.centers) {
      expect(c.x).toBeLessThanOrEqual(400)
      expect(c.y).toBeLessThanOrEqual(300)
    }
  })
})
