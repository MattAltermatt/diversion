import { describe, it, expect } from 'vitest'
import { intermomentarySchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import {
  createIMState, stepIM, computeCircles, updateIMState, resizeIMState,
  ringRadiusFactors, ringAngularVelocity, breathScale, circleIntersections,
  adjacentChord, adjacentCirclesOverlap,
} from './intermomentary'

const defaults = intermomentarySchema.parse({})

describe('intermomentary schema', () => {
  it('parses to calm defaults', () => {
    expect(defaults.circleCount).toBe(12)
    expect(defaults.ringCount).toBe(2)
    expect(defaults.color.mode).toBe('duotone')
    expect(defaults.highlightIntersections).toBe(true)
  })

  it('codec round-trips a full config snapshot', () => {
    const params = encodeConfig(intermomentarySchema, defaults)
    const back = decodeConfig(intermomentarySchema, params)
    expect(back).toEqual(defaults)
  })

  it('every top-level field carries a label in meta', () => {
    for (const [key, field] of Object.entries(intermomentarySchema.shape)) {
      expect(field.meta()?.label, `${key} needs a label`).toBeTruthy()
    }
  })
})

describe('createIMState determinism', () => {
  it('builds rings identically for the same seed', () => {
    const a = createIMState(defaults, 800, 600)
    const b = createIMState(defaults, 800, 600)
    expect(a.rings).toEqual(b.rings)
  })

  it('builds rings differently for a different seed', () => {
    const a = createIMState({ ...defaults, seed: 1 }, 800, 600)
    const b = createIMState({ ...defaults, seed: 2 }, 800, 600)
    expect(a.rings).not.toEqual(b.rings)
  })

  it('creates exactly `ringCount` rings', () => {
    const s = createIMState({ ...defaults, ringCount: 3 }, 800, 600)
    expect(s.rings).toHaveLength(3)
  })

  it('the same seed reproduces the same circle layout', () => {
    const a = computeCircles(createIMState(defaults, 800, 600))
    const b = computeCircles(createIMState(defaults, 800, 600))
    expect(a).toEqual(b)
  })
})

describe('ringRadiusFactors', () => {
  it('is 1 for the outer ring and insets inner rings', () => {
    expect(ringRadiusFactors(1)).toEqual([1])
    expect(ringRadiusFactors(3)).toEqual([1, 0.7, 0.4])
  })
})

describe('HEADLINE: adjacent circles intersect so the moire lattice exists', () => {
  // The whole point is overlapping circle outlines. At defaults, adjacent circles on
  // a ring MUST be closer than the sum of their radii — otherwise no intersections.
  it('adjacent circles overlap at defaults', () => {
    expect(adjacentCirclesOverlap(defaults)).toBe(true)
    // center distance < 2 * circleRadius
    const chord = adjacentChord(defaults.ringRadius, defaults.circleCount)
    expect(chord).toBeLessThan(2 * defaults.circleRadius)
  })

  it('adjacent circles actually produce two intersection points', () => {
    const circles = computeCircles(createIMState(defaults, 800, 600))
    // circles 0 and 1 are adjacent on the outer ring
    const a = circles[0]
    const b = circles[1]
    expect(a.ring).toBe(0)
    expect(b.ring).toBe(0)
    const pts = circleIntersections(a.x, a.y, a.r, b.x, b.y, b.r)
    expect(pts).toHaveLength(2)
    for (const [px, py] of pts) {
      expect(Number.isFinite(px)).toBe(true)
      expect(Number.isFinite(py)).toBe(true)
    }
  })

  it('spaces the circles on a ring evenly (equal angular step)', () => {
    const s = createIMState(defaults, 800, 600)
    const circles = computeCircles(s).filter((c) => c.ring === 0)
    const cx = 400
    const cy = 300
    const angles = circles.map((c) => Math.atan2(c.y - cy, c.x - cx))
    const step = (Math.PI * 2) / defaults.circleCount
    for (let i = 1; i < angles.length; i++) {
      let d = angles[i] - angles[i - 1]
      d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
      expect(d).toBeCloseTo(step, 6)
    }
  })

  it('overlap holds across many seeds', () => {
    let overlapping = 0
    for (let seed = 1; seed <= 40; seed++) {
      if (adjacentCirclesOverlap({ ...defaults, seed })) overlapping++
    }
    expect(overlapping).toBe(40)
  })

  it('produces only finite, non-NaN circle geometry', () => {
    const s = createIMState({ ...defaults, ringCount: 3 }, 800, 600)
    stepIM(s, 1234)
    for (const c of computeCircles(s)) {
      expect(Number.isFinite(c.x)).toBe(true)
      expect(Number.isFinite(c.y)).toBe(true)
      expect(Number.isFinite(c.r)).toBe(true)
      expect(c.r).toBeGreaterThan(0)
    }
  })
})

describe('circleIntersections', () => {
  it('returns [] for circles too far apart', () => {
    expect(circleIntersections(0, 0, 10, 100, 0, 10)).toEqual([])
  })

  it('returns [] for a nested circle', () => {
    expect(circleIntersections(0, 0, 100, 1, 0, 5)).toEqual([])
  })

  it('returns two symmetric points for overlapping circles', () => {
    const pts = circleIntersections(0, 0, 10, 10, 0, 10)
    expect(pts).toHaveLength(2)
    expect(pts[0][0]).toBeCloseTo(5, 6)
    expect(pts[1][0]).toBeCloseTo(5, 6)
    expect(pts[0][1]).toBeCloseTo(-pts[1][1], 6)
  })
})

describe('stepIM motion', () => {
  it('accumulates ring phase over time', () => {
    const s = createIMState({ ...defaults, rotationSpeed: 0.2 }, 800, 600)
    const before = s.rings[0].phase
    stepIM(s, 1000)
    const vel = ringAngularVelocity(s.cfg, s.rings[0], 0)
    expect(s.rings[0].phase - before).toBeCloseTo(vel, 6)
  })

  it('does not rotate when rotationSpeed is 0', () => {
    const s = createIMState({ ...defaults, rotationSpeed: 0 }, 800, 600)
    const before = s.rings.map((r) => r.phase)
    stepIM(s, 2000)
    s.rings.forEach((r, i) => expect(r.phase).toBeCloseTo(before[i], 9))
  })

  it('inner rings spin faster than outer ones when differential > 0', () => {
    const cfg = { ...defaults, ringCount: 3, rotationSpeed: 0.2, differential: 0.3 }
    const s = createIMState(cfg, 800, 600)
    // set all directions positive to compare magnitudes cleanly
    s.rings.forEach((r) => { r.dir = 1 })
    const v0 = Math.abs(ringAngularVelocity(cfg, s.rings[0], 0))
    const v2 = Math.abs(ringAngularVelocity(cfg, s.rings[2], 2))
    expect(v2).toBeGreaterThan(v0)
  })

  it('breathScale oscillates around 1 within the pulse amplitude', () => {
    const cfg = { ...defaults, pulse: 0.1 }
    for (const t of [0, 4000, 8000, 12000, 16000]) {
      const s = breathScale(cfg, t, 0)
      expect(s).toBeGreaterThanOrEqual(1 - 0.1 - 1e-9)
      expect(s).toBeLessThanOrEqual(1 + 0.1 + 1e-9)
    }
  })
})

describe('updateIMState live vs structural', () => {
  it('applies radius/colour changes live (returns true)', () => {
    const s = createIMState(defaults, 800, 600)
    const ok = updateIMState(s, { ...defaults, circleRadius: 150, lineWidth: 1.5 }, 800, 600)
    expect(ok).toBe(true)
    expect(s.cfg.circleRadius).toBe(150)
  })

  it('requires re-setup for a ring-count change (returns false)', () => {
    const s = createIMState(defaults, 800, 600)
    expect(updateIMState(s, { ...defaults, ringCount: 3 }, 800, 600)).toBe(false)
  })

  it('requires re-setup for a seed change (returns false)', () => {
    const s = createIMState(defaults, 800, 600)
    expect(updateIMState(s, { ...defaults, seed: 42 }, 800, 600)).toBe(false)
  })
})

describe('resizeIMState', () => {
  it('updates dimensions (arrangement stays centered)', () => {
    const s = createIMState(defaults, 800, 600)
    resizeIMState(s, 400, 300)
    expect(s.w).toBe(400)
    expect(s.h).toBe(300)
    const circles = computeCircles(s)
    // still centered on the new canvas: circle centers average to the middle
    const avgX = circles.reduce((a, c) => a + c.x, 0) / circles.length
    const avgY = circles.reduce((a, c) => a + c.y, 0) / circles.length
    expect(avgX).toBeCloseTo(200, 6)
    expect(avgY).toBeCloseTo(150, 6)
  })
})
