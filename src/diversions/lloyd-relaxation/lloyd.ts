import { Delaunay } from 'd3-delaunay'
import { mulberry32 } from '../../framework/rng'
import { sampleCyclic } from '../../framework/gradient'
import type { LloydRelaxationConfig } from './schema'

export type LloydState = {
  cfg: LloydRelaxationConfig
  w: number
  h: number
  points: Float64Array // [x0,y0,x1,y1,…]
  targets: Float64Array
  delaunay: Delaunay<number>
  voronoi: ReturnType<Delaunay<number>['voronoi']>
  jrng: () => number // persistent jitter stream
  t: number
  lut: string[] // 256 precomputed rgb() strings for the drifting cell wheel
}

/** 256-entry cyclic color wheel baked to rgb() strings (no per-cell alloc). */
export function buildLUT(palette: string[]): string[] {
  const s8 = palette.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Array<string>(256)
  for (let i = 0; i < 256; i++) {
    const c = sampleCyclic(s8, i / 256)
    lut[i] = `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`
  }
  return lut
}

/** Area-weighted centroid of a Voronoi cell polygon (closed ring of [x,y]). */
export function polyCentroid(poly: [number, number][]): [number, number] {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < poly.length - 1; i++) {
    const x0 = poly[i][0], y0 = poly[i][1], x1 = poly[i + 1][0], y1 = poly[i + 1][1]
    const cross = x0 * y1 - x1 * y0
    a += cross; cx += (x0 + x1) * cross; cy += (y0 + y1) * cross
  }
  if (Math.abs(a) < 1e-9) return [poly[0][0], poly[0][1]] // degenerate sliver
  return [cx / (3 * a), cy / (3 * a)]
}

export function createLloydState(cfg: LloydRelaxationConfig, w: number, h: number): LloydState {
  const N = cfg.count
  const points = new Float64Array(N * 2)
  const rng = mulberry32(cfg.seed)
  for (let i = 0; i < N; i++) { points[i * 2] = rng() * w; points[i * 2 + 1] = rng() * h }
  const delaunay = new Delaunay(points)
  const voronoi = delaunay.voronoi([0, 0, w, h])
  return {
    cfg, w, h, points, targets: new Float64Array(N * 2), delaunay, voronoi,
    jrng: mulberry32(cfg.seed ^ 0x9e3779b9), t: 0, lut: buildLUT(cfg.palette),
  }
}

/** Rescale the foam to a new size (keeps the honeycomb, no reseed). */
export function resizeLloyd(st: LloydState, w: number, h: number): void {
  const sx = w / st.w, sy = h / st.h
  for (let i = 0; i < st.points.length; i += 2) { st.points[i] *= sx; st.points[i + 1] *= sy }
  st.w = w; st.h = h
  st.delaunay.update()
  st.voronoi = st.delaunay.voronoi([0, 0, w, h])
}

/** Render the current tessellation, then relax every seed toward its centroid
 *  (plus jitter) and refresh the diagram for next frame. */
export function stepLloyd(st: LloydState, ctx: CanvasRenderingContext2D, dt: number): void {
  const { points, targets, cfg, w, h, voronoi, lut } = st
  const N = points.length / 2
  const dts = Math.min(dt, 50) / 16.6667
  st.t += dt / 1000

  ctx.fillStyle = cfg.border
  ctx.fillRect(0, 0, w, h)
  ctx.lineWidth = cfg.borderWidth
  ctx.strokeStyle = cfg.border
  ctx.lineJoin = 'round'
  const stroke = cfg.borderWidth > 0
  const drift = st.t * 0.02

  for (let i = 0; i < N; i++) {
    const poly = voronoi.cellPolygon(i) as [number, number][] | null
    if (!poly || poly.length < 3) { targets[i * 2] = points[i * 2]; targets[i * 2 + 1] = points[i * 2 + 1]; continue }
    const c = polyCentroid(poly)
    targets[i * 2] = c[0]; targets[i * 2 + 1] = c[1]
    // color by centroid position on the drifting wheel
    let tc = (c[0] / w) * 0.7 + (c[1] / h) * 0.3 + drift
    tc = ((tc % 1) + 1) % 1
    ctx.fillStyle = lut[(tc * 256) | 0]
    ctx.beginPath()
    ctx.moveTo(poly[0][0], poly[0][1])
    for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1])
    ctx.closePath()
    ctx.fill()
    if (stroke) ctx.stroke()
  }

  // relax toward centroids + jitter
  const rate = cfg.relaxRate * dts
  const jit = cfg.jitter * dts
  for (let i = 0; i < N; i++) {
    const jx = (st.jrng() - 0.5) * jit, jy = (st.jrng() - 0.5) * jit
    let nx = points[i * 2] + (targets[i * 2] - points[i * 2]) * rate + jx
    let ny = points[i * 2 + 1] + (targets[i * 2 + 1] - points[i * 2 + 1]) * rate + jy
    points[i * 2] = nx < 1 ? 1 : nx > w - 1 ? w - 1 : nx
    points[i * 2 + 1] = ny < 1 ? 1 : ny > h - 1 ? h - 1 : ny
  }
  st.delaunay.update()
  st.voronoi.update()
}
