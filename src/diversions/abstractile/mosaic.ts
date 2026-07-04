import { mulberry32 } from '../../framework/rng'
import type { AbstractileConfig } from './schema'

// ── The mosaic model (pure, DOM-free so it unit-tests) ────────────────────────
//
// A grid of cells. Each cell draws one geometric TILE (a shape family) in a D4
// orientation, in two palette colours. Cells are generated over a small
// FUNDAMENTAL DOMAIN and the full grid is filled by applying a SYMMETRY (a D4
// transform per cell) so the whole thing reads as an ornate symmetric tessellation.
//
// Orientation is a 2x2 integer matrix from the dihedral group D4 (the 8
// rotations/reflections of a square). Composing symmetry with a cell's own
// orientation is just matrix multiply — which keeps the mirror/rotate maths
// exact and testable.

export interface Mat { a: number; b: number; c: number; d: number }

export const ID: Mat = { a: 1, b: 0, c: 0, d: 1 }
export const FLIPH: Mat = { a: -1, b: 0, c: 0, d: 1 } // x -> -x  (mirror across vertical axis)
export const FLIPV: Mat = { a: 1, b: 0, c: 0, d: -1 } // y -> -y  (mirror across horizontal axis)
export const ROT180: Mat = { a: -1, b: 0, c: 0, d: -1 }

// Canvas convention: x' = a*x + c*y, y' = b*x + d*y. matMul(P, Q) applies Q then P.
export function matMul(P: Mat, Q: Mat): Mat {
  return {
    a: P.a * Q.a + P.c * Q.b,
    b: P.b * Q.a + P.d * Q.b,
    c: P.a * Q.c + P.c * Q.d,
    d: P.b * Q.c + P.d * Q.d,
  }
}

export function matEq(P: Mat, Q: Mat): boolean {
  return P.a === Q.a && P.b === Q.b && P.c === Q.c && P.d === Q.d
}

// The four rotations (CCW) as D4 matrices.
const ROTS: Mat[] = [
  { a: 1, b: 0, c: 0, d: 1 },   // 0°
  { a: 0, b: 1, c: -1, d: 0 },  // 90°
  { a: -1, b: 0, c: 0, d: -1 }, // 180°
  { a: 0, b: -1, c: 1, d: 0 },  // 270°
]

const FAMILY_OF: Record<string, number> = { Triangles: 0, Arcs: 1, Quarters: 2, Diamonds: 3, Bars: 4 }
const N_FAMILIES = 5

/** Per-cell PRNG keyed on the fundamental-domain coordinate, so a cell's tile is
 *  a pure function of (fi, fj, seed) — independent of grid size, which keeps the
 *  mosaic stable across resizes. */
function cellRng(fi: number, fj: number, seed: number): () => number {
  let h = (seed ^ 0x9e3779b9) | 0
  h = Math.imul(h ^ (fi | 0), 0x85ebca6b)
  h = Math.imul(h ^ (fj | 0), 0xc2b2ae35)
  h ^= h >>> 13
  return mulberry32(h >>> 0)
}

export interface BaseCell {
  family: number // 0..4
  ca: number     // palette index (figure)
  cb: number     // palette index (ground), or -1 for open background
  mat: Mat       // intrinsic orientation
}

/** The tile a fundamental cell holds, before the symmetry transform. */
function baseCell(fi: number, fj: number, m: Mosaic): BaseCell {
  const rng = cellRng(fi, fj, m.seed)
  const fr = rng()
  const family = m.fixedFamily >= 0 ? m.fixedFamily : Math.min(N_FAMILIES - 1, (fr * N_FAMILIES) | 0)
  const orient0 = (rng() * 4) & 3
  const flip0 = rng() < 0.5
  const n = m.n
  const ca = Math.min(n - 1, (rng() * n) | 0)
  let cb = Math.min(n - 1, (rng() * n) | 0)
  if (cb === ca) cb = (cb + 1) % n
  const neg = rng() < 0.35
  // Triangles always fill both regions; the figure/ground families may leave the
  // ground open so the flowing background reads as part of the pattern.
  const cbFinal = neg && family !== 0 ? -1 : cb
  const mat = matMul(ROTS[orient0], flip0 ? FLIPH : ID)
  return { family, ca, cb: cbFinal, mat }
}

