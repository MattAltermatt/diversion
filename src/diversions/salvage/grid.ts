export const FREE = 0
export const PICTURE = 1
export const MOUND = 2
export const RESERVED = 3

export interface Grid {
  cols: number
  rows: number
  /** FREE / PICTURE / MOUND / RESERVED per cell. Drones walk everything but PICTURE. */
  occ: Uint8Array
  /** Chunk id occupying the cell, or -1. */
  owner: Int32Array
  /** 1 where a drop site may never land: the picture's box + margin, the arena border. */
  forbid: Uint8Array
  /** 1 where a FREE cell is connected to the arena border. Recomputed by `floodReach`. */
  reach: Uint8Array
  /** MOUND + RESERVED cells, so "is there a heap yet" is O(1). */
  heapCount: number
  /** Bounding box of the heap (MOUND + RESERVED), grown on reserve/place, reset when
   *  the mound clears. A drop site must touch the heap, so anything outside this box
   *  plus one cell can be rejected without walking its cells. */
  heapMinC: number
  heapMinR: number
  heapMaxC: number
  heapMaxR: number
}

export function makeGrid(cols: number, rows: number): Grid {
  const n = cols * rows
  return { cols, rows, occ: new Uint8Array(n), owner: new Int32Array(n).fill(-1),
           forbid: new Uint8Array(n), reach: new Uint8Array(n), heapCount: 0,
           heapMinC: Infinity, heapMinR: Infinity, heapMaxC: -Infinity, heapMaxR: -Infinity }
}

/** Drones walk FREE cells, the MOUND (a dropped piece is a floor, not a wall — the user
 *  watched drones get stuck against the heap) AND a RESERVED site (empty floor until the
 *  piece is lowered onto it). Only the PICTURE blocks the way. Reserved sites used to
 *  block too, and with several crews in flight their sites walled off pockets of mound
 *  cells: a carrier disbanded into one had no reachable target and its wander bounced
 *  between the reserved cells at full speed until those pieces landed — drones "dancing
 *  in place" on the heap for up to half a minute (2026-09-02). A drone standing where a
 *  piece lands is already handled: the cell becomes MOUND, which is floor too. */
export function walkable(occ: number): boolean {
  return occ !== PICTURE
}

export function inBounds(g: Grid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < g.cols && row < g.rows
}

export function cellIndex(g: Grid, col: number, row: number): number {
  return row * g.cols + col
}

/** Writes the in-bounds 4-neighbours of `i` into `out`; returns how many. */
export function neighbors4(g: Grid, i: number, out: Int32Array): number {
  const col = i % g.cols, row = (i - col) / g.cols
  let n = 0
  if (col > 0) out[n++] = i - 1
  if (col < g.cols - 1) out[n++] = i + 1
  if (row > 0) out[n++] = i - g.cols
  if (row < g.rows - 1) out[n++] = i + g.cols
  return n
}

const nb = new Int32Array(4)

/** Mark every WALKABLE cell connected to the arena border. The border is kept free by
 *  the forbidden mask, so "reachable" means "a drone that started outside can get
 *  here". A hole inside an uploaded picture is FREE but not reachable: nothing spawns
 *  there and the pieces lining it are not exposed. Returns the reachable count. */
export function floodReach(g: Grid, queue: Int32Array = new Int32Array(g.cols * g.rows)): number {
  g.reach.fill(0)
  let head = 0, tail = 0
  const push = (i: number) => { if (walkable(g.occ[i]) && g.reach[i] === 0) { g.reach[i] = 1; queue[tail++] = i } }
  for (let c = 0; c < g.cols; c++) { push(cellIndex(g, c, 0)); push(cellIndex(g, c, g.rows - 1)) }
  for (let r = 0; r < g.rows; r++) { push(cellIndex(g, 0, r)); push(cellIndex(g, g.cols - 1, r)) }
  while (head < tail) {
    const i = queue[head++]
    const k = neighbors4(g, i, nb)
    for (let j = 0; j < k; j++) push(nb[j])
  }
  return tail
}

export function isFreeReachable(g: Grid, i: number): boolean {
  return g.occ[i] === FREE && g.reach[i] === 1
}
