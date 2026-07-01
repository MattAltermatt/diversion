import { describe, it, expect } from 'vitest'
import { flockAccel, predatorAim } from './steering'

function world(positions: [number, number][], vels: [number, number][]) {
  const n = positions.length
  const px = new Float32Array(n), py = new Float32Array(n)
  const vx = new Float32Array(n), vy = new Float32Array(n)
  positions.forEach(([x, y], i) => { px[i] = x; py[i] = y })
  vels.forEach(([x, y], i) => { vx[i] = x; vy[i] = y })
  return { px, py, vx, vy, n }
}

describe('steering', () => {
  const W = 1600, H = 900

  it('separation pushes a boid away from a close neighbor', () => {
    const w = world([[100, 100], [110, 100]], [[0, 0], [0, 0]])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [1], /*pn*/0,
      { separationW: 2, alignmentW: 0, cohesionW: 0, fearW: 0, fearRadius: 100, maxForce: 999 },
      new Float32Array(0), new Float32Array(0), W, H, out)
    expect(out[0]).toBeLessThan(0) // ax: boid 0 pushed left, away from neighbor on its right
  })

  it('fear points away from a predator', () => {
    const w = world([[100, 100]], [[0, 0]])
    const ppx = new Float32Array([120]) // predator to the right
    const ppy = new Float32Array([100])
    const out = new Float32Array(2)
    flockAccel(w.px, w.py, w.vx, w.vy, 0, [], /*pn*/1,
      { separationW: 0, alignmentW: 0, cohesionW: 0, fearW: 5, fearRadius: 100, maxForce: 999 },
      ppx, ppy, W, H, out)
    expect(out[0]).toBeLessThan(0) // flees left, away from the predator on the right
  })

  it('predatorAim leads ahead of the target along its velocity', () => {
    // target at x=0 moving +x → aim leads ahead of its current position
    const aim = predatorAim(0, 0, 100, 0, 40, 0, 1)
    expect(aim.x).toBeGreaterThan(0)
    // a bigger lead factor aims further ahead
    const more = predatorAim(0, 0, 100, 0, 40, 0, 1.5)
    expect(more.x).toBeGreaterThan(aim.x)
  })
})
