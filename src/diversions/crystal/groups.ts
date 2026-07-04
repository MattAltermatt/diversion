// ── The 17 wallpaper groups, as affine transforms on a lattice ─────────────
//
// A wallpaper group tiles the plane by (a) a lattice of translations and (b) a
// finite set of coset transforms within one cell (the point-group operations,
// some carrying a glide half-translation). We work in FRACTIONAL cell
// coordinates: a point (u,v) means u·b1 + v·b2 in the Cartesian plane, where
// b1,b2 are the cell's basis vectors. Each op is  frac' = M·frac + t.
//
// The key trick that keeps the motif undistorted: the point-group matrices M are
// chosen so that B·M·B⁻¹ is an ORTHOGONAL Cartesian map (rotation or reflection)
// — verified in groups.test.ts. So the lattice can shear (hex, oblique) while
// the stamped motif stays a rigid, isometric copy. The renderer places anchors
// through the lattice basis but orients each stamp by the orthogonal B·M·B⁻¹.

export type Vec = [number, number]
/** 2×2 matrix as [a,b,c,d] = [[a,b],[c,d]], acting on a column (u,v). */
export type Mat = [number, number, number, number]
export type Op = { m: Mat; t: Vec }

export type WallpaperGroup = {
  id: GroupId
  /** basis vectors (cell edges) in a normalised Cartesian frame (~unit scale) */
  b1: Vec
  b2: Vec
  ops: Op[]
}

// ── tiny 2×2 / vec algebra ─────────────────────────────────────────────────
export const mul = (A: Mat, B: Mat): Mat => [
  A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
]
export const detM = (A: Mat): number => A[0] * A[3] - A[1] * A[2]
export const invM = (A: Mat): Mat => {
  const d = detM(A)
  return [A[3] / d, -A[1] / d, -A[2] / d, A[0] / d]
}
export const applyM = (A: Mat, x: number, y: number): Vec => [A[0] * x + A[1] * y, A[2] * x + A[3] * y]

// ── point-group building blocks (fractional coords) ─────────────────────────
const I: Mat = [1, 0, 0, 1]
const R2: Mat = [-1, 0, 0, -1] // 180°
const MX: Mat = [-1, 0, 0, 1] //  mirror across the v-axis (flips u)
const MY: Mat = [1, 0, 0, -1] //  mirror across the u-axis (flips v)
// square (order-4) rotations & diagonal mirrors
const R4: Mat = [0, -1, 1, 0] // 90°  (u,v)->(-v,u)
const R4b: Mat = [0, 1, -1, 0] // 270°
const MD1: Mat = [0, 1, 1, 0] // diagonal mirror (u,v)->(v,u)
const MD2: Mat = [0, -1, -1, 0]
// hexagonal: a 60° rotation on the 120° basis is exactly this integer matrix
// (B·R6·B⁻¹ is a true Cartesian 60° rotation — see the test). Its powers give
// the whole C6, C3 ⊂ C6.
const R6: Mat = [1, -1, 1, 0]
const R6_2 = mul(R6, R6)
const R6_3 = mul(R6_2, R6)
const R6_4 = mul(R6_3, R6)
const R6_5 = mul(R6_4, R6)
const MH1: Mat = [0, 1, 1, 0] //  hex mirror (p31m/p6m orientation)
const MH2: Mat = [0, -1, -1, 0] // hex mirror (p3m1 orientation)

const op = (m: Mat, t: Vec = [0, 0]): Op => ({ m, t })

// D-group helper: rotations, then each rotation composed with a mirror.
const dihedral = (rots: Mat[], mirror: Mat): Op[] => [
  ...rots.map((r) => op(r)),
  ...rots.map((r) => op(mul(r, mirror))),
]

