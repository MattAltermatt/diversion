// spatialHash.ts — uniform grid over a BOUNDED (non-toroidal) arena. Intrusive
// linked list over preallocated typed arrays → zero per-frame allocation and
// deterministic ascending-index iteration. Unlike flock-vs-hunter's toroidal hash,
// the arena has walls: the 3×3 neighbour block is CLAMPED to the grid (never wraps)
// and distances are plain euclidean — so a query near an edge never sees an agent on
// the opposite edge.
export class SpatialHash {
  private cols: number
  private rows: number
  private cellW: number
  private cellH: number
  private head: Int32Array
  private next: Int32Array

  constructor(worldW: number, worldH: number, cellSize: number, maxN = 8192) {
    this.cols = Math.max(1, Math.floor(worldW / cellSize))
    this.rows = Math.max(1, Math.floor(worldH / cellSize))
    this.cellW = worldW / this.cols
    this.cellH = worldH / this.rows
    this.head = new Int32Array(this.cols * this.rows)
    this.next = new Int32Array(maxN)
  }

  private colOf(x: number): number {
    let cx = Math.floor(x / this.cellW)
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1
    return cx
  }

  private rowOf(y: number): number {
    let cy = Math.floor(y / this.cellH)
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1
    return cy
  }

  /** Refill buckets by iterating 0..n in order → bucket chains are ascending-index.
   *  Dead agents (alive[i] === 0) are excluded so queries only see live agents. */
  rebuild(px: Float32Array, py: Float32Array, n: number, alive: Uint8Array): void {
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      const c = this.rowOf(py[i]) * this.cols + this.colOf(px[i])
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Append up to `cap` neighbour indices of agent `i` within `r` into `out` (caller
   *  clears it). The 3×3 cell block is clamped to the grid — no wrap — and distances
   *  are plain euclidean. Only appends indices whose faction passes `want` (or all
   *  factions when `want` is undefined). */
  neighborsWithin(
    px: Float32Array, py: Float32Array, i: number, r: number, cap: number,
    out: number[], faction?: Uint8Array, want?: number,
  ): void {
    const r2 = r * r
    const cx = this.colOf(px[i]), cy = this.rowOf(py[i])
    let count = 0
    const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < this.rows - 1 ? cy + 1 : this.rows - 1
    const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < this.cols - 1 ? cx + 1 : this.cols - 1
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        let j = this.head[gy * this.cols + gx]
        while (j !== -1) {
          if (j !== i && (want === undefined || faction![j] === want)) {
            const dx = px[j] - px[i], dy = py[j] - py[i]
            if (dx * dx + dy * dy <= r2) { out.push(j); if (++count >= cap) return }
          }
          j = this.next[j]
        }
      }
    }
  }

  /** Nearest agent to `i` within `r` whose faction is `want` (or any faction when
   *  `want` is undefined). Returns -1 if none. Clamped 3×3 block, euclidean. */
  nearestWithin(
    px: Float32Array, py: Float32Array, i: number, r: number,
    alive: Uint8Array, faction?: Uint8Array, want?: number,
  ): number {
    const r2 = r * r
    const cx = this.colOf(px[i]), cy = this.rowOf(py[i])
    let best = -1, bestD2 = r2
    const y0 = cy > 0 ? cy - 1 : 0, y1 = cy < this.rows - 1 ? cy + 1 : this.rows - 1
    const x0 = cx > 0 ? cx - 1 : 0, x1 = cx < this.cols - 1 ? cx + 1 : this.cols - 1
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        let j = this.head[gy * this.cols + gx]
        while (j !== -1) {
          if (j !== i && alive[j] && (want === undefined || faction![j] === want)) {
            const dx = px[j] - px[i], dy = py[j] - py[i]
            const d2 = dx * dx + dy * dy
            if (d2 <= bestD2) { bestD2 = d2; best = j }
          }
          j = this.next[j]
        }
      }
    }
    return best
  }
}
