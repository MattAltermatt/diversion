// spatialHash.ts — uniform grid over preallocated typed arrays, zero per-frame
// allocation in the hot loop (`configure` only reallocates the bucket array when
// the cell size or wrap mode actually change, i.e. on a config edit, not every
// frame). When `wrap` is true the world is toroidal: cells tile the world EXACTLY
// (cellW = W / floor(W / cellSize)) so the 3×3 neighbor block's modular wrap
// matches the world's positional wrap 1:1 — get this wrong and a flock tears apart
// at the seams (a boid near one edge can't see boids near the opposite edge that
// are actually its closest neighbors). When `wrap` is false the grid clips at the
// border: out-of-range neighbor cells are skipped, no modular wrap, no wrapped
// distance — matching the 'steer' edge mode where positions never cross the edge.
export class SpatialHash {
  private w: number
  private h: number
  private next: Int32Array
  private cols = 0
  private rows = 0
  private cellW = 0
  private cellH = 0
  private cellSize = -1
  private wrap = false
  private head: Int32Array = new Int32Array(0)

  constructor(worldW: number, worldH: number, cellSize: number, wrap: boolean, maxN = 4096) {
    this.w = worldW
    this.h = worldH
    this.next = new Int32Array(maxN)
    this.configure(cellSize, wrap)
  }

  /** Rebuild grid geometry only if the cell size or wrap mode changed since the
   *  last call — cheap to call every frame (a live perception/edgeMode edit just
   *  takes effect on the next tick, no full diversion re-setup needed). */
  configure(cellSize: number, wrap: boolean): void {
    if (cellSize === this.cellSize && wrap === this.wrap) return
    this.cellSize = cellSize
    this.wrap = wrap
    this.cols = Math.max(3, Math.floor(this.w / cellSize))
    this.rows = Math.max(3, Math.floor(this.h / cellSize))
    this.cellW = this.w / this.cols
    this.cellH = this.h / this.rows
    this.head = new Int32Array(this.cols * this.rows)
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

  /** Refill buckets by iterating 0..n in order → bucket chains are ascending-index
   *  (deterministic iteration in `neighborsWithin`). */
  rebuild(px: Float32Array, py: Float32Array, n: number): void {
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      const c = this.rowOf(py[i]) * this.cols + this.colOf(px[i])
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Append up to `cap` neighbor indices of boid `i` within `r` into `out` (caller
   *  clears it). Requires `r <= cellSize` (true here: cellSize is always set to the
   *  live perception radius) so the 3×3 block is guaranteed to cover the full
   *  radius. Distances (and the 3×3 block itself) wrap toroidally iff `wrap`. */
  neighborsWithin(
    px: Float32Array, py: Float32Array, i: number, r: number, cap: number,
    out: number[],
  ): void {
    const r2 = r * r, W = this.w, H = this.h
    const cx = this.colOf(px[i]), cy = this.rowOf(py[i])
    let count = 0
    for (let oy = -1; oy <= 1; oy++) {
      let gy = cy + oy
      if (this.wrap) { if (gy < 0) gy += this.rows; else if (gy >= this.rows) gy -= this.rows }
      else if (gy < 0 || gy >= this.rows) continue
      for (let ox = -1; ox <= 1; ox++) {
        let gx = cx + ox
        if (this.wrap) { if (gx < 0) gx += this.cols; else if (gx >= this.cols) gx -= this.cols }
        else if (gx < 0 || gx >= this.cols) continue
        let j = this.head[gy * this.cols + gx]
        while (j !== -1) {
          if (j !== i) {
            let dx = px[j] - px[i], dy = py[j] - py[i]
            if (this.wrap) { dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H) }
            if (dx * dx + dy * dy <= r2) { out.push(j); if (++count >= cap) return }
          }
          j = this.next[j]
        }
      }
    }
  }
}
