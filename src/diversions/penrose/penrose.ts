import { mulberry32 } from '../../framework/rng'
import type { PenroseConfig } from './schema'

const PHI = (1 + Math.sqrt(5)) / 2
const INV = 1 / PHI // 0.618… — the golden deflation ratio

type Pt = [number, number]
type Tri = { t: number; a: Pt; b: Pt; c: Pt } // t: 1 = wide (fat) half, 0 = narrow (thin) half

const lerp = (p: Pt, q: Pt, f: number): Pt => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]

/** One Penrose (P3) deflation of the Robinson-triangle set. */
function subdivide(tris: Tri[]): Tri[] {
  const out: Tri[] = []
  for (const { t, a, b, c } of tris) {
    if (t === 0) {
      const p = lerp(a, b, INV)
      out.push({ t: 0, a: c, b: p, c: b }, { t: 1, a: p, b: c, c: a })
    } else {
      const q = lerp(b, a, INV)
      const r = lerp(b, c, INV)
      out.push({ t: 1, a: r, b: c, c: a }, { t: 1, a: q, b: r, c: b }, { t: 0, a: r, b: q, c: a })
    }
  }
  return out
}

/** A wheel of 10 narrow (36°-apex) half-tiles around the origin (unit radius),
 *  rotated by `rot` — the canonical Penrose deflation seed. */
function initSun(rot: number): Tri[] {
  const tris: Tri[] = []
  for (let i = 0; i < 10; i++) {
    const a1 = (2 * i - 1) * Math.PI / 10 + rot
    const a2 = (2 * i + 1) * Math.PI / 10 + rot
    let b: Pt = [Math.cos(a1), Math.sin(a1)]
    let c: Pt = [Math.cos(a2), Math.sin(a2)]
    if (i % 2 === 0) { const tmp = b; b = c; c = tmp }
    tris.push({ t: 0, a: [0, 0], b, c })
  }
  return tris
}

/** Seeded lattice rotation so each visit opens on a different orientation. */
export function seededRot(seed: number): number {
  return mulberry32(seed)() * Math.PI * 2
}

/** Build the deflated tiling as a flat [t, ax,ay, bx,by, cx,cy] × N array. */
export function buildTiling(depth: number, rot: number): Float32Array {
  let tris = initSun(rot)
  for (let i = 0; i < depth; i++) tris = subdivide(tris)
  const out = new Float32Array(tris.length * 7)
  for (let i = 0; i < tris.length; i++) {
    const { t, a, b, c } = tris[i]
    const o = i * 7
    out[o] = t; out[o + 1] = a[0]; out[o + 2] = a[1]
    out[o + 3] = b[0]; out[o + 4] = b[1]; out[o + 5] = c[0]; out[o + 6] = c[1]
  }
  return out
}

export type PenroseState = {
  cfg: PenroseConfig
  w: number
  h: number
  tris: Float32Array
  rotation: number
}

export function createPenroseState(cfg: PenroseConfig, w: number, h: number): PenroseState {
  return { cfg, w, h, tris: buildTiling(cfg.depth, seededRot(cfg.seed)), rotation: 0 }
}

export function renderPenrose(st: PenroseState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, tris } = st
  const N = tris.length / 7
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const S = 0.5 * Math.hypot(w, h) * 1.08 // scale so the (unit-radius) tiling covers the screen
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.scale(S, S)
  ctx.rotate(st.rotation)

  // batched fills: one path per rhomb type (both same-type triangle halves share a
  // colour, so their diagonal vanishes)
  for (let pass = 0; pass < 2; pass++) {
    ctx.fillStyle = pass === 1 ? cfg.thick : cfg.thin
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const o = i * 7
      if ((tris[o] >= 0.5 ? 1 : 0) !== pass) continue
      ctx.moveTo(tris[o + 1], tris[o + 2]); ctx.lineTo(tris[o + 3], tris[o + 4]); ctx.lineTo(tris[o + 5], tris[o + 6]); ctx.closePath()
    }
    ctx.fill()
  }

  // stroke only the two rhomb edges of each triangle (skip the odd-length diagonal)
  if (cfg.lineWidth > 0) {
    ctx.strokeStyle = cfg.edge
    ctx.lineWidth = cfg.lineWidth / S
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const o = i * 7
      const ax = tris[o + 1], ay = tris[o + 2], bx = tris[o + 3], by = tris[o + 4], cx = tris[o + 5], cy = tris[o + 6]
      const lab = (ax - bx) ** 2 + (ay - by) ** 2
      const lbc = (bx - cx) ** 2 + (by - cy) ** 2
      const lca = (cx - ax) ** 2 + (cy - ay) ** 2
      const d1 = Math.abs(lab - lbc), d2 = Math.abs(lbc - lca), d3 = Math.abs(lca - lab)
      if (d1 <= d2 && d1 <= d3) { // ab≈bc equal → diagonal is ca
        ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.moveTo(bx, by); ctx.lineTo(cx, cy)
      } else if (d2 <= d3) { // bc≈ca → diagonal ab
        ctx.moveTo(bx, by); ctx.lineTo(cx, cy); ctx.moveTo(cx, cy); ctx.lineTo(ax, ay)
      } else { // ca≈ab → diagonal bc
        ctx.moveTo(cx, cy); ctx.lineTo(ax, ay); ctx.moveTo(ax, ay); ctx.lineTo(bx, by)
      }
    }
    ctx.stroke()
  }
  ctx.restore()
}
