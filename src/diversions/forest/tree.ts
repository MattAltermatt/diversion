import { mulberry32 } from '../../framework/rng'
import type { ForestConfig } from './schema'

// ─── Recursive fractal tree geometry ─────────────────────────────────────────
// A tree is built ONCE, deterministically from its seed, into a flat list of line
// segments in LOCAL space (base at the origin, growing upward = negative y, one
// local unit of height ≈ BASE_LEN * a few). Nothing here depends on the canvas
// size, so a resize never regenerates geometry — the renderer fit-scales each tree
// per frame. Everything is PURE so the same seed reproduces the same forest.
//
// Each branch carries its recursion `depth` and a normalized reveal window
// [growStart, growEnd) keyed to that depth (trunk 0..1/L, deepest twig ..1). The
// renderer walks a single 0..1 `front`: a branch draws partially while the front
// crosses its window, so a tree visibly sprouts trunk → boughs → twigs → foliage.

export interface TreeBranch {
  x0: number
  y0: number
  x1: number
  y1: number
  depth: number
  growStart: number
  growEnd: number
  tip: boolean // deepest branch — carries a foliage cluster at its endpoint
}

export interface TreeGeometry {
  branches: TreeBranch[]
  byDepth: TreeBranch[][] // branches grouped by depth (one stroke pass each)
  tips: TreeBranch[] // branches whose endpoint gets foliage
  levels: number // recursion levels (max depth + 1)
  cx: number // canopy centre x (local) — draw shifted by -cx to stand over the base
  height: number // local height (base y=0 → topmost -y), drives the fit scale
}

// ─── Season palettes (bark ramp base→tip, leaf choices, haze, default bg) ─────
export interface Season {
  bark: string[] // #rrggbb, dark base → lighter upper bark
  leaves: string[] // #rrggbb foliage choices (empty = no leaves)
  haze: string // #rrggbb distance-fog tint far trees blend toward
}

export const SEASONS: Record<ForestConfig['season'], Season> = {
  Spring: {
    bark: ['#241a12', '#4f3722', '#6f4e2f'],
    leaves: ['#e79ac0', '#f2b8d6', '#a3d97a', '#c8e89a', '#f7d6e6'],
    haze: '#3a3040',
  },
  Summer: {
    bark: ['#20160f', '#4a3320', '#6b4a2c'],
    leaves: ['#1f6b2e', '#2f8f3a', '#4faa45', '#6fbf4e', '#18582a'],
    haze: '#24402f',
  },
  Autumn: {
    bark: ['#2b1c12', '#5a3a1f', '#7a4f28'],
    leaves: ['#c8531b', '#e08a1e', '#b8371f', '#e6b23a', '#8f2d18'],
    haze: '#4a3324',
  },
  Winter: {
    bark: ['#22262b', '#3a4148', '#565f66'],
    leaves: ['#dbe6ee', '#c2d2dd', '#eef4f8', '#aebcc6'],
    haze: '#39434d',
  },
  Bare: {
    bark: ['#241d18', '#463a30', '#665445'],
    leaves: [],
    haze: '#3a322a',
  },
}

const DEG = Math.PI / 180
const BASE_LEN = 120 // local units for the trunk segment (fit-scaled per frame)
const MAX_SEGMENTS = 4000 // per-tree budget guarding the exponential recursion

/** Build one tree's geometry (deterministic given `rng`). */
export function buildTree(cfg: ForestConfig, rng: () => number): TreeGeometry {
  const levels = cfg.depth
  const branchAngle = cfg.branchAngle * DEG
  const jitter = cfg.angleJitter * DEG
  const split = cfg.splitFactor
  const branches: TreeBranch[] = []
  const budget = { n: MAX_SEGMENTS }

  // grow one branch of length `len` at `depth`, then recurse into its children.
  const grow = (x: number, y: number, heading: number, len: number, depth: number): void => {
    if (depth >= levels || budget.n <= 0) return
    const h = heading + (rng() * 2 - 1) * jitter
    const x1 = x + Math.cos(h) * len
    const y1 = y + Math.sin(h) * len
    const isLeaf = depth === levels - 1
    branches.push({
      x0: x, y0: y, x1, y1, depth,
      growStart: depth / levels,
      growEnd: (depth + 1) / levels,
      tip: isLeaf,
    })
    budget.n--
    if (isLeaf || budget.n <= 0) return
    for (let i = 0; i < split; i++) {
      // spread children symmetrically about the parent heading: for split=3 the
      // middle child (offset 0) is a straight leader; split=2 gives a clean fork.
      const offset = split > 1 ? (i / (split - 1) - 0.5) * 2 * branchAngle : 0
      grow(x1, y1, h + offset, len * cfg.lengthDecay, depth + 1)
    }
  }

  const lean = (rng() * 2 - 1) * 0.12 // slight per-tree lean off vertical
  grow(0, 0, -Math.PI / 2 + lean, BASE_LEN, 0)

  // bounds → centre + height
  let minX = Infinity, maxX = -Infinity, minY = 0
  for (const b of branches) {
    if (b.x0 < minX) minX = b.x0
    if (b.x1 < minX) minX = b.x1
    if (b.x0 > maxX) maxX = b.x0
    if (b.x1 > maxX) maxX = b.x1
    if (b.y0 < minY) minY = b.y0
    if (b.y1 < minY) minY = b.y1
  }
  if (branches.length === 0) { minX = -1; maxX = 1; minY = -1 }

  const byDepth: TreeBranch[][] = Array.from({ length: levels }, () => [])
  const tips: TreeBranch[] = []
  for (const b of branches) {
    byDepth[b.depth].push(b)
    if (b.tip) tips.push(b)
  }

  return {
    branches, byDepth, tips, levels,
    cx: (minX + maxX) / 2,
    height: Math.max(1, -minY),
  }
}

/** Fisher–Yates shuffle (seeded) — used to decorrelate depth from x-position. */
export function shuffled(n: number, rng: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

/** Deterministic per-tree leaf-colour pick (stable across frames). */
export function leafColorIndex(tipIndex: number, treeSeed: number, count: number): number {
  if (count <= 0) return 0
  const h = ((tipIndex * 2654435761) ^ (treeSeed * 40503 + 0x9e3779b9)) >>> 0
  return h % count
}

export { mulberry32 }
