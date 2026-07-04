import { mulberry32 } from '../../framework/rng'
import type { CelticConfig } from './schema'

// ─── Celtic knotwork geometry (pure, deterministic, unit-testable) ────────────
//
// A Celtic plait is built as a *billiard on a checkerboard of crossings*. Lattice
// nodes (i, j) with (i + j) even are the CROSSINGS; the odd nodes are the open
// holes of the weave. A band is a 45° ray that steps diagonally from crossing to
// crossing, reflecting off the border and off "breaks" (interior nodes flagged as
// a redirect). Because a 45° billiard in a box is time-reversible and periodic,
// every band closes into a loop, and the whole set of loops tiles the plait.
//
// KEY CORRECTNESS — the interlace. At every real crossing two strands cross (a
// "/" and a "\"). Which one passes OVER is a pure checkerboard function of the
// node: the "/" strand is over when i is even. Diagonally-adjacent crossings have
// opposite i-parity, so following any band the over/under flips at every crossing
// — a genuine, consistent Celtic interlace. This is asserted by the tests.

const SQRT2 = Math.SQRT2

export interface Pt {
  x: number
  y: number
}

export interface Band {
  /** Ordered crossing centres around the closed loop (pixel space). */
  pts: Pt[]
  /** Per point: true where the band turns (reflects) — round these corners. */
  turn: boolean[]
  /** Per point: `true`/`false` if this node is a real crossing and this band's
   *  strand is over/under there; `null` if the node is a turn / not a real X.
   *  Consecutive non-null entries MUST alternate (the interlace invariant). */
  over: (boolean | null)[]
  index: number
}

export interface XPass {
  /** Crossing centre (pixel space). */
  x: number
  y: number
  /** Unit pixel direction of the OVER strand (for the over-lift redraw). */
  ux: number
  uy: number
  i: number
  j: number
  /** true → the "/" (fwd) strand is over here; false → the "\" (back) strand. */
  overFwd: boolean
  /** Index of the band that owns the OVER strand (for rainbow tinting). */
  overBand: number
}

export interface KnotGeometry {
  cols: number
  rows: number
  spacing: number
  originX: number
  originY: number
  bands: Band[]
  xings: XPass[]
  centerX: number
  centerY: number
  maxRadius: number
  /** Half-length of an over-lift segment (reaches toward, but not into, the
   *  neighbouring crossings so it only breaks the strand it crosses). */
  liftReach: number
}

