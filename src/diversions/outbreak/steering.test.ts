import { describe, it, expect } from 'vitest'
import { addSeek, addAvoid, addFlee, addCohesion, addSeparation } from './steering'

const acc = () => new Float32Array(2)

describe('steering primitives', () => {
  it('addSeek pulls toward the target (unit vector)', () => {
    const o = acc()
    addSeek(0, 0, 10, 0, 1, o)
    expect(o[0]).toBeCloseTo(1)
    expect(o[1]).toBeCloseTo(0)
  })

  it('addAvoid pushes directly away from the point', () => {
    const o = acc()
    addAvoid(0, 0, 10, 0, 1, o) // point to the right → push left
    expect(o[0]).toBeCloseTo(-1)
    expect(o[1]).toBeCloseTo(0)
  })

  it('addFlee falls off to zero at the radius edge and ignores agents beyond it', () => {
    const px = new Float32Array([0, 5, 100])
    const py = new Float32Array([0, 0, 0])
    const near = acc()
    addFlee(px, py, 0, [1], 10, 1, near) // neighbour at d=5, radius 10 → f=0.5
    expect(near[0]).toBeCloseTo(-0.5) // pushed left, half strength
    const far = acc()
    addFlee(px, py, 0, [2], 10, 1, far) // neighbour at d=100 > radius → no effect
    expect(far[0]).toBe(0)
    expect(far[1]).toBe(0)
  })

  it('addCohesion pulls toward the neighbour centroid', () => {
    const px = new Float32Array([0, 10, 10])
    const py = new Float32Array([0, 0, 20])
    const o = acc()
    addCohesion(px, py, 0, [1, 2], 1, o) // centroid (10,10) → unit (0.707,0.707)
    expect(o[0]).toBeCloseTo(Math.SQRT1_2)
    expect(o[1]).toBeCloseTo(Math.SQRT1_2)
  })

  it('addSeparation falls off with distance (weak at rest-packing, strong at overlap)', () => {
    const px = new Float32Array([0, 6, 1])
    const py = new Float32Array([0, 0, 0])
    // A neighbour near the radius edge (d=6, radius=7) barely pushes...
    const weak = acc()
    addSeparation(px, py, 0, [1], 7, 1, weak) // f = (1 - 6/7) ≈ 0.143
    expect(weak[0]).toBeCloseTo(-1 / 7, 2) // pushed left, ~0.14 strength
    // ...while one at genuine overlap (d=1) shoves near full strength.
    const strong = acc()
    addSeparation(px, py, 0, [2], 7, 1, strong) // f = (1 - 1/7) ≈ 0.857
    expect(strong[0]).toBeCloseTo(-6 / 7, 2)
    // A neighbour beyond the radius is ignored.
    const far = acc()
    addSeparation(new Float32Array([0, 100]), new Float32Array([0, 0]), 0, [1], 7, 1, far)
    expect(far[0]).toBe(0)
  })
})
