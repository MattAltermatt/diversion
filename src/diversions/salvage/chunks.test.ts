import { describe, it, expect } from 'vitest'
import { makeGrid, PICTURE, FREE, cellIndex, floodReach } from './grid'
import { partitionBlocks, expandChunks, isExposed } from './chunks'

// A 6x4 block picture: left half colour 0, right half colour 1, one void block at (5,0).
function fixture() {
  const bw = 6, bh = 4
  const idx = new Uint8Array(bw * bh)
  const cov = new Uint8Array(bw * bh).fill(1)
  for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) idx[r * bw + c] = c < 3 ? 0 : 1
  cov[5] = 0
  return { bw, bh, idx, cov }
}

describe('partitionBlocks', () => {
  it('assigns every covered block to exactly one piece, none over the cap, one colour each', () => {
    const { bw, bh, idx, cov } = fixture()
    const pieces = partitionBlocks(idx, cov, bw, bh, 4)
    const seen = new Set<number>()
    for (const p of pieces) {
      expect(p.length).toBeLessThanOrEqual(4)
      expect(new Set(p.map((b) => idx[b])).size).toBe(1)
      for (const b of p) { expect(seen.has(b)).toBe(false); seen.add(b) }
    }
    expect(seen.size).toBe(23)
  })

  it('keeps each piece 4-connected', () => {
    const { bw, bh, idx, cov } = fixture()
    for (const p of partitionBlocks(idx, cov, bw, bh, 5)) {
      const set = new Set(p), reach = new Set([p[0]]), q = [p[0]]
      while (q.length) {
        const b = q.pop()!
        const c = b % bw
        for (const n of [c > 0 ? b - 1 : -1, c < bw - 1 ? b + 1 : -1, b - bw, b + bw]) {
          if (n >= 0 && set.has(n) && !reach.has(n)) { reach.add(n); q.push(n) }
        }
      }
      expect(reach.size).toBe(set.size)
    }
  })

  it('is deterministic', () => {
    const { bw, bh, idx, cov } = fixture()
    expect(partitionBlocks(idx, cov, bw, bh, 3)).toEqual(partitionBlocks(idx, cov, bw, bh, 3))
  })
})

describe('expandChunks', () => {
  it('turns each block into k×k PICTURE cells at the origin and records the shape', () => {
    const { bw, bh, idx, cov } = fixture()
    const g = makeGrid(30, 20)
    const chunks = expandChunks(partitionBlocks(idx, cov, bw, bh, 4), idx, bw, 2, 3, 2, g)
    let cells = 0
    for (const ch of chunks) {
      cells += ch.home.length
      expect(ch.home.length).toBe(ch.mass * 4)
      expect(ch.local.length).toBe(ch.home.length * 2)
      for (const i of ch.home) { expect(g.occ[i]).toBe(PICTURE); expect(g.owner[i]).toBe(ch.id) }
    }
    expect(cells).toBe(23 * 4)
    expect(g.occ[cellIndex(g, 3, 2)]).toBe(PICTURE)
    expect(g.occ[cellIndex(g, 3 + 5 * 2, 2)]).toBe(FREE) // the void block
  })
})

describe('isExposed', () => {
  it('is true only for pieces touching a REACHABLE free cell', () => {
    // 3x3 solid block, cap 1 → nine single-block pieces at k=1; the centre is enclosed.
    const idx = new Uint8Array(9), cov = new Uint8Array(9).fill(1)
    const g = makeGrid(7, 7)
    const chunks = expandChunks(partitionBlocks(idx, cov, 3, 3, 1), idx, 3, 1, 2, 2, g)
    floodReach(g)
    const centre = chunks.find((c) => c.home[0] === cellIndex(g, 3, 3))!
    expect(isExposed(g, centre)).toBe(false)
    expect(chunks.filter((c) => isExposed(g, c)).length).toBe(8)
    // Open a hole beside the centre but wall it off from the outside: still not exposed.
    g.occ[cellIndex(g, 3, 2)] = FREE
    g.reach.fill(0)
    expect(isExposed(g, centre)).toBe(false)
  })
})
