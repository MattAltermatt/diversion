import { describe, it, expect } from 'vitest'
import { makeGrid, cellIndex, floodReach, MOUND, RESERVED, FREE, PICTURE } from './grid'
import { partitionBlocks, expandChunks } from './chunks'
import { findDropSite, reserve, unreserve, place, lift, clearMound, recountHeap } from './mound'

function piece(g = makeGrid(14, 14)) {
  // One 2x2-block piece at k=1 → a 2x2-cell square at (1,1).
  const idx = new Uint8Array(4), cov = new Uint8Array(4).fill(1)
  const [chunk] = expandChunks(partitionBlocks(idx, cov, 2, 2, 4), idx, 2, 1, 1, 1, g)
  floodReach(g)
  return { g, chunk }
}

describe('findDropSite', () => {
  it('drops the first piece on the seed, later pieces touching the heap, never overlapping', () => {
    const { g, chunk } = piece()
    const seed = cellIndex(g, 9, 9)
    const first = findDropSite(g, chunk, seed)!
    expect(Array.from(first)).toContain(seed)
    for (const i of first) expect(g.occ[i]).toBe(FREE)
    place(g, chunk, first)
    expect(g.heapCount).toBe(4)
    const second = findDropSite(g, chunk, seed)!
    const set = new Set(Array.from(first))
    let touches = false
    for (const i of second) {
      expect(set.has(i)).toBe(false)
      for (const j of [i - 1, i + 1, i - g.cols, i + g.cols]) if (set.has(j)) touches = true
    }
    expect(touches).toBe(true)
  })

  it('treats a reserved site as heap and never lands on a forbidden cell', () => {
    const { g, chunk } = piece()
    const seed = cellIndex(g, 9, 9)
    const first = findDropSite(g, chunk, seed)!
    reserve(g, first)
    for (const i of first) expect(g.occ[i]).toBe(RESERVED)
    expect(g.heapCount).toBe(4)
    // Forbid everything left of column 8: the next site must stay right of it.
    for (let r = 0; r < 14; r++) for (let c = 0; c < 8; c++) g.forbid[cellIndex(g, c, r)] = 1
    floodReach(g)
    const second = findDropSite(g, chunk, seed)!
    for (const i of second) { expect(first).not.toContain(i); expect(i % g.cols).toBeGreaterThanOrEqual(8) }
    unreserve(g, first)
    expect(g.heapCount).toBe(0)
    for (const i of first) expect(g.occ[i]).toBe(FREE)
  })

  it('returns null when nothing fits', () => {
    const { g, chunk } = piece()
    g.forbid.fill(1)
    expect(findDropSite(g, chunk, cellIndex(g, 9, 9))).toBeNull()
  })

  it('never lands where no drone can stand: a pocket walled off by the picture', () => {
    const { g, chunk } = piece()
    // A 4x4 PICTURE ring around a 2x2 free pocket at (8..9, 8..9); the seed sits in the
    // pocket, and one heap cell sits outside the ring at (12, 8).
    for (let r = 7; r <= 10; r++) for (let c = 7; c <= 10; c++) {
      if (r === 7 || r === 10 || c === 7 || c === 10) g.occ[cellIndex(g, c, r)] = PICTURE
    }
    g.occ[cellIndex(g, 12, 8)] = MOUND; recountHeap(g)
    floodReach(g)
    const site = findDropSite(g, chunk, cellIndex(g, 8, 8))!
    expect(site).not.toBeNull()
    for (const i of site) { const c = i % g.cols, r = Math.floor(i / g.cols); expect(c < 7 || c > 10 || r < 7 || r > 10).toBe(true) }
  })

  it('a pocket inside the heap is fillable, because drones walk over the heap', () => {
    const { g, chunk } = piece()
    for (let r = 7; r <= 10; r++) for (let c = 7; c <= 10; c++) {
      if (r === 7 || r === 10 || c === 7 || c === 10) g.occ[cellIndex(g, c, r)] = MOUND
    }
    recountHeap(g)
    floodReach(g)
    const site = findDropSite(g, chunk, cellIndex(g, 8, 8))!
    expect(Array.from(site).sort((a, b) => a - b)).toEqual([cellIndex(g, 8, 8), cellIndex(g, 9, 8), cellIndex(g, 8, 9), cellIndex(g, 9, 9)].sort((a, b) => a - b))
  })

  it('prefers the snug placement within a ring', () => {
    const { g, chunk } = piece()
    // An L of mound. From a seed in the crook, ring 1 holds both the snug spot (touching
    // both arms) and a loose spot above it touching one cell; snug must win.
    const seed = cellIndex(g, 10, 8)
    for (const [c, r] of [[9, 7], [9, 8], [9, 9], [10, 9], [11, 9]]) g.occ[cellIndex(g, c, r)] = MOUND
    recountHeap(g)
    floodReach(g)
    const site = findDropSite(g, chunk, seed)!
    let contact = 0
    for (const i of site) for (const j of [i - 1, i + 1, i - g.cols, i + g.cols]) if (g.occ[j] === MOUND) contact++
    expect(contact).toBeGreaterThanOrEqual(3)
  })
})

describe('lift / place / clearMound', () => {
  it('frees cells on lift, owns them on place, and clears the whole mound', () => {
    const { g, chunk } = piece()
    const home = Array.from(chunk.home)
    lift(g, chunk)
    expect(chunk.where).toBe('lifted'); expect(chunk.at).toBeNull()
    for (const i of home) { expect(g.occ[i]).toBe(FREE); expect(g.owner[i]).toBe(-1) }
    const site = findDropSite(g, chunk, cellIndex(g, 9, 9))!
    place(g, chunk, site)
    expect(chunk.where).toBe('mound')
    for (const i of site) { expect(g.occ[i]).toBe(MOUND); expect(g.owner[i]).toBe(chunk.id) }
    clearMound(g, [chunk])
    expect(g.heapCount).toBe(0)
    for (const i of site) expect(g.occ[i]).toBe(FREE)
    expect(chunk.at).toBeNull()
    expect(g.occ[home[0]]).toBe(FREE)
    expect(PICTURE).toBe(1)
  })
})
