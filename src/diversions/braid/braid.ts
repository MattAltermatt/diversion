import { mulberry32 } from '../../framework/rng'
import type { BraidConfig } from './schema'

// ─── The braid group, bent into a ring ───────────────────────────────────────
//
// N strands occupy N radial "lanes" across an annulus. Marching around the ring
// (the angular axis) we apply a repeating braid WORD: a sequence of columns, each
// column a set of parallel adjacent-lane swaps (braid-group generators σ_k). We
// alternate the classic odd/even plait —
//   even columns swap lanes (0,1),(2,3),(4,5)…
//   odd  columns swap lanes (1,2),(3,4),(5,6)…
// — the standard maypole/hair plait. `period(N)` is how many columns bring the
// strands back to their starting lanes (the permutation returns to identity); the
// ring is `twist` periods long, so it always closes seamlessly into coloured loops.
//
// Over/under is a plain-weave checkerboard: at a crossing in column c on lanes
// (k,k+1) the OVER strand is the outer lane iff (c + k + parity) is even. `parity`
// (seeded) flips the whole weave. This is globally consistent — the interlace reads
// as a true woven surface — and alternates column-to-column so no strand is buried.

export interface Crossing {
  col: number // which column (angular step) the crossing sits in
  lowLane: number // lower of the two swapped lanes (k); the pair is (k, k+1)
  overLane: number // the lane (before the swap) whose strand passes OVER
  overStrand: number // strand index that passes over
  centerIdx: number // index into the over strand's point array at the crossing centre
}

export interface StrandPath {
  index: number
  color: string
  /** Closed polyline in POLAR form (rotation-free): angle + radius per sample.
   *  The renderer applies the animated rotation and projects to screen space. */
  pts: { ang: number; rad: number }[]
}

export interface Braid {
  n: number
  period: number
  M: number // total columns around the ring (= period * twist)
  subSteps: number // samples per column
  total: number // points per strand (= M * subSteps)
  parity: number // 0 | 1 — seeded global over/under flip
  phase0: number // seeded starting angle (radians)
  baseHue: number // seeded palette base hue (degrees)
  cx: number
  cy: number
  meanR: number
  laneSpacing: number
  strandWidth: number
  glow: number
  background: string
  /** laneSeq[strand][col] — the lane a strand occupies at each column boundary
   *  (0..M). Column 0 == column M (the ring is closed). */
  laneSeq: number[][]
  strands: StrandPath[]
  crossings: Crossing[]
}

/** Number of columns after which the alternating odd/even plait returns every
 *  strand to its starting lane (the braid word composes to the identity). */
export function computePeriod(n: number): number {
  if (n < 2) return 2
  const atLane = Array.from({ length: n }, (_, i) => i)
  const applyColumn = (c: number) => {
    const start = c % 2 === 0 ? 0 : 1
    for (let k = start; k + 1 < n; k += 2) {
      const t = atLane[k]
      atLane[k] = atLane[k + 1]
      atLane[k + 1] = t
    }
  }
  const cap = 4 * n * n
  for (let c = 1; c <= cap; c++) {
    applyColumn(c - 1)
    if (c % 2 === 0 && atLane.every((v, i) => v === i)) return c
  }
  return 2 * n // unreachable for the alternating plait, but keep it total
}

function strandColor(mode: BraidConfig['colorMode'], index: number, n: number, baseHue: number): string {
  const hue = mode === 'rainbow'
    ? (index / n) * 360
    : (baseHue + index * 137.508) % 360 // golden-angle spacing → harmonious jewel set
  return `hsl(${hue.toFixed(1)}, 72%, 60%)`
}

/** Build the braid deterministically from config + canvas size. Pure — no canvas,
 *  no global RNG, rotation-free (the animated spin is applied at render time). */
export function buildBraid(cfg: BraidConfig, w: number, h: number): Braid {
  const rng = mulberry32(cfg.seed >>> 0)
  // Fixed draw order for stable seeding: parity, phase, hue.
  const parity = Math.floor(rng() * 2)
  const phase0 = rng() * Math.PI * 2
  const baseHue = rng() * 360

  const n = cfg.strandCount
  const period = computePeriod(n)
  const M = period * cfg.twist
  const S = 8
  const total = M * S

  // ── Weave the braid word: track each strand's lane column-by-column ─────────
  const atLane = Array.from({ length: n }, (_, i) => i) // atLane[lane] = strand
  const laneOfStrand = Array.from({ length: n }, (_, i) => i)
  const laneSeq: number[][] = Array.from({ length: n }, () => [] as number[])
  const crossings: Crossing[] = []

  for (let c = 0; c <= M; c++) {
    for (let s = 0; s < n; s++) laneSeq[s].push(laneOfStrand[s])
    if (c === M) break
    const start = c % 2 === 0 ? 0 : 1
    for (let k = start; k + 1 < n; k += 2) {
      const sa = atLane[k] // strand at lower lane
      const sb = atLane[k + 1] // strand at upper lane
      // Key the over/under on lane parity: even columns swap even-start lanes and
      // odd columns swap odd-start lanes, so lane parity flips column-to-column —
      // giving the alternating σ σ⁻¹ weave (a strand goes over, then under, …).
      // `parity` (seeded) flips the whole interlace.
      const overLane = (k + parity) % 2 === 0 ? k + 1 : k
      const overStrand = overLane === k ? sa : sb
      crossings.push({ col: c, lowLane: k, overLane, overStrand, centerIdx: c * S + (S >> 1) })
      // swap the two strands' lanes
      atLane[k] = sb
      atLane[k + 1] = sa
      laneOfStrand[sa] = k + 1
      laneOfStrand[sb] = k
    }
  }

  // ── Geometry: fit the annulus on-screen ────────────────────────────────────
  const Rmax = Math.min(w, h) / 2
  const usableR = Rmax * 0.9
  const meanR = cfg.braidRadius * usableR
  const head = cfg.strandWidth * 0.6 + 6 // keep the outer/inner strand off the edge/centre
  const maxHalf = Math.max(2, Math.min(meanR - head, usableR - meanR))
  const laneSpacing = n > 1 ? Math.min(cfg.strandWidth * 1.4, (2 * maxHalf) / (n - 1)) : 0
  const laneOffset = (lane: number) => (lane - (n - 1) / 2) * laneSpacing

  // ── Sample each strand into a closed polar polyline ────────────────────────
  const strands: StrandPath[] = []
  for (let s = 0; s < n; s++) {
    const pts: { ang: number; rad: number }[] = new Array(total)
    for (let g = 0; g < total; g++) {
      const c = Math.floor(g / S)
      const f = (g - c * S) / S
      const sm = f * f * (3 - 2 * f) // smoothstep → glossy S-curve through crossings
      const lane = laneSeq[s][c] + (laneSeq[s][c + 1] - laneSeq[s][c]) * sm
      pts[g] = { ang: phase0 + (Math.PI * 2 * g) / total, rad: meanR + laneOffset(lane) }
    }
    strands.push({ index: s, color: strandColor(cfg.colorMode, s, n, baseHue), pts })
  }

  return {
    n, period, M, subSteps: S, total, parity, phase0, baseHue,
    cx: w / 2, cy: h / 2, meanR, laneSpacing, strandWidth: cfg.strandWidth,
    glow: cfg.glow, background: cfg.background, laneSeq, strands, crossings,
  }
}
