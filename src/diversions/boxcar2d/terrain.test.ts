import { describe, it, expect } from 'vitest'
import { makeTerrain, terrainPoints, TERRAIN_TYPES } from './terrain'

describe('makeTerrain', () => {
  it('is a deterministic pure height function of x', () => {
    const a = makeTerrain(1, 0.6)
    const b = makeTerrain(1, 0.6)
    for (const x of [0, 5, 12.3, 50, 137.7, 1000]) expect(a(x)).toBe(b(x))
  })

  it('is flat at the launch ramp and undulates further out', () => {
    const h = makeTerrain(2, 0.6)
    expect(Math.abs(h(0))).toBeLessThan(1e-9) // ramp pins the start to ground level
    let varied = false
    for (let x = 20; x < 400; x += 7) if (Math.abs(h(x)) > 0.1) varied = true
    expect(varied).toBe(true)
  })

  it('roughness scales amplitude', () => {
    const gentle = makeTerrain(3, 0.2)
    const rugged = makeTerrain(3, 1.2)
    let gentleMax = 0
    let ruggedMax = 0
    for (let x = 20; x < 400; x += 3) {
      gentleMax = Math.max(gentleMax, Math.abs(gentle(x)))
      ruggedMax = Math.max(ruggedMax, Math.abs(rugged(x)))
    }
    expect(ruggedMax).toBeGreaterThan(gentleMax)
  })
})

describe('terrain types', () => {
  it('exposes the four types', () => {
    expect([...TERRAIN_TYPES]).toEqual(['rolling', 'dunes', 'plateaus', 'ridges'])
  })
  it('defaults to rolling = the legacy formula (determinism preserved)', () => {
    const legacy = makeTerrain(9, 0.7)
    const rolling = makeTerrain(9, 0.7, 'rolling')
    for (const x of [0, 5, 12.3, 50, 137.7, 1000]) expect(rolling(x)).toBe(legacy(x))
  })
  it('each type is deterministic and finite over a long sweep', () => {
    for (const t of TERRAIN_TYPES) {
      const a = makeTerrain(5, 0.8, t)
      const b = makeTerrain(5, 0.8, t)
      for (let x = 0; x < 500; x += 11) {
        expect(a(x)).toBe(b(x))
        expect(Number.isFinite(a(x))).toBe(true)
      }
      expect(Math.abs(a(0))).toBeLessThan(1e-9) // flat launch ramp preserved for all types
    }
  })
  it('types produce distinct silhouettes', () => {
    const xs = Array.from({ length: 60 }, (_, i) => 20 + i * 6)
    const sig = (t: (typeof TERRAIN_TYPES)[number]) =>
      xs.map((x) => makeTerrain(5, 0.8, t)(x).toFixed(2)).join(',')
    const sigs = new Set(TERRAIN_TYPES.map(sig))
    expect(sigs.size).toBe(TERRAIN_TYPES.length)
  })
})

describe('terrainPoints', () => {
  it('samples a window into an x-ascending polyline', () => {
    const h = makeTerrain(4, 0.5)
    const pts = terrainPoints(h, 10, 25, 1.5)
    expect(pts.length).toBeGreaterThan(1)
    for (let i = 1; i < pts.length; i++) expect(pts[i].x).toBeGreaterThan(pts[i - 1].x)
    expect(pts[0].x).toBe(10)
    expect(pts[0].y).toBe(h(10))
  })
})