type Dir = readonly [number, number]
const DIRS: Dir[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

const stateKey = (i: number, j: number, dx: number, dy: number) =>
  `${i},${j},${dx},${dy}`

/** The "/" (fwd) strand is over when i is even → a checkerboard over/under. */
const overFwdAt = (i: number) => (i & 1) === 0

export function buildKnot(cfg: CelticConfig, w: number, h: number): KnotGeometry {
  // C and R are forced ODD and crossings live on the (i + j) ODD sublattice, so
  // all four grid corners are even nodes the billiard never visits — that avoids
  // the corner retroreflection (a 45° ray hitting an exact corner reverses and
  // retraces its whole path, doubling every strand into an ugly spike).
  const C = Math.max(5, cfg.gridSize | 1)
  const R = Math.max(5, Math.round(cfg.gridSize * (h / Math.max(1, w))) | 1)

  const usableW = w * 0.88
  const usableH = h * 0.88
  const spacing = Math.min(usableW / (C - 1), usableH / (R - 1))
  const gridW = (C - 1) * spacing
  const gridH = (R - 1) * spacing
  const originX = (w - gridW) / 2
  const originY = (h - gridH) / 2

  const px = (i: number, j: number): Pt => ({
    x: originX + i * spacing,
    y: originY + j * spacing,
  })

  // ── Breaks: interior even nodes flagged 'h' or 'v' (seeded) ────────────────
  const rng = mulberry32((cfg.seed >>> 0) ^ 0x9e3779b9)
  const breaks = new Map<number, 'h' | 'v'>()
  const nodeId = (i: number, j: number) => i * R + j
  for (let i = 1; i <= C - 2; i++) {
    for (let j = 1; j <= R - 2; j++) {
      if (((i + j) & 1) === 0) continue // crossings live on ODD nodes only
      if (rng() < cfg.wallDensity) {
        breaks.set(nodeId(i, j), rng() < 0.5 ? 'h' : 'v')
      }
    }
  }

  // Reflect an OUTGOING direction leaving node (i, j). Boundary reflects the
  // component that would leave the grid; a break flips a fixed component. Breaks
  // are interior-only, so break and boundary never fight over the same axis.
  const reflect = (i: number, j: number, dx: number, dy: number): [number, number] => {
    let ndx = dx
    let ndy = dy
    if (i + dx < 0 || i + dx >= C) ndx = -dx
    if (j + dy < 0 || j + dy >= R) ndy = -dy
    const b = breaks.get(nodeId(i, j))
    if (b === 'v') ndx = -ndx
    else if (b === 'h') ndy = -ndy
    return [ndx, ndy]
  }

  // ── Trace every closed band (billiard orbit) ───────────────────────────────
  const visited = new Set<string>()
  const bands: Band[] = []
  const overOwner = new Map<number, number>() // crossing nodeId → owning band index

  for (let i0 = 0; i0 < C; i0++) {
    for (let j0 = 0; j0 < R; j0++) {
      if (((i0 + j0) & 1) === 0) continue
      for (const [d0x, d0y] of DIRS) {
        // A start "state" is a REAL segment the ray travels: (node, travelDir)
        // with node+travelDir in-grid. Boundary-outward dirs are not segments —
        // skipping them keeps every enumerated state on a pure billiard cycle
        // (no tails), so the walk always returns to its start.
        if (i0 + d0x < 0 || i0 + d0x >= C || j0 + d0y < 0 || j0 + d0y >= R) continue
        if (visited.has(stateKey(i0, j0, d0x, d0y))) continue

        // Walk the closed loop. State = the segment leaving (ci,cj) in (cdx,cdy);
        // reflect at the ARRIVAL node to get the next segment's direction.
        const nodes: { i: number; j: number; ldx: number; ldy: number }[] = []
        let ci = i0
        let cj = j0
        let cdx = d0x
        let cdy = d0y
        do {
          visited.add(stateKey(ci, cj, cdx, cdy))
          // Mark the reverse segment so the loop is not re-traced backwards.
          visited.add(stateKey(ci + cdx, cj + cdy, -cdx, -cdy))
          nodes.push({ i: ci, j: cj, ldx: cdx, ldy: cdy })
          const ni = ci + cdx
          const nj = cj + cdy
          const [ndx, ndy] = reflect(ni, nj, cdx, cdy)
          ci = ni
          cj = nj
          cdx = ndx
          cdy = ndy
        } while (!(ci === i0 && cj === j0 && cdx === d0x && cdy === d0y))

        const n = nodes.length
        const pts: Pt[] = new Array(n)
        const turn: boolean[] = new Array(n)
        const over: (boolean | null)[] = new Array(n)
        const index = bands.length
        for (let k = 0; k < n; k++) {
          const nd = nodes[k]
          pts[k] = px(nd.i, nd.j)
          // Arrival direction at this node = previous node's leaving direction.
          const prev = nodes[(k - 1 + n) % n]
          turn[k] = prev.ldx !== nd.ldx || prev.ldy !== nd.ldy
          // Real crossing: interior even node with no break → both strands pass
          // straight through. (Turn nodes / borders / breaks are not real Xs.)
          const interior = nd.i >= 1 && nd.i <= C - 2 && nd.j >= 1 && nd.j <= R - 2
          const isX = interior && !breaks.has(nodeId(nd.i, nd.j))
          if (!isX) {
            over[k] = null
          } else {
            const bandFwd = nd.ldx === nd.ldy // this band's slope through the X
            const isOver = bandFwd === overFwdAt(nd.i)
            over[k] = isOver
            if (isOver) overOwner.set(nodeId(nd.i, nd.j), index)
          }
        }
        bands.push({ pts, turn, over, index })
      }
    }
  }

  // ── Real crossings (for the over/under lift pass) ──────────────────────────
  const xings: XPass[] = []
  for (let i = 1; i <= C - 2; i++) {
    for (let j = 1; j <= R - 2; j++) {
      if (((i + j) & 1) === 0) continue
      if (breaks.has(nodeId(i, j))) continue
      const p = px(i, j)
      const fwd = overFwdAt(i)
      // fwd "/" pixel dir = (1, 1); back "\" pixel dir = (1, -1). (y is screen-down.)
      const ux = (1 / SQRT2) * 1
      const uy = (1 / SQRT2) * (fwd ? 1 : -1)
      xings.push({ x: p.x, y: p.y, ux, uy, i, j, overFwd: fwd, overBand: overOwner.get(nodeId(i, j)) ?? -1 })
    }
  }

  const centerX = originX + gridW / 2
  const centerY = originY + gridH / 2
  const maxRadius = Math.hypot(w, h) / 2 + spacing

  return {
    cols: C,
    rows: R,
    spacing,
    originX,
    originY,
    bands,
    xings,
    centerX,
    centerY,
    maxRadius,
    liftReach: spacing * SQRT2 * 0.62,
  }
}
