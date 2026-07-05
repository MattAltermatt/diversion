import { sampleGradientRGBA } from '../../framework/gradient'
import { parseHex6 } from '../../framework/color'
import { applyMoebius, arcSpan, geodesicCircle, moebiusOffset, type Pt, type Tile } from './tiling'
import type { HyperbolicTilingConfig } from './schema'

// Never Path2D (jsdom's smoke sweep lacks it) — draw straight onto ctx and
// batch same-colour tiles into one shared path per fill/stroke call.

const PARITY_DARKEN = 0.62 // odd-parity tiles are darkened by this factor — the checkerboard read

function rgbaString(colors: string[], u: number, mul: number): string {
  const c = sampleGradientRGBA(colors.map((h) => h + 'ff'), u)
  return `rgb(${Math.round(c.r * mul)}, ${Math.round(c.g * mul)}, ${Math.round(c.b * mul)})`
}

/** The lightest colour in the palette — used for the crisp boundary ring so
 *  it always reads against a dark background regardless of ramp order. */
export function lightestColor(colors: string[]): string {
  let best = colors[0]
  let bestLum = -1
  for (const hex of colors) {
    const { r, g, b } = parseHex6(hex)
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (lum > bestLum) { bestLum = lum; best = hex }
  }
  return best
}

export type TileBin = { fillStyle: string; tiles: Tile[] }

/** Partition tiles into same-fill-colour bins by (ring, parity) and precompute each
 *  bin's fill colour. Depends only on tiles/maxDepth/colors — NOT on the per-frame
 *  Möbius drift — so the caller builds this once (setup, and whenever the tiling is
 *  regenerated or the colour ramp edits) and reuses it every frame instead of
 *  rebuilding the Map + re-sampling the gradient on every tick. */
export function buildBins(tiles: Tile[], maxDepth: number, colors: string[]): TileBin[] {
  const grouped = new Map<string, { u: number; mul: number; tiles: Tile[] }>()
  for (const tile of tiles) {
    const u = maxDepth > 0 ? tile.depth / maxDepth : 0
    const mul = tile.depth % 2 === 1 ? PARITY_DARKEN : 1
    const key = `${u.toFixed(3)}|${mul}`
    let g = grouped.get(key)
    if (!g) { g = { u, mul, tiles: [] }; grouped.set(key, g) }
    g.tiles.push(tile)
  }
  const bins: TileBin[] = []
  for (const g of grouped.values()) bins.push({ fillStyle: rgbaString(colors, g.u, g.mul), tiles: g.tiles })
  return bins
}

// Reused scratch buffer for the Möbius-transformed vertices in traceTile() — every
// tile in a {p,q} tiling has the same vertex count, so this grows once (to p) and
// is never reallocated after. Entries are mutated in place (never replaced), so
// traceTile allocates no outer array, no closure, and no per-vertex array on the
// per-frame, per-tile, twice-per-frame (fill + stroke) hot path.
const scratch: Pt[] = []

function ensureScratch(n: number): void {
  while (scratch.length < n) scratch.push([0, 0])
}

/** Trace one tile's boundary (its edges transformed by the current Möbius
 *  drift) onto the current ctx path as geodesic arcs — never straight lines,
 *  except in the (rare, degenerate) diameter case. Caller owns beginPath/fill/stroke. */
function traceTile(ctx: CanvasRenderingContext2D, tile: Tile, a: Pt): void {
  const n = tile.vertices.length
  ensureScratch(n)
  for (let i = 0; i < n; i++) {
    const [x, y] = applyMoebius(tile.vertices[i], a)
    const p = scratch[i]
    p[0] = x
    p[1] = y
  }
  ctx.moveTo(scratch[0][0], scratch[0][1])
  for (let i = 0; i < n; i++) {
    const from = scratch[i]
    const to = scratch[(i + 1) % n]
    const g = geodesicCircle(from, to)
    if (!g) {
      ctx.lineTo(to[0], to[1])
      continue
    }
    const { start, end, ccw } = arcSpan(from, to, g.c, g.r)
    ctx.arc(g.c[0], g.c[1], g.r, start, end, ccw)
  }
  ctx.closePath()
}

export function renderTiling(
  ctx: CanvasRenderingContext2D,
  cfg: HyperbolicTilingConfig,
  w: number,
  h: number,
  tiles: Tile[],
  bins: TileBin[],
  boundaryColor: string,
  time: number,
): void {
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const scale = (Math.min(w, h) / 2) * 0.97 // fit the unit disk to the smaller viewport dimension
  const a = moebiusOffset(time, cfg.driftSpeed)

  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(scale, scale)

  if (cfg.style !== 'outline') {
    // Bins (one per ring/parity colour) are precomputed by the caller — batching
    // each colour into a single path/fill call, not one per tile, without
    // rebuilding the partition or re-sampling the gradient every frame.
    for (const bin of bins) {
      ctx.beginPath()
      for (const tile of bin.tiles) traceTile(ctx, tile, a)
      ctx.fillStyle = bin.fillStyle
      ctx.fill()
    }
  }

  if (cfg.style !== 'fill' && cfg.lineWidth > 0) {
    ctx.beginPath()
    for (const tile of tiles) traceTile(ctx, tile, a)
    ctx.strokeStyle = cfg.edgeColor
    ctx.lineWidth = cfg.lineWidth / scale
    ctx.lineJoin = 'round'
    ctx.stroke()
  }

  // The ideal boundary circle — crisp and bright, the disk's horizon.
  ctx.beginPath()
  ctx.arc(0, 0, 1, 0, Math.PI * 2)
  ctx.lineWidth = Math.max(1.5, cfg.lineWidth) / scale
  ctx.strokeStyle = boundaryColor
  ctx.stroke()

  ctx.restore()
}
