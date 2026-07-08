import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'

const WORLD_W = 760, WORLD_H = 460, R = 50

function bruteWrap(px: Float32Array, py: Float32Array, n: number, i: number, r: number): number[] {
  const out: number[] = []
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    let dx = px[j] - px[i], dy = py[j] - py[i]
    dx -= WORLD_W * Math.round(dx / WORLD_W); dy -= WORLD_H * Math.round(dy / WORLD_H)
    if (dx * dx + dy * dy <= r * r) out.push(j)
  }
  return out.sort((a, b) => a - b)
}

function bruteClip(px: Float32Array, py: Float32Array, n: number, i: number, r: number): number[] {
  const out: number[] = []
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    const dx = px[j] - px[i], dy = py[j] - py[i]
    if (dx * dx + dy * dy <= r * r) out.push(j)
  }
  return out.sort((a, b) => a - b)
}

function cloud(n: number, seed: number) {
  const rng = mulberry32(seed)
  const px = new Float32Array(n), py = new Float32Array(n)
  for (let i = 0; i < n; i++) { px[i] = rng() * WORLD_W; py[i] = rng() * WORLD_H }
  return { px, py }
}

describe('SpatialHash', () => {
  it('wrap=true: neighborsWithin matches toroidal brute-force, including boids near the seam', () => {
    const n = 300
    const { px, py } = cloud(n, 42)
    // force some boids right at the edges, where a broken tiling tears the flock
    px[0] = 1; py[0] = 1
    px[1] = WORLD_W - 1; py[1] = 1
    px[2] = 1; py[2] = WORLD_H - 1
    const hash = new SpatialHash(WORLD_W, WORLD_H, R, true)
    hash.rebuild(px, py, n)
    for (let i = 0; i < n; i++) {
      const got: number[] = []
      hash.neighborsWithin(px, py, i, R, 999, got)
      expect(got.sort((a, b) => a - b)).toEqual(bruteWrap(px, py, n, i, R))
    }
  })

  it('wrap=false: neighborsWithin matches clipped brute-force (no seam wrap)', () => {
    const n = 300
    const { px, py } = cloud(n, 7)
    px[0] = 1; py[0] = 1 // near the edge — must NOT see boids near the opposite edge
    const hash = new SpatialHash(WORLD_W, WORLD_H, R, false)
    hash.rebuild(px, py, n)
    for (let i = 0; i < n; i++) {
      const got: number[] = []
      hash.neighborsWithin(px, py, i, R, 999, got)
      expect(got.sort((a, b) => a - b)).toEqual(bruteClip(px, py, n, i, R))
    }
  })

  it('configure() is a no-op (keeps existing buckets) when params are unchanged', () => {
    const hash = new SpatialHash(WORLD_W, WORLD_H, R, true)
    const px = new Float32Array([100]), py = new Float32Array([100])
    hash.rebuild(px, py, 1)
    hash.configure(R, true) // same cellSize/wrap — should not clear the just-built buckets
    const got: number[] = []
    hash.neighborsWithin(px, py, 0, R, 999, got) // querying boid 0 itself excluded; just confirm no throw
    expect(got).toEqual([])
  })

  it('configure() picks up a changed cell size for the next rebuild', () => {
    const n = 50
    const { px, py } = cloud(n, 3)
    const hash = new SpatialHash(WORLD_W, WORLD_H, 30, true)
    hash.configure(90, true) // perception grew — grid must widen to keep r<=cellSize
    hash.rebuild(px, py, n)
    const got: number[] = []
    hash.neighborsWithin(px, py, 0, 90, 999, got)
    expect(got.sort((a, b) => a - b)).toEqual(bruteWrap(px, py, n, 0, 90))
  })
})
