import { Delaunay } from 'd3-delaunay'
import { mulberry32 } from '../../framework/rng'
import { buildGradientLUT, gradientIndex } from '../../framework/gradient'
import type { VoronoiConfig } from './schema'

// Reference: xscreensaver's `voronoi` hack (hacks/glx/voronoi.c, Jamie Zawinski,
// 2007-2025) drives colored Voronoi cells from moving seed points, rasterized on
// the GPU via depth-tested cones. This is a clean-room reimplementation on a 2D
// canvas: cells are computed with a Delaunay triangulation (d3-delaunay, already
// the repo's Voronoi library — see lloyd-relaxation) recomputed every frame from
// each site's own position, and each site orbits a fixed home point on a sum of
// two incommensurate sine waves — smooth, bounded, and never exactly repeating —
// rather than xscreensaver's velocity/acceleration + prune/respawn cycle.

export type VoronoiState = {
  cfg: VoronoiConfig
  w: number
  h: number
  points: Float64Array // [x0,y0,x1,y1,…] — current site positions, written each frame
  homeX: Float64Array
  homeY: Float64Array
  freq: Float64Array // [fx1,fx2,fy1,fy2] per site, 4*N
  phase: Float64Array // [px1,px2,py1,py2] per site, 4*N
  amp: Float64Array // per-site drift radius in px (slight organic variance)
  delaunay: Delaunay<number>
  voronoi: ReturnType<Delaunay<number>['voronoi']>
  t: number // elapsed seconds, orbit clock (independent of driftSpeed so it can change live)
  lut: string[] // 256 precomputed rgba() strings for the palette wheel
}

/** 256-entry cyclic color-wheel LUT baked from the hex6 palette (append full alpha). */
export function buildPaletteLUT(palette: string[]): string[] {
  return buildGradientLUT(palette.map((h) => h + 'ff'), true)
}

function hexAlpha(hex: string): string {
  return hex.length === 7 ? hex + 'ff' : hex
}

export function createVoronoiState(cfg: VoronoiConfig, w: number, h: number): VoronoiState {
  const N = cfg.siteCount
  const rng = mulberry32(cfg.seed)
  const R = cfg.driftRadius * Math.min(w, h)
  // hard ceiling on any site's amplitude so a home point + margin (a+1) always fits
  // inside both axes, however large driftRadius is asked to go.
  const maxA = Math.max(0, Math.min(w, h) / 2 - 2)
  const points = new Float64Array(N * 2)
  const homeX = new Float64Array(N)
  const homeY = new Float64Array(N)
  const freq = new Float64Array(N * 4)
  const phase = new Float64Array(N * 4)
  const amp = new Float64Array(N)

  for (let i = 0; i < N; i++) {
    const a = Math.min(R * (0.75 + rng() * 0.5), maxA) // per-site radius variance, 0.75x–1.25x
    amp[i] = a
    // keep the home point far enough from every edge that the orbit never leaves the canvas
    const mx = a + 1
    const my = a + 1
    const hx = mx + rng() * Math.max(0, w - 2 * mx)
    const hy = my + rng() * Math.max(0, h - 2 * my)
    homeX[i] = hx
    homeY[i] = hy
    // two incommensurate sine terms per axis; base rates ~0.05–0.15 rad/s, randomized
    // per site so no two sites ever share a period.
    freq[i * 4 + 0] = 0.05 + rng() * 0.1
    freq[i * 4 + 1] = 0.13 + rng() * 0.17
    freq[i * 4 + 2] = 0.06 + rng() * 0.11
    freq[i * 4 + 3] = 0.15 + rng() * 0.19
    phase[i * 4 + 0] = rng() * Math.PI * 2
    phase[i * 4 + 1] = rng() * Math.PI * 2
    phase[i * 4 + 2] = rng() * Math.PI * 2
    phase[i * 4 + 3] = rng() * Math.PI * 2
    points[i * 2] = hx
    points[i * 2 + 1] = hy
  }

  const delaunay = new Delaunay(points)
  const voronoi = delaunay.voronoi([0, 0, w, h])
  return {
    cfg, w, h, points, homeX, homeY, freq, phase, amp, delaunay, voronoi,
    t: 0, lut: buildPaletteLUT(cfg.palette),
  }
}

