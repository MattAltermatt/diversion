import { Delaunay } from 'd3-delaunay'
import { mulberry32 } from '../../framework/rng'
import { sampleCyclic } from '../../framework/gradient'
import { mix } from '../../framework/color'
import type { DelaunayMeshConfig } from './schema'

// Per-point orbit: [bx, by, ax, ay, fx, fy, phx, phy] — a Lissajous-style
// wander around a fixed base, so motion is smooth, deterministic and never
// clusters or escapes (amplitude is bounded by construction, see createMeshState).
const STRIDE = 8

export type MeshState = {
  cfg: DelaunayMeshConfig
  w: number
  h: number
  points: Float64Array // current [x0,y0,x1,y1,…] — fed directly to Delaunay, mutated in place
  orbit: Float64Array // per-point orbit params, stride 8 (see above)
  delaunay: Delaunay<number>
  orbitT: number // orbit-phase clock; advances by dt * driftSpeed each frame
  lutFill: string[] // 256 precomputed rgb() fill strings (the drifting facet wheel)
  lutEdge: string[] // 256 precomputed rgb() darker strings (facet-line overlay, 'both' mode)
}

/** 256-entry cyclic color wheel, baked once (no per-triangle alloc). `fill` is the
 *  vivid facet color; `edge` is the same color mixed toward black — used for the
 *  dark facet lines in 'both' mode (and directly as the vivid wireframe in 'mesh'). */
export function buildLUT(palette: string[]): { fill: string[]; edge: string[] } {
  const s8 = palette.map((s) => (s.length === 7 ? s + 'ff' : s))
  const fill = new Array<string>(256)
  const edge = new Array<string>(256)
  for (let i = 0; i < 256; i++) {
    const c = sampleCyclic(s8, i / 256)
    fill[i] = `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
    const dark = mix(c, { r: 0, g: 0, b: 0 }, 0.55)
    edge[i] = `rgb(${dark.r},${dark.g},${dark.b})`
  }
  return { fill, edge }
}

export function createMeshState(cfg: DelaunayMeshConfig, w: number, h: number): MeshState {
  const N = cfg.count
  const rng = mulberry32(cfg.seed)
  const orbit = new Float64Array(N * STRIDE)
  const points = new Float64Array(N * 2)

  const short = Math.min(w, h)
  const ampMax = short * 0.12
  const edgeMargin = short * 0.04
  const marginBase = ampMax + edgeMargin
  const spanX = Math.max(1, w - 2 * marginBase)
  const spanY = Math.max(1, h - 2 * marginBase)

  for (let i = 0; i < N; i++) {
    const o = i * STRIDE
    const bx = marginBase + rng() * spanX
    const by = marginBase + rng() * spanY
    const ax = ampMax * (0.4 + rng() * 0.6)
    const ay = ampMax * (0.4 + rng() * 0.6)
    const fx = 0.15 + rng() * 0.35
    const fy = 0.15 + rng() * 0.35
    const phx = rng() * Math.PI * 2
    const phy = rng() * Math.PI * 2
    orbit[o] = bx; orbit[o + 1] = by
    orbit[o + 2] = ax; orbit[o + 3] = ay
    orbit[o + 4] = fx; orbit[o + 5] = fy
    orbit[o + 6] = phx; orbit[o + 7] = phy
    // seed the visible position at orbitT=0 (matches the sin formula stepMesh
    // uses every frame), so a dt=0 step never perturbs a freshly-created state.
    points[i * 2] = bx + ax * Math.sin(phx)
    points[i * 2 + 1] = by + ay * Math.sin(phy)
  }

  const delaunay = new Delaunay(points)
  const { fill, edge } = buildLUT(cfg.palette)
  return { cfg, w, h, points, orbit, delaunay, orbitT: 0, lutFill: fill, lutEdge: edge }
}

/** Rescale the mesh to a new size (keeps orbit shape/phase, no reseed). Scaling
 *  both the orbit base and amplitude by the same factor preserves every future
 *  sampled position exactly (base + amp*sin(...) scales linearly). */
export function resizeMesh(st: MeshState, w: number, h: number): void {
  const sx = w / st.w, sy = h / st.h
  const N = st.points.length / 2
  for (let i = 0; i < N; i++) {
    const o = i * STRIDE
    st.orbit[o] *= sx; st.orbit[o + 1] *= sy
    st.orbit[o + 2] *= sx; st.orbit[o + 3] *= sy
    st.points[i * 2] *= sx; st.points[i * 2 + 1] *= sy
  }
  st.w = w; st.h = h
  st.delaunay.update()
}

/** Advance every point along its orbit, re-triangulate, and render. */
export function stepMesh(st: MeshState, ctx: CanvasRenderingContext2D, dt: number): void {
  const { cfg, w, h, points, orbit, delaunay, lutFill, lutEdge } = st
  const N = points.length / 2
  st.orbitT += (Math.min(dt, 50) / 1000) * cfg.driftSpeed

  for (let i = 0; i < N; i++) {
    const o = i * STRIDE
    points[i * 2] = orbit[o] + orbit[o + 2] * Math.sin(orbit[o + 4] * st.orbitT + orbit[o + 6])
    points[i * 2 + 1] = orbit[o + 1] + orbit[o + 3] * Math.sin(orbit[o + 5] * st.orbitT + orbit[o + 7])
  }
  delaunay.update()

  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const fillMode = cfg.mode !== 'mesh'
  const strokeMode = cfg.mode !== 'filled'
  const edgeSource = cfg.mode === 'mesh' ? lutFill : lutEdge
  ctx.lineJoin = 'round'
  ctx.lineWidth = cfg.edgeThickness

  const triangles = st.delaunay.triangles
  const drift = st.orbitT * 0.05
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2]
    const ax = points[a * 2], ay = points[a * 2 + 1]
    const bx = points[b * 2], by = points[b * 2 + 1]
    const cx = points[c * 2], cy = points[c * 2 + 1]
    const cxm = (ax + bx + cx) / 3, cym = (ay + by + cy) / 3
    let tc = (cxm / w) * 0.7 + (cym / h) * 0.3 + drift
    tc = ((tc % 1) + 1) % 1
    const idx = Math.min(255, (tc * 256) | 0)

    ctx.beginPath()
    ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath()
    if (fillMode) { ctx.fillStyle = lutFill[idx]; ctx.fill() }
    if (strokeMode) { ctx.strokeStyle = edgeSource[idx]; ctx.stroke() }
  }

  if (cfg.showVertices) {
    ctx.fillStyle = '#ffffff'
    const r = 1.2 + cfg.edgeThickness * 0.6
    for (let i = 0; i < N; i++) {
      ctx.beginPath()
      ctx.arc(points[i * 2], points[i * 2 + 1], r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** True if (px,py) lies inside (or on, within a small epsilon) the circumcircle
 *  of triangle (ax,ay)-(bx,by)-(cx,cy). Winding-independent (explicit circumcenter
 *  + radius, mirroring the classic Bourke `circumcircle()` this hack is built on) —
 *  used only to verify the Delaunay empty-circumcircle property in tests. */
export function inCircumcircle(
  px: number, py: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
): boolean {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-9) return false // degenerate/collinear triangle
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const r2 = (ax - ux) ** 2 + (ay - uy) ** 2
  const dist2 = (px - ux) ** 2 + (py - uy) ** 2
  return dist2 < r2 - 1e-6
}
