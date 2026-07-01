import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'

const WORLD_W = 1600, WORLD_H = 900, R = 64

// Brute force must use the SAME toroidal minimum-image distance the hash does.
function brute(px: Float32Array, py: Float32Array, n: number, i: number, r: number): number[] {
  const out: number[] = []
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    let dx = px[j] - px[i], dy = py[j] - py[i]
    dx -= WORLD_W * Math.round(dx / WORLD_W); dy -= WORLD_H * Math.round(dy / WORLD_H)
    if (dx * dx + dy * dy <= r * r) out.push(j)
  }
  return out.sort((a, b) => a - b)
}

describe('SpatialHash', () => {
  it('neighborsWithin matches brute-force for a seeded cloud (toroidal)', () => {
    const rng = mulberry32(42)
    const n = 300
    const px = new Float32Array(n), py = new Float32Array(n)
    for (let i = 0; i < n; i++) { px[i] = rng() * WORLD_W; py[i] = rng() * WORLD_H }
    const hash = new SpatialHash(WORLD_W, WORLD_H, R)
    hash.rebuild(px, py, n)
    for (let i = 0; i < n; i++) {
      const got: number[] = []
      hash.neighborsWithin(px, py, i, R, 999, got)
      expect(got.sort((a, b) => a - b)).toEqual(brute(px, py, n, i, R))
    }
  })

  it('rebuild(alive) excludes dead boids from queries', () => {
    const px = new Float32Array([100, 110, 120])
    const py = new Float32Array([100, 100, 100])
    const alive = new Uint8Array([1, 0, 1]) // middle boid dead
    const hash = new SpatialHash(WORLD_W, WORLD_H, R)
    hash.rebuild(px, py, 3, alive)
    const got: number[] = []
    hash.neighborsWithin(px, py, 0, R, 999, got)
    expect(got.sort((a, b) => a - b)).toEqual([2]) // 1 is dead → excluded
  })
})
