// ─── Hex lattice geometry for Hexadrop ───────────────────────────────────────
// Pointy-top hexagons in axial (q, r) coordinates covering the screen. Cube
// coordinates (x=q, z=r, y=-q-r) give the ring distance a ripple travels along:
//   cubeDistance = (|dx| + |dy| + |dz|) / 2
// The number of cells at ring distance k around any origin is 1, 6, 12, 18, …
// (6k for k>0) — that ring structure IS the ripple's wavefront. Self-contained so
// the simulation stays unit-testable with no DOM imports.

export interface HexCell {
  q: number
  r: number
  cx: number // pixel centre x (CSS px)
  cy: number // pixel centre y
}

const SQRT3 = Math.sqrt(3)

/** Axial (q, r) → pixel centre. `size` is the hex circumradius (centre→vertex). */
export function axialToPixel(q: number, r: number, size: number): { x: number; y: number } {
  return {
    x: size * (SQRT3 * q + (SQRT3 / 2) * r),
    y: size * (1.5 * r),
  }
}

/** Pixel → fractional axial (inverse of axialToPixel). Used to bound the lattice. */
export function pixelToAxial(x: number, y: number, size: number): { q: number; r: number } {
  const r = y / (1.5 * size)
  const q = x / (SQRT3 * size) - r / 2
  return { q, r }
}

/** Centre-to-centre spacing of adjacent hexes (= √3 · size). */
export function hexSpacing(size: number): number {
  return SQRT3 * size
}

/** Cube (hex-ring) distance between two axial cells. For axial (q,r): cube x=q,
 *  z=r, y=-q-r, so |Δy| = |Δq + Δr|. Rings grow 1, 6, 12, 18, … around any origin. */
export function cubeDistance(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2
  const dr = r1 - r2
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** The six pointy-top corner offsets (relative to a hex centre) at circumradius
 *  `size`, as [x0,y0, x1,y1, … x5,y5]. Vertices sit at 60°·i − 30°. */
export function hexCornerOffsets(size: number): number[] {
  const out: number[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30)
    out.push(size * Math.cos(a), size * Math.sin(a))
  }
  return out
}

/** Build a rectangle of hexes covering w×h in CSS px, overscanned one ring so
 *  border half-hexes are whole and off-screen ripple fronts bleed rather than clip. */
export function buildGrid(w: number, h: number, size: number): HexCell[] {
  const margin = hexSpacing(size)
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
  for (let r = rMin; r <= rMax; r++) {
    for (let q = qMin; q <= qMax; q++) {
      const { x, y } = axialToPixel(q, r, size)
      if (x < -margin || x > w + margin || y < -margin || y > h + margin) continue
      cells.push({ q, r, cx: x, cy: y })
    }
  }
  return cells
}

/** Generate every axial cell within cube-ring radius `radius` of the origin — the
 *  hex disk. Used by tests to assert ring counts (1, 6, 12, 18, …). */
export function hexDisk(radius: number): { q: number; r: number }[] {
  const out: { q: number; r: number }[] = []
  for (let q = -radius; q <= radius; q++) {
    for (let r = -radius; r <= radius; r++) {
      if (cubeDistance(q, r, 0, 0) <= radius) out.push({ q, r })
    }
  }
  return out
}