// ── the five lattice frames ────────────────────────────────────────────────
const OBLIQUE = { b1: [1, 0] as Vec, b2: [0.34, 0.94] as Vec }
const RECT = { b1: [1, 0] as Vec, b2: [0, 1.35] as Vec }
const SQUARE = { b1: [1, 0] as Vec, b2: [0, 1] as Vec }
const RHOMBIC = { b1: [0.72, 0.52] as Vec, b2: [0.72, -0.52] as Vec } // centred-rect primitive cell
const HEX = { b1: [1, 0] as Vec, b2: [-0.5, 0.8660254037844387] as Vec }

export const GROUP_IDS = [
  'p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm',
  'p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m',
] as const
export type GroupId = (typeof GROUP_IDS)[number]

const g = (id: GroupId, frame: { b1: Vec; b2: Vec }, ops: Op[]): WallpaperGroup =>
  ({ id, b1: frame.b1, b2: frame.b2, ops })

export const GROUPS: Record<GroupId, WallpaperGroup> = {
  // — oblique —
  p1: g('p1', OBLIQUE, [op(I)]),
  p2: g('p2', OBLIQUE, [op(I), op(R2)]),
  // — rectangular (primitive) —
  pm: g('pm', RECT, [op(I), op(MX)]), //                 one true mirror
  pg: g('pg', RECT, [op(I), op(MY, [0.5, 0])]), //        glide only, no mirror
  cm: g('cm', RHOMBIC, [op(I), op(MD1)]), //             mirror on rhombic cell
  pmm: g('pmm', RECT, [op(I), op(R2), op(MX), op(MY)]),
  pmg: g('pmg', RECT, [op(I), op(R2), op(MX), op(MY, [0.5, 0])]), // one mirror + one glide
  pgg: g('pgg', RECT, [op(I), op(R2), op(MX, [0.5, 0.5]), op(MY, [0.5, 0.5])]), // two glides, no mirror
  cmm: g('cmm', RHOMBIC, [op(I), op(R2), op(MD1), op(MD2)]),
  // — square —
  p4: g('p4', SQUARE, [op(I), op(R4), op(R2), op(R4b)]),
  p4m: g('p4m', SQUARE, dihedral([I, R4, R2, R4b], MX)),
  p4g: g('p4g', SQUARE, [ //  rotations + diagonal mirrors + axial glides
    op(I), op(R4), op(R2), op(R4b),
    op(MD1), op(MD2), op(MX, [0.5, 0.5]), op(MY, [0.5, 0.5]),
  ]),
  // — hexagonal —
  p3: g('p3', HEX, [op(I), op(R6_2), op(R6_4)]),
  p3m1: g('p3m1', HEX, dihedral([I, R6_2, R6_4], MH2)),
  p31m: g('p31m', HEX, dihedral([I, R6_2, R6_4], MH1)),
  p6: g('p6', HEX, [op(I), op(R6), op(R6_2), op(R6_3), op(R6_4), op(R6_5)]),
  p6m: g('p6m', HEX, dihedral([I, R6, R6_2, R6_3, R6_4, R6_5], MH1)),
}

/** Basis matrix B = [b1 | b2] mapping fractional (u,v) → Cartesian. */
export const basisMat = (grp: WallpaperGroup): Mat => [grp.b1[0], grp.b2[0], grp.b1[1], grp.b2[1]]

/** Orthogonal Cartesian orientation of an op: B·M·B⁻¹ (a pure rotation or
 *  reflection — the isometry the motif is stamped under). */
export const cartOrient = (grp: WallpaperGroup, m: Mat): Mat => {
  const B = basisMat(grp)
  return mul(B, mul(m, invM(B)))
}

/** Resolve the schema `group` value (or 'auto') + seed → a concrete group.
 *  'auto' hashes the seed so a given seed always yields the same group. */
export function resolveGroup(group: string, seed: number): WallpaperGroup {
  if (group !== 'auto' && group in GROUPS) return GROUPS[group as GroupId]
  const h = (seed ^ 0x5bd1e995) >>> 0
  return GROUPS[GROUP_IDS[h % GROUP_IDS.length]]
}
