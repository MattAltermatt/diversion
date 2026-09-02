import { type Grid, FREE, MOUND, RESERVED, walkable, inBounds, cellIndex, neighbors4 } from './grid'
import type { Chunk } from './state'

const nb = new Int32Array(4)

function heapish(v: number): boolean { return v === MOUND || v === RESERVED }

/** Cells for `chunk` on the mound: the placement nearest `seed` (Chebyshev rings, each
 *  walked edge by edge — O(r) per ring, never O(r²)) where every cell is FREE and not
 *  forbidden, the piece touches the heap (or covers/touches the seed while there is no
 *  heap), and at least one cell has a REACHABLE walkable neighbour for the crew to stand
 *  on (the heap itself counts: drones walk over dropped pieces).
 *  That last clause is what keeps a piece out of a pocket the heap has enclosed: a site
 *  nobody can walk to is a site nobody can ever fill, and a crew sent there retries
 *  forever. Within a ring the placement with the MOST heap contact wins, so the mound
 *  packs tight instead of growing as lace. RESERVED counts as heap so crews in flight
 *  extend one mound. The forbidden mask keeps the heap off the picture's footprint and
 *  the arena border. */
let out = new Int32Array(0)
let best = new Int32Array(0)

export interface SiteHint { r: number; extent: number }

export function findDropSite(g: Grid, chunk: Chunk, seed: number, hint?: SiteHint): Int32Array | null {
  const sc = seed % g.cols, sr = (seed - sc) / g.cols
  if (out.length < chunk.home.length) { out = new Int32Array(chunk.home.length); best = new Int32Array(chunk.home.length) }
  const maxR = Math.max(g.cols, g.rows)
  let bestContact = 0
  const tryAt = (dc: number, dr: number) => {
    const contact = fits(g, chunk, sc + dc - (chunk.w >> 1), sr + dr - (chunk.h >> 1), seed, out)
    if (contact > bestContact) { bestContact = contact; best.set(out.subarray(0, chunk.home.length)) }
  }
  // Within a generation the heap only grows outward (a mound piece is never lifted),
  // so once a search has failed every ring below r0, the only way a NEW fit appears
  // below r0 is beside the cells the last drop added — within one piece-extent of
  // r0 — or because this piece is SMALLER than the one that searched (a chip fits a
  // pocket a slab could not). Start at r0 minus the extent in the first case and at
  // the seed in the second. Scanning from the seed every time cost ~30 ms per lift
  // at a big mound: the band of rings across the heap's ragged frontier is as wide
  // as a piece, and every anchor in it walks its cells.
  const extent = Math.max(chunk.w, chunk.h)
  const startR = hint && extent >= hint.extent ? Math.max(0, hint.r - extent - 2) : 0
  // No ring beyond the heap's box plus one piece-extent can touch the heap; stop there
  // instead of scanning to the arena's edge on a failure.
  const reach = g.heapCount > 0
    ? Math.max(Math.abs(g.heapMinC - sc), Math.abs(g.heapMaxC - sc), Math.abs(g.heapMinR - sr), Math.abs(g.heapMaxR - sr)) + chunk.w + chunk.h + 2
    : maxR
  const lastR = Math.min(maxR, reach)
  if (startR === 0) { tryAt(0, 0); if (bestContact > 0) { if (hint) { hint.r = 0; hint.extent = extent }; return best.slice(0, chunk.home.length) } }
  for (let r = Math.max(1, startR); r <= lastR; r++) {
    for (let d = -r; d <= r; d++) {
      tryAt(d, -r); tryAt(d, r)
      if (d > -r && d < r) { tryAt(-r, d); tryAt(r, d) }
    }
    if (bestContact > 0) { if (hint) { hint.r = r; hint.extent = extent }; return best.slice(0, chunk.home.length) }
  }
  return null
}

/** 0 when the piece does not fit here; otherwise 1 + the number of heap cells it
 *  touches (so a bare seed touch scores 1 and a snug fit scores higher). */
