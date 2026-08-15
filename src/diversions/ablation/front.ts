import type { Field } from './field'

// The erosion front: for each lane, where the outermost surviving cell sits.
//
// A turret may only ever strike the OUTERMOST survivor along its beam (spec §1).
// With axis-aligned beams that reduces to four integer arrays instead of a
// ray-march, which is what makes small cell sizes viable rather than aspirational.
//
// The arrays are LAZY CACHES, not authoritative state. A cell can be killed by a
// turret on any edge, so an edge's cached index goes stale without that edge
// knowing. `frontCell` walks forward past dead cells and rewrites its cache; each
// cell is skipped at most once per direction, so the amortised cost stays O(1)
// and `killCell` stays trivial.

export const EDGE = { top: 0, right: 1, bottom: 2, left: 3 } as const
export type Edge = (typeof EDGE)[keyof typeof EDGE]

export interface Front {
  /** per column: topmost alive row (=== rows when the lane is empty) */
  top: Int32Array
  /** per column: bottommost alive row (=== -1 when the lane is empty) */
  bottom: Int32Array
  /** per row: leftmost alive col (=== cols when the lane is empty) */
  left: Int32Array
  /** per row: rightmost alive col (=== -1 when the lane is empty) */
  right: Int32Array
}

export function buildFront(f: Field): Front {
  return {
    top: new Int32Array(f.cols),
    bottom: new Int32Array(f.cols).fill(f.rows - 1),
    left: new Int32Array(f.rows),
    right: new Int32Array(f.rows).fill(f.cols - 1),
  }
}

/** Marks a cell dead. Fronts are lazy caches, so they need no update here. */
export function killCell(f: Field, cell: number): void {
  if (cell < 0 || f.alive[cell] === 0) return
  f.alive[cell] = 0
  f.aliveCount--
}

/** Lane = column for top/bottom, row for left/right. Returns the cell index of
 *  that lane's outermost survivor, or -1 if the lane is empty. */
export function frontCell(f: Field, fr: Front, edge: Edge, lane: number): number {
  const { cols, rows, alive } = f
  if (edge === EDGE.top) {
    let row = fr.top[lane]
    while (row < rows && alive[row * cols + lane] === 0) row++
    fr.top[lane] = row
    return row < rows ? row * cols + lane : -1
  }
  if (edge === EDGE.bottom) {
    let row = fr.bottom[lane]
    while (row >= 0 && alive[row * cols + lane] === 0) row--
    fr.bottom[lane] = row
    return row >= 0 ? row * cols + lane : -1
  }
  if (edge === EDGE.left) {
    let col = fr.left[lane]
    while (col < cols && alive[lane * cols + col] === 0) col++
    fr.left[lane] = col
    return col < cols ? lane * cols + col : -1
  }
  let col = fr.right[lane]
  while (col >= 0 && alive[lane * cols + col] === 0) col--
  fr.right[lane] = col
  return col >= 0 ? lane * cols + col : -1
}

/** Counts the palette index of every lane's outermost survivor across all four
 *  edges. This — not the whole picture — is what the scheduler samples (spec §5),
 *  which is what makes deadlock structurally impossible: there is always
 *  something exposed, so there is always a valid target. */
export function exposedHistogram(f: Field, fr: Front, out: Uint32Array): Uint32Array {
  out.fill(0)
  for (let col = 0; col < f.cols; col++) {
    const t = frontCell(f, fr, EDGE.top, col)
    if (t >= 0) out[f.idx[t]]++
    const b = frontCell(f, fr, EDGE.bottom, col)
    if (b >= 0) out[f.idx[b]]++
  }
  for (let row = 0; row < f.rows; row++) {
    const l = frontCell(f, fr, EDGE.left, row)
    if (l >= 0) out[f.idx[l]]++
    const r = frontCell(f, fr, EDGE.right, row)
    if (r >= 0) out[f.idx[r]]++
  }
  return out
}
