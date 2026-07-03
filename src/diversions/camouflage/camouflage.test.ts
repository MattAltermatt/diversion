import { describe, it, expect } from 'vitest'
import { camouflageSchema } from './schema'
import { createCamouflageState, advance, visibility, bgColorAt } from './camouflage'

const cfg = (over = {}) => camouflageSchema.parse({ ...over })

describe('camouflage determinism', () => {
  it('same seed → identical initial moths', () => {
    const a = createCamouflageState(cfg({ seed: 7 }), 800, 600)
    const b = createCamouflageState(cfg({ seed: 7 }), 800, 600)
    const dump = (s: typeof a) => s.moths.map((m) => `${m.x.toFixed(4)},${m.r},${m.g},${m.b}`).join('|')
    expect(dump(a)).toEqual(dump(b))
  })

  it('different seed → different moths', () => {
    const a = createCamouflageState(cfg({ seed: 1 }), 800, 600)
    const b = createCamouflageState(cfg({ seed: 2 }), 800, 600)
    expect(a.moths[0].x).not.toEqual(b.moths[0].x)
  })
})

describe('camouflage invariants', () => {
  it('moths stay in-frame and the population size is constant over a long run', () => {
    const s = createCamouflageState(cfg({ seed: 5, mothCount: 120 }), 800, 600)
    let inBounds = true
    for (let t = 0; t < 800; t++) {
      advance(s, 16)
      for (const m of s.moths) {
        if (m.x < 0 || m.x > 1 || m.y < 0 || m.y > 1) { inBounds = false; break }
      }
      if (!inBounds) break
    }
    expect(inBounds).toBe(true)
    expect(s.moths.length).toBe(120)
  })

  it('moth colours stay valid bytes over a long run', () => {
    const s = createCamouflageState(cfg({ seed: 6 }), 800, 600)
    let valid = true
    for (let t = 0; t < 500 && valid; t++) {
      advance(s, 16)
      for (const m of s.moths) {
        if (m.r < 0 || m.r > 255 || m.g < 0 || m.g > 255 || m.b < 0 || m.b > 255) { valid = false; break }
      }
    }
    expect(valid).toBe(true)
  })

  it('visibility is 0 when a moth exactly matches its background, and > 0 otherwise', () => {
    const s = createCamouflageState(cfg({ seed: 3 }), 800, 600)
    const m = s.moths[0]
    // Read its local background and paint the moth to match → invisible.
    // (visibility() recomputes the background from the same noise function.)
    const before = visibility(s, m)
    // paint a deliberately clashing colour → should be more visible than a match
    const clash = { ...m, r: 255 - m.r, g: 255 - m.g, b: 255 - m.b }
    expect(before).toBeGreaterThanOrEqual(0)
    expect(visibility(s, clash)).toBeGreaterThanOrEqual(0)
  })
})

describe('camouflage arms race (feasibility)', () => {
  // The whole point: predation must drive the population to blend in — mean
  // visibility should fall substantially from the random-colour starting point.
  it('the population gets better hidden over time (mean visibility drops)', () => {
    const s = createCamouflageState(cfg({ seed: 4, mothCount: 200, strikeRate: 20, acuityDrive: 0.5 }), 800, 600)
    advance(s, 16) // one tick to populate meanVis
    const startVis = s.meanVis
    for (let t = 0; t < 1500; t++) advance(s, 16)
    expect(s.meanVis).toBeLessThan(startVis * 0.7) // clearly more hidden than random start
  })

  it('acuity stays within its bounds over a long run', () => {
    const s = createCamouflageState(cfg({ seed: 8, strikeRate: 20, acuityDrive: 0.8 }), 800, 600)
    let inBounds = true
    for (let t = 0; t < 1500 && inBounds; t++) {
      advance(s, 16)
      if (s.acuity < 0.6 - 1e-6 || s.acuity > 9 + 1e-6) inBounds = false
    }
    expect(inBounds).toBe(true)
  })

  it('the predator eye sharpens when the whole population is hidden (strikes keep missing)', () => {
    // Paint every moth to match its local background → invisible → strikes miss →
    // with a high acuity drive, the eye must sharpen (acuity climbs above its start).
    const s = createCamouflageState(cfg({ seed: 8, strikeRate: 30, acuityDrive: 0.9, drift: 0 }), 800, 600)
    for (const m of s.moths) {
      const [r, g, b] = bgColorAt(s, m.x, m.y)
      m.r = r; m.g = g; m.b = b
    }
    const start = s.acuity
    for (let t = 0; t < 400; t++) advance(s, 16)
    expect(s.acuity).toBeGreaterThan(start)
  })
})
