import { resample, CURVE_POINTS, type Curve } from './curve'

/** Fine-grid cells per unit edge. The path walks this grid's edges. */
export const GRID_SUBDIV = 6
/**
 * How many grid rows the path may travel off the line, BEFORE amplitude.
 *
 * Half a lattice unit. That is the geometric tangency point — where a tile's
 * bottom edge bulging up would meet its top edge bulging down — but it is not a
 * hard limit, and `amplitude` (default 1.7, max 2.0) multiplies past it for
 * every scheme, so a grid edge reaches 0.85 lattice units at the shipped default.
 *
 * Overlap is not a tiling failure: the shared edges still match, so the tiling
 * stays gap-free; overlapping lobes are an interlock, which is what the owner
 * approved. Overlap is a RENDERING question, answered by the explicit nonzero
 * fill rule. Fixed rather than exposed as a knob, because a slider defaulting to
 * the tangency point with its top past it is a knob whose top half nobody chose.
 */
export const GRID_REACH = GRID_SUBDIV / 2

export type GridPoint = [number, number]

const key = (p: GridPoint, q: GridPoint): string =>
  p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])
    ? `${p[0]},${p[1]}|${q[0]},${q[1]}`
    : `${q[0]},${q[1]}|${p[0]},${p[1]}`

/**
 * Push the path around one fine-grid cell. Kaplan's Figure 2 shows three
 * distinct local moves (for a cell with 1, 2 or 3 of its edges on the path);
 * they are all one rule — replace the on-path arc of the cell's 4-cycle with the
 * other arc — provided the on-path edges are CONTIGUOUS along the path.
 *
 * Note the k=3 move replaces three edges with one and SHORTENS the path by two
 * grid units. That is correct and required, so never assert per-step monotone
 * growth anywhere.
 *
 * Returns null for any move that is illegal or would make the path non-simple.
 */
export function pushAround(path: GridPoint[], cell: GridPoint): GridPoint[] | null {
  const [a, b] = cell
  const c: GridPoint[] = [[a, b], [a + 1, b], [a + 1, b + 1], [a, b + 1]]
  const edges = new Set([key(c[0], c[1]), key(c[1], c[2]), key(c[2], c[3]), key(c[3], c[0])])
  const on: number[] = []
  for (let i = 0; i < path.length - 1; i++) if (edges.has(key(path[i], path[i + 1]))) on.push(i)
  if (!on.length || on.length > 3) return null
  for (let i = 1; i < on.length; i++) if (on[i] !== on[i - 1] + 1) return null

  const i0 = on[0]
  const i1 = on[on.length - 1]
  const k = on.length
  const S = path[i0]
  const E = path[i1 + 1]
  const idx = (p: GridPoint) => c.findIndex((q) => q[0] === p[0] && q[1] === p[1])
  const iS = idx(S)
  const iE = idx(E)
  if (iS < 0 || iE < 0) return null
  const forward = (iS + k) % 4 === iE
  const mid: GridPoint[] = []
  for (let n = 1; n < 4 - k; n++) mid.push(c[(iS + (forward ? 16 - n : n)) % 4])

  const next = path.slice(0, i0 + 1).concat(mid, path.slice(i1 + 1))
  const seen = new Set<string>()
  for (const p of next) {
    // x must stay on its own edge. Without this guard the path reaches x in
    // [-1, 7] against a 0..6 lattice on 3 of 4 seeds — a grid edge overshooting
    // its own tiling vertices ALONG the edge and spilling sideways into the
    // neighbouring cell. Gap-free still holds (both tiles use the same curve),
    // but tiles overlap for a reason nobody chose.
    if (p[0] < 0 || p[0] > GRID_SUBDIV) return null
    if (Math.abs(p[1]) > GRID_REACH) return null
    const kk = `${p[0]},${p[1]}`
    if (seen.has(kk)) return null // the path must stay simple
    seen.add(kk)
  }
  return next
}

/** The grid-space stages, before resampling. Exported so the legality invariants
 *  can be asserted on the real data rather than inferred from a resampled curve. */
export function gridPaths(steps: number, seed: number): GridPoint[][] {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)

  let path: GridPoint[] = []
  for (let i = 0; i <= GRID_SUBDIV; i++) path.push([i, 0])
  const stages: GridPoint[][] = [path]

  for (let step = 0; step < steps; step++) {
    let applied: GridPoint[] | null = null
    for (let attempt = 0; attempt < 90 && !applied; attempt++) {
      const at = Math.floor(rnd() * (path.length - 1))
      const p = path[at]
      const q = path[at + 1]
      const horiz = p[1] === q[1]
      const side = rnd() < 0.5 ? 0 : -1
      const cell: GridPoint = horiz
        ? [Math.min(p[0], q[0]), p[1] + side]
        : [p[0] + side, Math.min(p[1], q[1])]
      applied = pushAround(path, cell)
    }
    if (!applied) break
    path = applied
    stages.push(path)
  }
  return stages
}

/** Kaplan §3: an initially straight path on a fine square grid, evolved by a
 *  sequence of cell pushes. Rectilinear, mechanical — Greek keys and labyrinths. */
export function gridKeyframes(steps: number, seed: number): Curve[] {
  return gridPaths(steps, seed).map((p) =>
    resample(p.map((q) => [q[0] / GRID_SUBDIV, q[1] / GRID_SUBDIV]), CURVE_POINTS))
}