function fits(g: Grid, chunk: Chunk, ac: number, ar: number, seed: number, out: Int32Array): number {
  const anyHeap = g.heapCount > 0
  // Cheap reject: a site that touches the heap must overlap the heap's bounding box
  // grown by one cell. Without this the open half of every ring — toward the picture,
  // nowhere near the heap — paid a full per-cell walk to learn it touched nothing.
  if (anyHeap && (ac > g.heapMaxC + 1 || ac + chunk.w - 1 < g.heapMinC - 1 || ar > g.heapMaxR + 1 || ar + chunk.h - 1 < g.heapMinR - 1)) return 0
  // Pass 1: does the piece even fit here? Most anchors near the frontier overlap the
  // heap and fail within a few cells; only the survivors pay for the neighbour walk.
  const n = chunk.local.length / 2
  for (let k = 0; k < n; k++) {
    const c = ac + chunk.local[k * 2], r = ar + chunk.local[k * 2 + 1]
    if (!inBounds(g, c, r)) return 0
    const i = cellIndex(g, c, r)
    if (g.occ[i] !== FREE || g.forbid[i] === 1) return 0
    out[k] = i
  }
  // Pass 2: contact with the heap (or the seed) and a place for the crew to stand.
  let contact = 0
  let standable = false
  let seedTouch = false
  for (let k = 0; k < n; k++) {
    const i = out[k]
    if (!anyHeap && i === seed) seedTouch = true
    const n = neighbors4(g, i, nb)
    for (let j = 0; j < n; j++) {
      const q = nb[j]
      if (anyHeap ? heapish(g.occ[q]) : q === seed) { contact++; if (!anyHeap) seedTouch = true }
      else if (walkable(g.occ[q]) && g.reach[q] === 1) standable = true
    }
  }
  if (!standable) return 0
  if (anyHeap ? contact === 0 : !seedTouch) return 0
  return 1 + contact
}

function growBox(g: Grid, cells: Int32Array): void {
  for (const i of cells) {
    const c = i % g.cols, r = (i - c) / g.cols
    if (c < g.heapMinC) g.heapMinC = c; if (c > g.heapMaxC) g.heapMaxC = c
    if (r < g.heapMinR) g.heapMinR = r; if (r > g.heapMaxR) g.heapMaxR = r
  }
}

/** Rebuild `heapCount` and the heap box from `occ` — for tests that paint MOUND cells
 *  directly rather than through `reserve`/`place`. */
export function recountHeap(g: Grid): void {
  g.heapCount = 0
  g.heapMinC = Infinity; g.heapMinR = Infinity; g.heapMaxC = -Infinity; g.heapMaxR = -Infinity
  for (let i = 0; i < g.occ.length; i++) {
    if (!heapish(g.occ[i])) continue
    g.heapCount++
    const c = i % g.cols, r = (i - c) / g.cols
    if (c < g.heapMinC) g.heapMinC = c; if (c > g.heapMaxC) g.heapMaxC = c
    if (r < g.heapMinR) g.heapMinR = r; if (r > g.heapMaxR) g.heapMaxR = r
  }
}

export function reserve(g: Grid, cells: Int32Array): void {
  for (const i of cells) g.occ[i] = RESERVED
  g.heapCount += cells.length
  growBox(g, cells)
}

export function unreserve(g: Grid, cells: Int32Array): void {
  for (const i of cells) g.occ[i] = FREE
  g.heapCount -= cells.length
}

/** Land a piece on its (reserved) site. */
export function place(g: Grid, chunk: Chunk, cells: Int32Array): void {
  let reservedBefore = 0
  for (const i of cells) { if (g.occ[i] === RESERVED) reservedBefore++; g.occ[i] = MOUND; g.owner[i] = chunk.id }
  g.heapCount += cells.length - reservedBefore
  growBox(g, cells)
  chunk.at = cells
  chunk.where = 'mound'
}

export function lift(g: Grid, chunk: Chunk): void {
  if (chunk.at) {
    if (chunk.where === 'mound') g.heapCount -= chunk.at.length
    for (const i of chunk.at) { g.occ[i] = FREE; g.owner[i] = -1 }
  }
  chunk.at = null
  chunk.where = 'lifted'
}

export function clearMound(g: Grid, chunks: Chunk[]): void {
  for (const c of chunks) if (c.where === 'mound' && c.at) { for (const i of c.at) { g.occ[i] = FREE; g.owner[i] = -1 }; c.at = null }
  g.heapCount = 0
  g.heapMinC = Infinity; g.heapMinR = Infinity; g.heapMaxC = -Infinity; g.heapMaxR = -Infinity
}
