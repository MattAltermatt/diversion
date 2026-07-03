import { hexToRgba } from '../../framework/gradient'
import type { TruchetFlowConfig } from './schema'

const HALF_PI = Math.PI / 2

/** Stable per-tile orientation bit from a spatial hash — so resizing the grid
 *  extends it without reshuffling existing tiles (no reseed-on-resize churn). */
export function orient(r: number, c: number, seed: number): number {
  let h = Math.imul(r, 73856093) ^ Math.imul(c, 19349663) ^ Math.imul(seed, 83492791)
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  return h & 1
}

export type TruchetState = {
  cfg: TruchetFlowConfig
  w: number
  h: number
  ts: number
  arcs: Float32Array // [cx, cy, a0] per quarter-arc (a1 = a0 + π/2, drawn clockwise)
  phase: number      // dash offset, px
  // precomputed per-frame-constant paint state (rebuilt only on config change)
  dash: [number, number]
  haloColor: string
}

const NO_DASH: number[] = []

/** Recompute the paint constants that depend only on config (dash pattern from
 *  tile size + current density; halo color from the flow color). */
export function computeStyles(st: TruchetState): void {
  const arcLen = HALF_PI * (st.ts / 2)
  const period = arcLen / 2 // 2 pulses per arc → dashes align across tile joins
  const on = Math.max(1, period * st.cfg.glow)
  st.dash = [on, period - on]
  st.haloColor = hexToRgba(st.cfg.flow + '55') // low-alpha halo
}

/** Build every tile's two inward quarter-arcs covering the screen. Each arc is a
 *  quarter circle of radius ts/2 centred on a tile corner, joining two edge
 *  midpoints; the two orientations weave the classic Truchet maze. */
export function buildArcs(w: number, h: number, ts: number, seed: number): Float32Array {
  const gw = Math.ceil(w / ts)
  const gh = Math.ceil(h / ts)
  const arcs = new Float32Array(gw * gh * 2 * 3)
  let k = 0
  const put = (cx: number, cy: number, a0: number) => { arcs[k++] = cx; arcs[k++] = cy; arcs[k++] = a0 }
  for (let r = 0; r < gh; r++) {
    for (let c = 0; c < gw; c++) {
      const X = c * ts, Y = r * ts
      if (orient(r, c, seed) === 0) {
        put(X, Y, 0)                 // top-left corner: T↔L
        put(X + ts, Y + ts, Math.PI) // bottom-right corner: B↔R
      } else {
        put(X + ts, Y, HALF_PI)          // top-right corner: T↔R
        put(X, Y + ts, Math.PI + HALF_PI) // bottom-left corner: B↔L
      }
    }
  }
  return arcs
}

export function createTruchetState(cfg: TruchetFlowConfig, w: number, h: number): TruchetState {
  const st: TruchetState = {
    cfg, w, h, ts: cfg.tileSize, arcs: buildArcs(w, h, cfg.tileSize, cfg.seed), phase: 0,
    dash: [1, 1], haloColor: '#000',
  }
  computeStyles(st)
  return st
}

/** Trace every arc into the current path as its own subpath. */
function pathArcs(ctx: CanvasRenderingContext2D, st: TruchetState, rad: number): void {
  const { arcs } = st
  const n = arcs.length / 3
  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const cx = arcs[i * 3], cy = arcs[i * 3 + 1], a0 = arcs[i * 3 + 2]
    ctx.moveTo(cx + rad * Math.cos(a0), cy + rad * Math.sin(a0))
    ctx.arc(cx, cy, rad, a0, a0 + HALF_PI, false)
  }
}

export function renderTruchet(st: TruchetState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = st
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = 1

  // Build the arc path ONCE, then stroke it three times with different styles —
  // the in-context path persists across stroke() calls, so the moveTo/arc geometry
  // loop (the dominant per-frame cost at small tile sizes) runs a single time.
  pathArcs(ctx, st, st.ts / 2)

  // dim base traces (solid)
  ctx.setLineDash(NO_DASH)
  ctx.lineWidth = cfg.lineWidth
  ctx.strokeStyle = cfg.trace
  ctx.stroke()

  // flowing current: a soft halo under a bright core, both dashed + animated
  ctx.setLineDash(st.dash)
  ctx.lineDashOffset = -st.phase
  ctx.strokeStyle = st.haloColor
  ctx.lineWidth = cfg.lineWidth * 2.4
  ctx.stroke()
  ctx.strokeStyle = cfg.flow
  ctx.lineWidth = Math.max(1, cfg.lineWidth * 0.7)
  ctx.stroke()

  ctx.setLineDash(NO_DASH)
}
