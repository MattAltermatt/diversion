/**
 * triangulate.ts — pure, deterministic 2D Delaunay (Bowyer–Watson).
 *
 * A BoxCar2D car's structural members are the edges of the Delaunay triangulation
 * of its (≤7) node positions: always one connected, rigid, non-self-crossing frame
 * ("always a triangle to connect them"). No engine/DOM imports → runs headless.
 *
 * Degeneracy fallback: <3 points, or fully collinear points (no triangle emerges),
 * connect as a chain in (x, then y) order so the frame is still one piece.
 */
export interface Pt { x: number; y: number }
export type Edge = [number, number] // indices into the input array, a < b

export function triangulateEdges(pts: Pt[]): Edge[] {
  if (pts.length < 3) return chain(pts)
  const tris = bowyerWatson(pts)
  if (tris.length === 0) return chain(pts) // collinear → no triangles
  const seen = new Set<string>()
  const edges: Edge[] = []
  const add = (a: number, b: number) => {
    if (a > b) { const t = a; a = b; b = t }
    const k = `${a},${b}`
    if (!seen.has(k)) { seen.add(k); edges.push([a, b]) }
  }
  for (const t of tris) { add(t[0], t[1]); add(t[1], t[2]); add(t[2], t[0]) }
  return edges
}

function chain(pts: Pt[]): Edge[] {
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a].x - pts[b].x || pts[a].y - pts[b].y)
  const edges: Edge[] = []
  for (let i = 1; i < idx.length; i++) {
    let a = idx[i - 1], b = idx[i]
    if (a > b) { const t = a; a = b; b = t }
    edges.push([a, b])
  }
  return edges
}

type Tri = [number, number, number]

function bowyerWatson(pts: Pt[]): Tri[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const dmax = Math.max(maxX - minX, maxY - minY) || 1
  const midx = (minX + maxX) / 2, midy = (minY + maxY) / 2
  const n = pts.length
  // working vertex list = real points + 3 super-triangle vertices
  const sp: Pt[] = pts.concat([
    { x: midx - 20 * dmax, y: midy - dmax },
    { x: midx, y: midy + 20 * dmax },
    { x: midx + 20 * dmax, y: midy - dmax },
  ])
  let tris: Tri[] = [[n, n + 1, n + 2]]
  for (let i = 0; i < n; i++) {
    const bad: Tri[] = []
    for (const t of tris) if (inCircumcircle(sp[i], sp[t[0]], sp[t[1]], sp[t[2]])) bad.push(t)
    // boundary = edges that belong to exactly one bad triangle
    const counts = new Map<string, number>()
    const store = new Map<string, [number, number]>()
    for (const t of bad) {
      const es: [number, number][] = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]
      for (const [a, b] of es) {
        const k = a < b ? `${a},${b}` : `${b},${a}`
        counts.set(k, (counts.get(k) || 0) + 1)
        store.set(k, [a, b])
      }
    }
    tris = tris.filter(t => !bad.includes(t))
    for (const [k, c] of counts) if (c === 1) { const [a, b] = store.get(k)!; tris.push([a, b, i]) }
  }
  // discard any triangle still touching a super-triangle vertex
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n)
}

/** True if p is strictly inside the circumcircle of triangle (a,b,c).
 *  Orientation-normalized so it works for CW and CCW triangles. */
function inCircumcircle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const ax = a.x - p.x, ay = a.y - p.y
  const bx = b.x - p.x, by = b.y - p.y
  const cx = c.x - p.x, cy = c.y - p.y
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)
  const orient = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
  return orient > 0 ? det > 0 : det < 0
}