export interface ResolvedTile {
  fi: number
  fj: number
  family: number
  ca: number
  cb: number
  mat: Mat // orientation actually drawn (base orientation ∘ symmetry op)
}

// Map a full-grid cell to its fundamental cell + the symmetry op that carries the
// fundamental tile onto it.
function fold(m: Mosaic, i: number, j: number): { fi: number; fj: number; op: Mat } {
  const { cols, rows, symmetry } = m
  if (symmetry === 'Translate') {
    const p = m.period
    return { fi: i % p, fj: j % p, op: ID }
  }
  if (symmetry === 'Rotate') {
    const pi = cols - 1 - i
    const pj = rows - 1 - j
    // rep = lexicographically-smaller of (j,i) and its 180° partner
    const isRep = pj > j || (pj === j && pi >= i)
    if (isRep) return { fi: i, fj: j, op: ID }
    return { fi: pi, fj: pj, op: ROT180 }
  }
  // Mirror: fold into the top-left quadrant across both centre lines.
  const fi = Math.min(i, cols - 1 - i)
  const fj = Math.min(j, rows - 1 - j)
  const fx = i !== fi // this cell is the horizontally-mirrored copy
  const fy = j !== fj
  const op = matMul(fy ? FLIPV : ID, fx ? FLIPH : ID)
  return { fi, fj, op }
}

/** The fully-resolved tile drawn at grid cell (i, j). Pure — the render + tests
 *  both go through this so what's tested is what's drawn. */
export function resolveTile(m: Mosaic, i: number, j: number): ResolvedTile {
  const { fi, fj, op } = fold(m, i, j)
  const base = baseCell(fi, fj, m)
  return { fi, fj, family: base.family, ca: base.ca, cb: base.cb, mat: matMul(op, base.mat) }
}

// ── Layout: grid geometry + the ordered lay-down / dissolve sequences ──────────

export interface DrawTile {
  cx: number // top-left pixel of the cell (CSS px)
  cy: number
  family: number
  ca: number
  cb: number
  mat: Mat
}

export interface FundGroup {
  order: number // sort key (distance from centre)
  draws: DrawTile[] // one entry per symmetry copy — laid / cleared together
}

export interface Mosaic {
  cfg: AbstractileConfig
  cols: number
  rows: number
  cell: number // CSS px per cell (square)
  offX: number // centring offset (<= 0; the grid overflows to bleed off-screen)
  offY: number
  seed: number
  n: number // palette length
  fixedFamily: number // 0..4, or -1 for Mixed
  symmetry: string
  period: number // Translate wallpaper period (cells)
  layOrder: FundGroup[]
  dissolveOrder: number[] // indices into layOrder, shuffled
}

/** Square cells sized so `gridSize` fit across the longer edge; the grid is
 *  centred and slightly overflows so it bleeds to the canvas edges. */
export function gridDims(width: number, height: number, gridSize: number) {
  const cell = Math.max(width, height) / gridSize
  const cols = Math.max(1, Math.ceil(width / cell))
  const rows = Math.max(1, Math.ceil(height / cell))
  const offX = (width - cols * cell) / 2
  const offY = (height - rows * cell) / 2
  return { cols, rows, cell, offX, offY }
}

