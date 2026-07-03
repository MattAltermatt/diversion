import { describe, it, expect } from 'vitest'
import {
  ARM_DIRS,
  NEIGHBOR_OFFSETS,
  axialToPixel,
  pixelToAxial,
  hexDist,
  buildLattice,
  edgeMidpoint,
  isHexAvailable,
  ArmPhase,
} from './hex'

describe('hex geometry', () => {
  it('axial ↔ pixel round-trips', () => {
    for (const [q, r] of [[0, 0], [3, -2], [-4, 5], [7, 7]]) {
      const p = axialToPixel(q, r, 24)
      const back = pixelToAxial(p.x, p.y, 24)
      expect(back.q).toBeCloseTo(q, 9)
      expect(back.r).toBeCloseTo(r, 9)
    }
  })

  it('all six neighbours are equidistant (√3·size apart)', () => {
    for (const off of NEIGHBOR_OFFSETS) {
      const p = axialToPixel(off.q, off.r, 24)
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(hexDist(24), 9)
    }
  })

  it('ARM_DIRS[j] points exactly toward neighbour j', () => {
    for (let j = 0; j < 6; j++) {
      const off = NEIGHBOR_OFFSETS[j]
      const p = axialToPixel(off.q, off.r, 1)
      const len = Math.hypot(p.x, p.y)
      expect(ARM_DIRS[j].x).toBeCloseTo(p.x / len, 9)
      expect(ARM_DIRS[j].y).toBeCloseTo(p.y / len, 9)
    }
  })

  it('opposite direction is (j+3)%6', () => {
    for (let j = 0; j < 6; j++) {
      const a = NEIGHBOR_OFFSETS[j]
      const b = NEIGHBOR_OFFSETS[(j + 3) % 6]
      expect(a.q + b.q).toBe(0)
      expect(a.r + b.r).toBe(0)
    }
  })
})

describe('lattice', () => {
  const cells = buildLattice(800, 600, 28)

  it('fills the viewport with overscan', () => {
    expect(cells.length).toBeGreaterThan(100)
    // every cell centre is within the overscanned bounds
    const m = hexDist(28)
    for (const c of cells) {
      expect(c.cx).toBeGreaterThanOrEqual(-m - 1e-6)
      expect(c.cx).toBeLessThanOrEqual(800 + m + 1e-6)
    }
  })

  // KEYSTONE: neighbour pointers are symmetric. The whole handoff logic (h.arms[j]
  // ↔ neighbour.arms[(j+3)%6]) is silently wrong without this.
  it('neighbour wiring is symmetric', () => {
    for (const c of cells) {
      for (let j = 0; j < 6; j++) {
        const n = c.neighbors[j]
        if (!n) continue
        expect(n.neighbors[(j + 3) % 6]).toBe(c)
      }
    }
  })

  // KEYSTONE: the two half-arms of an edge meet at the exact same point, so trails
  // are seamless by construction (not a Chrome pixel-hunt).
  it('edge midpoint agrees from both hexes', () => {
    for (const c of cells) {
      for (let j = 0; j < 6; j++) {
        const n = c.neighbors[j]
        if (!n) continue
        const a = edgeMidpoint(c, n)
        const b = edgeMidpoint(n, c)
        expect(a.x).toBeCloseTo(b.x, 9)
        expect(a.y).toBeCloseTo(b.y, 9)
      }
    }
  })

  it('a fresh hex is available; a touched one is not', () => {
    const c = cells[Math.floor(cells.length / 2)]
    expect(isHexAvailable(c)).toBe(true)
    c.arms[0].phase = ArmPhase.OUT
    expect(isHexAvailable(c)).toBe(false)
  })
})
