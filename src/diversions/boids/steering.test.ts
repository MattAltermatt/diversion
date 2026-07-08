import { describe, it, expect } from 'vitest'
import { flockAccel, type FlockParams } from './steering'

function world(positions: [number, number][], vels: [number, number][]) {
  const n = positions.length
  const px = new Float32Array(n), py = new Float32Array(n)
  const vx = new Float32Array(n), vy = new Float32Array(n)
  positions.forEach(([x, y], i) => { px[i] = x; py[i] = y })
  vels.forEach(([x, y], i) => { vx[i] = x; vy[i] = y })
  return { px, py, vx, vy, n }
}

const P: FlockParams = { separationW: 1.2, alignmentW: 1.0, cohesionW: 0.9, fearW: 2.4, fearRadius: 100 }

describe('steering', () => {
  const W = 760, H = 460

  it('separation pushes a boid away from a too-close neighbor', () => {
    const w = world([[100, 100], [110, 100]], [[0, 0], [0, 0]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [1],
      { ...P, alignmentW: 0, cohesionW: 0 },
      W, H, false, 0, 0, false, out)
    expect(out[0]).toBeLessThan(0) // boid 0 pushed left, away from its neighbor on the right
  })

  it('a boid inside another\'s separation radius steers away from it', () => {
    // neighbor directly above (smaller y) → boid should get a downward (+y) push
    const w = world([[100, 100], [100, 92]], [[0, 0], [0, 0]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [1],
      { ...P, alignmentW: 0, cohesionW: 0 },
      W, H, false, 0, 0, false, out)
    expect(out[1]).toBeGreaterThan(0)
  })

  it('alignment steers a boid toward its neighbors\' average heading', () => {
    // boid 0 moving +x, neighbor moving +y at the same spot (no separation term
    // since distance is 0 handled via the 1e-6 floor) — isolate alignment by
    // zeroing separation/cohesion.
    const w = world([[100, 100], [140, 100]], [[10, 0], [0, 10]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [1],
      { ...P, separationW: 0, cohesionW: 0 },
      W, H, false, 0, 0, false, out)
    // boid 0's velocity is (10,0); its neighbor's is (0,10) — alignment should pull
    // boid 0's heading toward +y (positive ay), converging the two headings.
    expect(out[1]).toBeGreaterThan(0)
  })

  it('two mutually-aligning boids converge heading over several steps', () => {
    // Integrate alignment-only for a few steps and confirm the headings get closer.
    let vx0 = 10, vy0 = 0, vx1 = 0, vy1 = 10
    const px = new Float32Array([100, 140]), py = new Float32Array([100, 100])
    const params: FlockParams = { separationW: 0, alignmentW: 1.5, cohesionW: 0, fearW: 0, fearRadius: 0 }
    const out = new Float32Array(2)
    const angleDelta = () => Math.abs(Math.atan2(vy0, vx0) - Math.atan2(vy1, vx1))
    const before = angleDelta()
    for (let step = 0; step < 20; step++) {
      const vx = new Float32Array([vx0, vx1]), vy = new Float32Array([vy0, vy1])
      flockAccel(px, py, vx, vy, 0, [1], params, W, H, false, 0, 0, false, out)
      vx0 += out[0] * 0.01; vy0 += out[1] * 0.01
      flockAccel(px, py, vx, vy, 1, [0], params, W, H, false, 0, 0, false, out)
      vx1 += out[0] * 0.01; vy1 += out[1] * 0.01
    }
    expect(angleDelta()).toBeLessThan(before)
  })

  it('fear points away from a nearby predator', () => {
    const w = world([[100, 100]], [[0, 0]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [], P, W, H, false, 120, 100, true, out) // predator to the right
    expect(out[0]).toBeLessThan(0) // flees left, away from the predator on the right
  })

  it('fear is zero once the predator is outside fearRadius', () => {
    const w = world([[100, 100]], [[0, 0]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [], P, W, H, false, 100 + P.fearRadius + 50, 100, true, out)
    expect(out[0]).toBe(0)
    expect(out[1]).toBe(0)
  })

  it('wrap=true uses minimum-image distance across the seam', () => {
    // boid near x=0, neighbor near x=W-1 — with wrap they're 2 units apart (close),
    // without wrap they're nearly W units apart (far, no separation effect).
    const w = world([[1, 100], [W - 1, 100]], [[0, 0], [0, 0]])
    const outWrap = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [1], { ...P, alignmentW: 0, cohesionW: 0 }, W, H, true, 0, 0, false, outWrap)
    expect(Math.abs(outWrap[0])).toBeGreaterThan(0) // strong separation across the seam
  })
})
