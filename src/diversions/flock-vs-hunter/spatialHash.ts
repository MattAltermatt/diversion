// spatialHash.ts — uniform grid, intrusive linked list over preallocated typed
// arrays → ZERO per-frame allocation, deterministic ascending-index iteration.
// Toroidal: the 3×3 neighbour block wraps across world edges and distances use the
// minimum-image convention, so a flock never tears at the seams.
export class SpatialHash {
  private cols: number
  private rows: number
  private cellW: number // cell dimensions tile the world EXACTLY (≥ requested cell),
  private cellH: number // so cell-index wrap (mod cols/rows) matches world wrap (mod W/H)
  private w: number
  private h: number
  private head: Int32Array
  private next: Int32Array

  constructor(worldW: number, worldH: number, cellSize: number, maxN = 4096) {
    this.w = worldW
    this.h = worldH
    // floor → cells are ≥ cellSize and divide the world evenly (assumes cols,rows ≥ 3
    // for the toroidal 3×3 block not to revisit a cell — true for the fixed world here).
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
   *  If `alive` is given, dead boids are excluded (so queries only see live boids). */
  rebuild(px: Float32Array, py: Float32Array, n: number, alive?: Uint8Array): void {
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      if (alive && !alive[i]) continue
      const c = this.rowOf(py[i]) * this.cols + this.colOf(px[i])
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Append up to `cap` neighbour indices of boid `i` within `r` into `out` (caller
   *  clears it). Distances are minimum-image; the 3×3 cell block wraps toroidally. */
  neighborsWithin(
    px: Float32Array, py: Float32Array, i: number, r: number, cap: number,
    out: number[],
  ): void {
    const r2 = r * r, W = this.w, H = this.h
    const cx = this.colOf(px[i]), cy = this.rowOf(py[i])
    let count = 0
    for (let oy = -1; oy <= 1; oy++) {
      let gy = cy + oy
      if (gy < 0) gy += this.rows; else if (gy >= this.rows) gy -= this.rows
      for (let ox = -1; ox <= 1; ox++) {
        let gx = cx + ox
        if (gx < 0) gx += this.cols; else if (gx >= this.cols) gx -= this.cols
        let j = this.head[gy * this.cols + gx]
        while (j !== -1) {
          if (j !== i) {
            let dx = px[j] - px[i], dy = py[j] - py[i]
            dx -= W * Math.round(dx / W); dy -= H * Math.round(dy / H) // min-image
            if (dx * dx + dy * dy <= r2) { out.push(j); if (++count >= cap) return }
          }
          j = this.next[j]
        }
      }
    }
  }
}
