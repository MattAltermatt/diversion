import { describe, it, expect } from 'vitest'
import { makeTerrain, terrainPoints } from './terrain'

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
