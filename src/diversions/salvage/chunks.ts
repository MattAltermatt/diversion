import { type Grid, PICTURE, cellIndex, neighbors4 } from './grid'
import type { Chunk } from './state'

const nb = new Int32Array(4)

/** Cut the block picture into pieces: 4-connected regions of ONE palette index with
 *  at most `cap` blocks. Growth starts from the unassigned block with the fewest
 *  unassigned same-colour neighbours (a tip or corner) and BFS-grows to the cap —
 *  greedy, deterministic, compact. Void blocks (coverage 0) are skipped. Returns
 *  block-index lists; `expandChunks` turns them into cells. */
export function partitionBlocks(
  idx: Uint8Array, coverage: Uint8Array, bw: number, bh: number, cap: number,
): number[][] {
  const n = bw * bh
  const assigned = new Int32Array(n).fill(-1)
  const nbrs = (p: number, out: number[]) => {
    out.length = 0
    const c = p % bw, r = (p - c) / bw
    if (c > 0) out.push(p - 1)
    if (c < bw - 1) out.push(p + 1)
    if (r > 0) out.push(p - bw)
    if (r < bh - 1) out.push(p + bw)
  }
  const free = (p: number) => coverage[p] === 1 && assigned[p] === -1
  const pieces: number[][] = []
  const tmp: number[] = []
  const limit = Math.max(1, cap)
  for (;;) {
    let seed = -1, best = 5
    for (let p = 0; p < n; p++) {
      if (!free(p)) continue
      nbrs(p, tmp)
      let k = 0
      for (const q of tmp) if (free(q) && idx[q] === idx[p]) k++
      if (k < best) { best = k; seed = p; if (k === 0) break }
    }
    if (seed < 0) break
    const color = idx[seed]
    const cells = [seed]
    assigned[seed] = pieces.length
    for (let head = 0; head < cells.length && cells.length < limit; head++) {
      nbrs(cells[head], tmp)
      for (const q of tmp) {
        if (cells.length >= limit) break
        if (free(q) && idx[q] === color) { assigned[q] = pieces.length; cells.push(q) }
      }
    }
    pieces.push(cells)
  }
  return pieces
}

/** Expand block pieces into k×k grid cells at (originCol, originRow), placing them on
 *  the grid as PICTURE and recording each piece's bbox-relative shape for drawing. */
export function expandChunks(
  pieces: number[][], idx: Uint8Array, bw: number, k: number,
  originCol: number, originRow: number, g: Grid,
): Chunk[] {
  return pieces.map((blocks, id) => {
    const home = new Int32Array(blocks.length * k * k)
    let w = 0
    for (const b of blocks) {
      const bc = b % bw, br = (b - bc) / bw
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) {
        home[w++] = cellIndex(g, originCol + bc * k + dx, originRow + br * k + dy)
      }
    }
    let minC = Infinity, minR = Infinity, maxC = -Infinity, maxR = -Infinity
    for (const i of home) {
      const c = i % g.cols, r = (i - c) / g.cols
      if (c < minC) minC = c; if (c > maxC) maxC = c
      if (r < minR) minR = r; if (r > maxR) maxR = r
    }
    const local = new Int32Array(home.length * 2)
    home.forEach((i, j) => {
      const c = i % g.cols, r = (i - c) / g.cols
      local[j * 2] = c - minC; local[j * 2 + 1] = r - minR
      g.occ[i] = PICTURE; g.owner[i] = id
    })
    return { id, color: idx[blocks[0]], home, mass: blocks.length, where: 'picture', at: home,
             crew: null, local, w: maxC - minC + 1, h: maxR - minR + 1, retryAt: 0, exposed: false, exposedV: -1 }
  })
}

/** A piece is exposed when any of its cells touches a REACHABLE free cell. That single
 *  rule is the whole edge-only behaviour, and it holds from the inside too: a hole in
 *  an upload is free but unreachable, so nothing peels from within it. */
export function isExposed(g: Grid, chunk: Chunk): boolean {
  if (!chunk.at) return false
  for (const i of chunk.at) {
    const n = neighbors4(g, i, nb)
    for (let j = 0; j < n; j++) if (g.occ[nb[j]] === 0 && g.reach[nb[j]] === 1) return true
  }
  return false
}
