import { resample, CURVE_POINTS, type Curve } from './curve'

/** Each rule is a polyline from (0,0) to (1,0) that replaces a single segment. */
export const IFS_RULES: { name: string; rule: number[][] }[] = [
  {
    name: 'Puzzle bump',
    rule: [[0, 0], [0.25, 0], [0.25, 0.25], [0.5, 0.25], [0.5, -0.25], [0.75, -0.25], [0.75, 0], [1, 0]],
  },
  { name: 'Koch step', rule: [[0, 0], [1 / 3, 0], [0.5, 0.2887], [2 / 3, 0], [1, 0]] },
  { name: 'Zigzag', rule: [[0, 0], [0.2, 0.18], [0.4, -0.12], [0.6, 0.12], [0.8, -0.18], [1, 0]] },
  { name: 'Terrace', rule: [[0, 0], [0.3, 0], [0.3, 0.22], [0.7, 0.22], [0.7, 0], [1, 0]] },
]

/**
 * The deepest generation whose vertex count still fits in CURVE_POINTS.
 *
 * Generation g of an s-segment rule has s^g + 1 vertices, so 'Puzzle bump'
 * (s = 7) runs 2, 8, 50, 344, 2402, 16808. Resampling any of those to 160 points
 * cuts chords straight across the detail the generation just added — the exact
 * failure curve.ts's CURVE_POINTS comment warns about, and what a hard-coded
 * generation count for every rule walked into.
 */
export function maxGenerations(rule: number[][]): number {
  const segs = rule.length - 1
  let g = 1
  while (Math.pow(segs, g + 1) + 1 <= CURVE_POINTS) g++
  return g
}

/**
 * Kaplan §4: replace every segment with a similarity-transformed copy of the
 * whole rule. Generations are the keyframes, spaced evenly over t — Kaplan notes
 * that stepping between generations discretely is far too abrupt to be pleasing,
 * so the LUT interpolates between adjacent ones.
 */
export function ifsKeyframes(rule: number[][], gens: number): Curve[] {
  const out: Curve[] = [resample([[0, 0], [1, 0]], CURVE_POINTS)]
  let cur: number[][] = [[0, 0], [1, 0]]
  for (let g = 0; g < gens; g++) {
    const next: number[][] = [cur[0]]
    for (let i = 0; i < cur.length - 1; i++) {
      const A = cur[i]
      const B = cur[i + 1]
      const dx = B[0] - A[0]
      const dy = B[1] - A[1]
      for (let r = 1; r < rule.length; r++) {
        const u = rule[r][0]
        const v = rule[r][1]
        next.push([A[0] + u * dx - v * dy, A[1] + u * dy + v * dx])
      }
    }
    cur = next
    out.push(resample(cur, CURVE_POINTS))
  }
  return out
}
