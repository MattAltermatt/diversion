import { describe, it, expect } from 'vitest'
import { haloSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import {
  createHaloState, haloRadii, haloReach, anyOverlap, stepHalo,
  updateHaloState, resizeHaloState, hueShift,
} from './halo'

const defaults = haloSchema.parse({})

describe('halo schema', () => {
  it('parses to calm defaults', () => {
    expect(defaults.emitters).toBe(3)
    expect(defaults.color.mode).toBe('spectrum')
    expect(defaults.driftSpeed).toBe(5)
  })

  it('codec round-trips a full config snapshot', () => {
    const params = encodeConfig(haloSchema, defaults)
    const back = decodeConfig(haloSchema, params)
    expect(back).toEqual(defaults)
  })

  it('every top-level field carries a label in meta', () => {
    for (const [key, field] of Object.entries(haloSchema.shape)) {
      expect(field.meta()?.label, `${key} needs a label`).toBeTruthy()
    }
  })
})

describe('createHaloState determinism', () => {
  it('places emitters identically for the same seed', () => {
    const a = createHaloState(defaults, 800, 600)
    const b = createHaloState(defaults, 800, 600)
    expect(a.emitters).toEqual(b.emitters)
  })

  it('places emitters differently for a different seed', () => {
    const a = createHaloState({ ...defaults, seed: 1 }, 800, 600)
    const b = createHaloState({ ...defaults, seed: 2 }, 800, 600)
    expect(a.emitters).not.toEqual(b.emitters)
  })

  it('creates exactly `emitters` sources, all inside the canvas', () => {
    const s = createHaloState({ ...defaults, emitters: 6 }, 800, 600)
    expect(s.emitters).toHaveLength(6)
    for (const e of s.emitters) {
      expect(e.x).toBeGreaterThanOrEqual(0); expect(e.x).toBeLessThanOrEqual(800)
      expect(e.y).toBeGreaterThanOrEqual(0); expect(e.y).toBeLessThanOrEqual(600)
      expect(Number.isNaN(e.x)).toBe(false); expect(Number.isNaN(e.y)).toBe(false)
    }
  })
})

describe('haloRadii (static ring family)', () => {
  it('lists k*spacing for k = 1..ringCount, ascending', () => {
    expect(haloRadii(20, 4)).toEqual([20, 40, 60, 80])
  })

  it('reach is ringCount * spacing', () => {
    expect(haloReach({ ...defaults, ringSpacing: 22, ringCount: 26 })).toBe(572)
  })
})

describe('HEADLINE: emitters overlap so moire is possible', () => {
  // The whole point of Halo is overlapping ring families. At defaults, with
  // centers inset into the interior and reaches spanning much of the canvas,
  // at least one emitter pair MUST overlap — otherwise there is no moire.
  it('has at least one overlapping pair at defaults', () => {
    const s = createHaloState(defaults, 800, 600)
    expect(anyOverlap(s)).toBe(true)
  })

  it('overlap holds across many seeds (moire is reliably possible)', () => {
    let overlapping = 0
    for (let seed = 1; seed <= 40; seed++) {
      const s = createHaloState({ ...defaults, seed }, 800, 600)
      if (anyOverlap(s)) overlapping++
    }
    expect(overlapping).toBe(40)
  })

  it('produces non-degenerate geometry (distinct centers, finite radii)', () => {
    const s = createHaloState({ ...defaults, emitters: 4 }, 800, 600)
    const radii = haloRadii(s.cfg.ringSpacing, s.cfg.ringCount)
    expect(radii.length).toBeGreaterThan(1)
    for (const r of radii) expect(Number.isFinite(r)).toBe(true)
    // No two emitters coincide (they would draw the same rings, no interference).
    for (let i = 0; i < s.emitters.length; i++) {
      for (let j = i + 1; j < s.emitters.length; j++) {
        const d = Math.hypot(s.emitters[i].x - s.emitters[j].x, s.emitters[i].y - s.emitters[j].y)
        expect(d).toBeGreaterThan(1)
      }
    }
  })
})

describe('stepHalo drift', () => {
  it('moves a center by driftSpeed and stays finite', () => {
    const cfg = { ...defaults, driftSpeed: 20, emitters: 2 }
    const s = createHaloState(cfg, 800, 600)
    const e0 = { x: s.emitters[0].x, y: s.emitters[0].y }
    stepHalo(s, 1000)
    const moved = Math.hypot(s.emitters[0].x - e0.x, s.emitters[0].y - e0.y)
    expect(moved).toBeCloseTo(20, 4) // 20 px/s * 1s
    expect(Number.isNaN(s.emitters[0].x)).toBe(false)
  })

  it('keeps centers in bounds and reverses velocity on edge contact', () => {
    const cfg = { ...defaults, driftSpeed: 30, emitters: 2 }
    const s = createHaloState(cfg, 200, 200)
    for (let i = 0; i < 3000; i++) {
      stepHalo(s, 16)
      for (const e of s.emitters) {
        expect(e.x).toBeGreaterThanOrEqual(0); expect(e.x).toBeLessThanOrEqual(200)
        expect(e.y).toBeGreaterThanOrEqual(0); expect(e.y).toBeLessThanOrEqual(200)
      }
    }
  })

  it('does not move centers when driftSpeed is 0', () => {
    const s = createHaloState({ ...defaults, driftSpeed: 0 }, 800, 600)
    const before = s.emitters.map((e) => ({ x: e.x, y: e.y }))
    stepHalo(s, 1000)
    s.emitters.forEach((e, i) => {
      expect(e.x).toBeCloseTo(before[i].x, 6)
      expect(e.y).toBeCloseTo(before[i].y, 6)
    })
  })
})

describe('updateHaloState live vs structural', () => {
  it('applies spacing/lineWidth/colour changes live (returns true)', () => {
    const s = createHaloState(defaults, 800, 600)
    const ok = updateHaloState(s, { ...defaults, ringSpacing: 30, lineWidth: 2 }, 800, 600)
    expect(ok).toBe(true)
    expect(s.cfg.ringSpacing).toBe(30)
  })

  it('requires re-setup for an emitter-count change (returns false)', () => {
    const s = createHaloState(defaults, 800, 600)
    expect(updateHaloState(s, { ...defaults, emitters: 5 }, 800, 600)).toBe(false)
  })

  it('requires re-setup for a seed change (returns false)', () => {
    const s = createHaloState(defaults, 800, 600)
    expect(updateHaloState(s, { ...defaults, seed: 99 }, 800, 600)).toBe(false)
  })

  it('recovers drift direction when speed goes from 0 back up', () => {
    const cfg = { ...defaults, driftSpeed: 0 }
    const s = createHaloState(cfg, 800, 600)
    const angles = s.emitters.map((e) => e.angle)
    updateHaloState(s, { ...cfg, driftSpeed: 30 }, 800, 600)
    s.emitters.forEach((e, i) => {
      expect(e.vx).toBeCloseTo(Math.cos(angles[i]) * 30, 5)
      expect(e.vy).toBeCloseTo(Math.sin(angles[i]) * 30, 5)
    })
  })
})

describe('resizeHaloState', () => {
  it('keeps centers in-bounds after shrinking', () => {
    const s = createHaloState(defaults, 800, 600)
    resizeHaloState(s, 400, 300)
    for (const e of s.emitters) {
      expect(e.x).toBeLessThanOrEqual(400)
      expect(e.y).toBeLessThanOrEqual(300)
    }
  })
})

describe('hueShift', () => {
  it('returns an rgb() string and is identity at 0 degrees', () => {
    expect(hueShift('#9fe7ff', 0)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
  })
  it('changes the colour at a nonzero rotation', () => {
    expect(hueShift('#ff0000', 120)).not.toBe(hueShift('#ff0000', 0))
  })
})
