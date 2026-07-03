// ─── Hex lattice geometry ────────────────────────────────────────────────────
// Pointy-top hexagons in axial (q, r) coordinates. The single source of truth for
// both where a hex sits and who its neighbours are — so an arm's draw direction and
// the neighbour it hands off to can never disagree (the #1 silent bug in a hex port).
// After xscreensaver's hextrail by Jamie Zawinski.

export interface Axial {
  q: number
  r: number
}

// The six neighbour directions, pointy-top axial. Index j's opposite is (j+3)%6 —
// that pairing IS the arm-handoff contract (h.arms[j] ↔ neighbour.arms[(j+3)%6]).
export const NEIGHBOR_OFFSETS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

/** Axial (q, r) → pixel centre. `size` is the hex circumradius (centre→vertex). */
export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r),
    y: size * (1.5 * r),
  }
}

/** Pixel → fractional axial (inverse of axialToPixel). Used to bound the lattice. */
export function pixelToAxial(x: number, y: number, size: number): Axial {
  const r = y / (1.5 * size)
  const q = x / (Math.sqrt(3) * size) - r / 2
  return { q, r }
}

/** Distance between adjacent hex centres for a given size (= √3 · size). */
export function hexDist(size: number): number {
  return Math.sqrt(3) * size
}

// Unit direction toward neighbour j — size-independent (every hex shares these), so
// computed once. Derived from the SAME axialToPixel the neighbour topology uses.
export const ARM_DIRS: { x: number; y: number }[] = NEIGHBOR_OFFSETS.map((d) => {
  const p = axialToPixel(d.q, d.r, 1)
  const len = Math.hypot(p.x, p.y)
  return { x: p.x / len, y: p.y / len }
})

// Arm phases (const-object union — `enum` is banned under erasableSyntaxOnly).
// EMPTY → OUT → DONE on the origin; EMPTY → WAIT → IN → DONE on the neighbour.
export const ArmPhase = {
  EMPTY: 0,
  OUT: 1, // extending from origin centre → shared edge (ratio 0→1)
  WAIT: 2, // neighbour arm, idle until the incoming OUT completes
  IN: 3, // extending from shared edge → this hex's centre (ratio 0→1) — a 2nd fwd leg
  DONE: 4,
} as const
export type ArmPhase = (typeof ArmPhase)[keyof typeof ArmPhase]

export interface ArmState {
  phase: ArmPhase
  ratio: number // 0..1, monotonic while OUT or IN
  speed: number // ratio-units per ms (per-arm jitter, rolled at spawn)
}

export interface HexCell {
  q: number
  r: number
  cx: number
  cy: number
  neighbors: (HexCell | null)[] // length 6, index-aligned with NEIGHBOR_OFFSETS / ARM_DIRS
  arms: ArmState[] // length 6
  u: number // colour scalar 0..1 (inherited + drifted)
  captured: boolean // has this hex been reached (coloured) yet
}

function emptyArm(): ArmState {
  return { phase: ArmPhase.EMPTY, ratio: 0, speed: 0 }
}

/** A hex is a valid growth target only when ALL six of its arms are still EMPTY —
 *  this is what keeps the grown structure a sparse tree, not a filled mesh. */
export function isHexAvailable(h: HexCell): boolean {
  for (let j = 0; j < 6; j++) if (h.arms[j].phase !== ArmPhase.EMPTY) return false
  return true
}

/** Shared-edge midpoint between two adjacent hexes = the midpoint of their centres
 *  (for a hex grid the connecting segment is bisected by the shared edge). Defined
 *  via centres so it is symmetric by construction. */
export function edgeMidpoint(a: HexCell, b: HexCell): { x: number; y: number } {
  return { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 }
}

/** Build a rectangle-of-hexes covering w×h in CSS px, overscanned one ring so border
 *  half-hexes are whole and off-screen arms bleed rather than clip. Neighbours are
 *  wired once here (construction-time Map lookup, never in the hot path). */
export function buildLattice(w: number, h: number, size: number): HexCell[] {
  const margin = hexDist(size) // ~one hex of overscan
  const corners = [
    [-margin, -margin],
    [w + margin, -margin],
    [-margin, h + margin],
    [w + margin, h + margin],
  ]
  let qMin = Infinity, qMax = -Infinity, rMin = Infinity, rMax = -Infinity
  for (const [x, y] of corners) {
    const { q, r } = pixelToAxial(x, y, size)
    if (q < qMin) qMin = q
    if (q > qMax) qMax = q
    if (r < rMin) rMin = r
    if (r > rMax) rMax = r
  }
  qMin = Math.floor(qMin) - 1
  qMax = Math.ceil(qMax) + 1
  rMin = Math.floor(rMin) - 1
  rMax = Math.ceil(rMax) + 1

  const cells: HexCell[] = []
  const map = new Map<string, HexCell>()
  for (let r = rMin; r <= rMax; r++) {
    for (let q = qMin; q <= qMax; q++) {
      const { x, y } = axialToPixel(q, r, size)
      if (x < -margin || x > w + margin || y < -margin || y > h + margin) continue
      const cell: HexCell = {
        q, r, cx: x, cy: y,
        neighbors: [null, null, null, null, null, null],
        arms: [emptyArm(), emptyArm(), emptyArm(), emptyArm(), emptyArm(), emptyArm()],
        u: 0,
        captured: false,
      }
      cells.push(cell)
      map.set(`${q},${r}`, cell)
    }
  }
  for (const cell of cells) {
    for (let j = 0; j < 6; j++) {
      const off = NEIGHBOR_OFFSETS[j]
      cell.neighbors[j] = map.get(`${cell.q + off.q},${cell.r + off.r}`) ?? null
    }
  }
  return cells
}

/** Reset every arm/colour on a lattice so growth can restart on the same cells. */
export function clearLattice(cells: HexCell[]): void {
  for (const c of cells) {
    c.u = 0
    c.captured = false
    for (let j = 0; j < 6; j++) {
      c.arms[j].phase = ArmPhase.EMPTY
      c.arms[j].ratio = 0
      c.arms[j].speed = 0
    }
  }
}