/** Rescale the field to a new canvas size (keeps homes/orbits proportional). */
export function resizeVoronoi(st: VoronoiState, w: number, h: number): void {
  const sx = w / st.w, sy = h / st.h
  const s = Math.min(sx, sy)
  for (let i = 0; i < st.homeX.length; i++) {
    st.homeX[i] *= sx
    st.homeY[i] *= sy
    st.amp[i] *= s
  }
  st.w = w
  st.h = h
  updatePositions(st)
  st.delaunay.update()
  st.voronoi = st.delaunay.voronoi([0, 0, w, h])
}

/** Write every site's current position from its home + orbit into `points`. */
export function updatePositions(st: VoronoiState): void {
  const { points, homeX, homeY, freq, phase, amp, cfg, t } = st
  const speed = cfg.driftSpeed
  const N = homeX.length
  for (let i = 0; i < N; i++) {
    const f0 = i * 4
    const ox = Math.sin(t * freq[f0] * speed + phase[f0]) * 0.65
      + Math.sin(t * freq[f0 + 1] * speed + phase[f0 + 1]) * 0.35
    const oy = Math.cos(t * freq[f0 + 2] * speed + phase[f0 + 2]) * 0.65
      + Math.cos(t * freq[f0 + 3] * speed + phase[f0 + 3]) * 0.35
    points[i * 2] = homeX[i] + ox * amp[i]
    points[i * 2 + 1] = homeY[i] + oy * amp[i]
  }
}

/** Nearest-site lookup (point location via the Delaunay triangulation) — the same
 *  answer as "which Voronoi cell contains (x,y)". Used by both rendering (implicitly,
 *  via cellPolygon) and correctness tests. */
export function nearestSite(st: VoronoiState, x: number, y: number): number {
  return st.delaunay.find(x, y)
}

/** Advance the orbit clock, recompute the tessellation, and render one frame. */
export function stepVoronoi(st: VoronoiState, ctx: CanvasRenderingContext2D, dt: number): void {
  st.t += Math.min(dt, 50) / 1000
  updatePositions(st)
  st.delaunay.update()
  st.voronoi.update()

  const { cfg, w, h, voronoi, points, lut } = st
  const N = points.length / 2
  const stroke = cfg.edgeWidth > 0
  ctx.lineJoin = 'round'
  ctx.lineWidth = cfg.edgeWidth
  ctx.strokeStyle = hexAlpha(cfg.edgeColor)

  for (let i = 0; i < N; i++) {
    const poly = voronoi.cellPolygon(i) as [number, number][] | null
    if (!poly || poly.length < 3) continue

    let tone: number
    if (cfg.fillMode === 'site') {
      tone = i / N
    } else if (cfg.fillMode === 'position') {
      tone = (points[i * 2] / w) * 0.6 + (points[i * 2 + 1] / h) * 0.4
    } else {
      // area: cells span a huge dynamic range, so compress with sqrt before mapping
      const area = Math.abs(polygonArea(poly))
      const norm = Math.sqrt(area) / Math.sqrt((w * h) / N)
      tone = Math.min(1, norm / 3)
    }
    ctx.fillStyle = lut[gradientIndex(((tone % 1) + 1) % 1)]
    ctx.beginPath()
    ctx.moveTo(poly[0][0], poly[0][1])
    for (let k = 1; k < poly.length; k++) ctx.lineTo(poly[k][0], poly[k][1])
    ctx.closePath()
    ctx.fill()
    if (stroke) ctx.stroke()
  }
}

/** Shoelace polygon area (unsigned) for a closed [x,y] ring. */
export function polygonArea(poly: [number, number][]): number {
  let a = 0
  for (let i = 0; i < poly.length - 1; i++) {
    a += poly[i][0] * poly[i + 1][1] - poly[i + 1][0] * poly[i][1]
  }
  return a / 2
}
