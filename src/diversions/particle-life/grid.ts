// grid.ts — uniform spatial grid for O(n) pairwise neighbour queries. Intrusive
// linked list over preallocated typed arrays → ZERO per-frame allocation. Toroidal:
// the 3×3 cell block wraps across world edges and deltas use the minimum-image
// convention. Purpose-built for Particle Life (diversions never import each other):
// a query returns, in parallel reused buffers, each neighbour's index AND its
// min-image (dx, dy) so the force loop needs no recompute.
//
// Modelled on flock-vs-hunter/spatialHash.ts. Assumes cols,rows ≥ 3 (true here:
// world is 1280×800 and cell = rMax ≤ 160 → cols ≥ 8, rows ≥ 5), so the 3×3 block
// never revisits a cell and r ≤ rMax < min(W,H)/2 keeps min-image unambiguous.

/** Minimum-image delta: map `d` into (-size/2, size/2]. */
export function wrapDelta(d: number, size: number): number {
  const half = size * 0.5
  if (d > half) return d - size
  if (d < -half) return d + size
  return d
}

export class ParticleGrid {
  readonly cols: number
  readonly rows: number
  readonly cellW: number // cells tile the world exactly (≥ requested cell)
  readonly cellH: number
  private readonly w: number
  private readonly h: number
  private readonly head: Int32Array
  private readonly next: Int32Array

  // query outputs (reused; sized to maxN so a query is never truncated)
  readonly outIdx: Int32Array
  readonly outDX: Float32Array
  readonly outDY: Float32Array

  constructor(worldW: number, worldH: number, cell: number, maxN: number) {
    this.w = worldW
    this.h = worldH
    this.cols = Math.max(1, Math.floor(worldW / cell))
    this.rows = Math.max(1, Math.floor(worldH / cell))
    this.cellW = worldW / this.cols
    this.cellH = worldH / this.rows
    this.head = new Int32Array(this.cols * this.rows)
    this.next = new Int32Array(maxN)
    this.outIdx = new Int32Array(maxN)
    this.outDX = new Float32Array(maxN)
    this.outDY = new Float32Array(maxN)
  }

  private colOf(x: number): number {
    let c = Math.floor(x / this.cellW)
    if (c < 0) c = 0; else if (c >= this.cols) c = this.cols - 1
    return c
  }

  private rowOf(y: number): number {
    let r = Math.floor(y / this.cellH)
    if (r < 0) r = 0; else if (r >= this.rows) r = this.rows - 1
    return r
  }

  /** Rebuild buckets from the live positions (call once per step before querying). */
  rebuild(px: Float32Array, py: Float32Array, n: number): void {
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      const c = this.rowOf(py[i]) * this.cols + this.colOf(px[i])
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Fill outIdx/outDX/outDY with every neighbour j ≠ i whose min-image distance to
   *  i is in (0, r]. dx,dy point from i toward j. Returns the neighbour count. */
  neighborsWithin(px: Float32Array, py: Float32Array, i: number, r: number): number {
    const r2 = r * r, W = this.w, H = this.h, cols = this.cols, rows = this.rows
    const cx = this.colOf(px[i]), cy = this.rowOf(py[i])
    const xi = px[i], yi = py[i]
    let cnt = 0
    for (let dy = -1; dy <= 1; dy++) {
      const ccy = (cy + dy + rows) % rows
      for (let dx = -1; dx <= 1; dx++) {
        const ccx = (cx + dx + cols) % cols
        let j = this.head[ccy * cols + ccx]
        while (j >= 0) {
          if (j !== i) {
            const ddx = wrapDelta(px[j] - xi, W)
            const ddy = wrapDelta(py[j] - yi, H)
            const d2 = ddx * ddx + ddy * ddy
            if (d2 > 0 && d2 <= r2) {
              this.outIdx[cnt] = j
              this.outDX[cnt] = ddx
              this.outDY[cnt] = ddy
              cnt++
            }
          }
          j = this.next[j]
        }
      }
    }
    return cnt
  }
}