export function buildMosaic(cfg: AbstractileConfig, width: number, height: number): Mosaic {
  const { cols, rows, cell, offX, offY } = gridDims(width, height, cfg.gridSize)
  const fixedFamily = cfg.tileSet === 'Mixed' ? -1 : FAMILY_OF[cfg.tileSet]
  // Deterministic wallpaper period (3..6) from the seed.
  const period = 3 + ((mulberry32(cfg.seed ^ 0x1234) () * 4) | 0)

  const m: Mosaic = {
    cfg, cols, rows, cell, offX, offY,
    seed: cfg.seed, n: cfg.palette.length, fixedFamily,
    symmetry: cfg.symmetry, period,
    layOrder: [], dissolveOrder: [],
  }

  // Enumerate the fundamental cells and, for each, the full-grid copies it drives.
  const cx0 = width / 2
  const cy0 = height / 2
  const seen = new Set<number>()
  const groups: FundGroup[] = []
  const addGroup = (fi: number, fj: number, copies: { i: number; j: number; op: Mat }[]) => {
    const base = baseCell(fi, fj, m)
    const draws: DrawTile[] = copies.map(({ i, j, op }) => ({
      cx: offX + i * cell,
      cy: offY + j * cell,
      family: base.family,
      ca: base.ca,
      cb: base.cb,
      mat: matMul(op, base.mat),
    }))
    // Order key: distance of the representative cell from canvas centre, with a
    // small deterministic jitter so the outward sweep pops organically.
    const rep = copies[0]
    const px = offX + (rep.i + 0.5) * cell
    const py = offY + (rep.j + 0.5) * cell
    const jitter = cellRng(fi, fj, m.seed ^ 0x55) () * cell * 1.5
    groups.push({ order: Math.hypot(px - cx0, py - cy0) + jitter, draws })
  }

  if (cfg.symmetry === 'Translate') {
    const p = period
    const fc = Math.min(p, cols)
    const fr = Math.min(p, rows)
    for (let fj = 0; fj < fr; fj++) {
      for (let fi = 0; fi < fc; fi++) {
        const copies: { i: number; j: number; op: Mat }[] = []
        for (let j = fj; j < rows; j += p) {
          for (let i = fi; i < cols; i += p) copies.push({ i, j, op: ID })
        }
        if (copies.length) addGroup(fi, fj, copies)
      }
    }
  } else if (cfg.symmetry === 'Rotate') {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const pi = cols - 1 - i
        const pj = rows - 1 - j
        const isRep = pj > j || (pj === j && pi >= i)
        if (!isRep) continue
        const copies: { i: number; j: number; op: Mat }[] = [{ i, j, op: ID }]
        if (pi !== i || pj !== j) copies.push({ i: pi, j: pj, op: ROT180 })
        addGroup(i, j, copies)
      }
    }
  } else {
    // Mirror
    const fcols = Math.ceil(cols / 2)
    const frows = Math.ceil(rows / 2)
    for (let fj = 0; fj < frows; fj++) {
      for (let fi = 0; fi < fcols; fi++) {
        const key = fj * fcols + fi
        if (seen.has(key)) continue
        seen.add(key)
        const is = fi === cols - 1 - fi ? [fi] : [fi, cols - 1 - fi]
        const js = fj === rows - 1 - fj ? [fj] : [fj, rows - 1 - fj]
        const copies: { i: number; j: number; op: Mat }[] = []
        for (const j of js) {
          for (const i of is) {
            const fx = i !== fi
            const fy = j !== fj
            copies.push({ i, j, op: matMul(fy ? FLIPV : ID, fx ? FLIPH : ID) })
          }
        }
        addGroup(fi, fj, copies)
      }
    }
  }

  groups.sort((a, b) => a.order - b.order)
  m.layOrder = groups

  // Dissolve in a seeded shuffle (Fisher–Yates) so tiles lift away scattered.
  const idx = groups.map((_, k) => k)
  const rng = mulberry32(cfg.seed ^ 0xabcd)
  for (let k = idx.length - 1; k > 0; k--) {
    const r = (rng() * (k + 1)) | 0
    const tmp = idx[k]; idx[k] = idx[r]; idx[r] = tmp
  }
  m.dissolveOrder = idx

  return m
}
