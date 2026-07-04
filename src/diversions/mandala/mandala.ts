import { mulberry32 } from '../../framework/rng'
import type { MandalaConfig } from './schema'

// ── Motif vocabulary ──────────────────────────────────────────────────────────
// Every motif is drawn in a local frame whose +x points radially OUTWARD and whose
// origin sits ON the ring, so each motif is mirror-symmetric about its own radial
// axis. That is what makes the whole composition dihedral: an evenly-spaced set of
// N·k such motifs is invariant under rotation by 2π/N (the headline property).
export type Motif = 'dot' | 'petal' | 'lotus' | 'diamond' | 'triangle' | 'arc' | 'ray'

const STYLE_MOTIFS: Record<MandalaConfig['motifStyle'], Motif[]> = {
  Mixed: ['dot', 'petal', 'lotus', 'diamond', 'triangle', 'arc', 'ray'],
  Petals: ['petal', 'petal', 'lotus', 'arc'],
  Dots: ['dot', 'dot', 'ray', 'arc'],
  Lotus: ['lotus', 'lotus', 'petal', 'dot'],
  Geometric: ['diamond', 'triangle', 'ray', 'arc'],
}

const STROKED: Record<Motif, boolean> = {
  dot: false, petal: false, lotus: false, diamond: false, triangle: false,
  arc: true, ray: true,
}

export interface Ring {
  index: number
  motif: Motif
  count: number   // N · k — a multiple of the fold symmetry, so the set is N-fold invariant
  angle0: number  // phase offset of the first motif (radians)
  radius: number  // 0..1 fraction of the max radius
  size: number    // 0..1 fraction of the max radius (motif half-extent)
  colorIdx: number
  stroked: boolean
}

export interface Mandala {
  cfg: MandalaConfig
  symmetry: number
  rings: Ring[]
  doneTime: number // seconds at which every ring is fully revealed
}

export const REVEAL_SPAN = 1.4 // rings overlap slightly as they bloom in (in ring-units)

/** Build the full ring geometry for a config — pure and DOM-free (unit-testable).
 *  All seeded choices are made here ONCE; the frame loop only reveals them. */
export function buildMandala(cfg: MandalaConfig): Mandala {
  const rng = mulberry32(cfg.seed >>> 0)
  const N = cfg.symmetry
  const pool = STYLE_MOTIFS[cfg.motifStyle]
  const rings: Ring[] = []

  for (let i = 0; i < cfg.ringCount; i++) {
    const t = cfg.ringCount === 1 ? 0.5 : i / (cfg.ringCount - 1)
    // Leave a small centre gap; push the outermost ring near the edge.
    const radius = 0.08 + 0.9 * ((i + 0.6) / cfg.ringCount)
    const motif = pool[(rng() * pool.length) | 0]
    // Outer rings carry more motifs so the density stays even as circumference grows.
    const kRoll = rng()
    const k = t > 0.55 ? (kRoll < 0.5 ? 2 : 3) : (kRoll < 0.6 ? 1 : 2)
    const count = N * k
    // Alternate rings half a step so motifs interlock rather than lining up radially.
    const angle0 = i % 2 === 0 ? 0 : Math.PI / count
    // Motif half-size scaled to the ring spacing so neighbours nearly touch.
    const spacing = 0.5 / cfg.ringCount
    const size = spacing * (0.85 + rng() * 0.5) * cfg.sizeScale
    // Cycle colours outward with a seeded offset for variety.
    const colorIdx = (i + ((rng() * cfg.palette.length) | 0)) % cfg.palette.length
    rings.push({ index: i, motif, count, angle0, radius, size, colorIdx, stroked: STROKED[motif] })
  }

  const doneTime = cfg.ringCount - 1 + REVEAL_SPAN
  return { cfg, symmetry: N, rings, doneTime: doneTime / cfg.growthSpeed }
}

/** Reveal fraction 0..1 of ring `i` at growth clock `g` (in ring-units). */
export function ringReveal(i: number, g: number): number {
  const x = (g - i) / REVEAL_SPAN
  return x <= 0 ? 0 : x >= 1 ? 1 : x
}

// ── Palette LUT ────────────────────────────────────────────────────────────────
export interface Rgb { r: number; g: number; b: number }

export function buildLut(palette: string[]): Rgb[] {
  return palette.map((hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }))
}

const rgba = (c: Rgb, a: number) => `rgba(${c.r},${c.g},${c.b},${a})`

// Cubic ease-out for a soft bloom-in.
const easeOut = (x: number) => 1 - (1 - x) * (1 - x) * (1 - x)

// ── Motif drawing ──────────────────────────────────────────────────────────────
// `cx,cy` mandala centre; `r` ring radius (px); `ang` placement angle; `s` half-size (px).
function drawMotif(
  ctx: CanvasRenderingContext2D, motif: Motif,
  cx: number, cy: number, r: number, ang: number, s: number,
  color: Rgb, lineW: number,
): void {
  if (motif === 'arc') {
    // Tangential arc segment centred on the ring itself.
    const span = Math.min(s / Math.max(r, 1), 0.5)
    ctx.beginPath()
    ctx.arc(cx, cy, r, ang - span, ang + span)
    ctx.lineWidth = lineW
    ctx.strokeStyle = rgba(color, 1)
    ctx.stroke()
    return
  }
  if (motif === 'ray') {
    // Short radial spoke straddling the ring.
    const cos = Math.cos(ang), sin = Math.sin(ang)
    ctx.beginPath()
    ctx.moveTo(cx + cos * (r - s), cy + sin * (r - s))
    ctx.lineTo(cx + cos * (r + s), cy + sin * (r + s))
    ctx.lineWidth = lineW
    ctx.strokeStyle = rgba(color, 1)
    ctx.stroke()
    return
  }

  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(ang)
  ctx.translate(r, 0) // now at the motif's home on the ring, +x pointing outward
  switch (motif) {
    case 'dot': {
      // Two-layer glow: low-alpha halo + opaque core (avoids additive blowout).
      ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2)
      ctx.fillStyle = rgba(color, 0.22); ctx.fill()
      ctx.beginPath(); ctx.arc(0, 0, s * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = rgba(color, 1); ctx.fill()
      break
    }
    case 'petal': {
      // Pointed lens along the radial axis.
      ctx.beginPath()
      ctx.moveTo(-s, 0)
      ctx.quadraticCurveTo(0, -s * 0.62, s, 0)
      ctx.quadraticCurveTo(0, s * 0.62, -s, 0)
      ctx.fillStyle = rgba(color, 1); ctx.fill()
      break
    }
    case 'lotus': {
      // Teardrop with the point facing outward.
      ctx.beginPath()
      ctx.moveTo(s * 1.15, 0)
      ctx.quadraticCurveTo(0, -s * 0.6, -s * 0.55, 0)
      ctx.quadraticCurveTo(0, s * 0.6, s * 1.15, 0)
      ctx.fillStyle = rgba(color, 1); ctx.fill()
      break
    }
    case 'diamond': {
      ctx.beginPath()
      ctx.moveTo(s, 0); ctx.lineTo(0, s * 0.72); ctx.lineTo(-s, 0); ctx.lineTo(0, -s * 0.72)
      ctx.closePath()
      ctx.fillStyle = rgba(color, 1); ctx.fill()
      break
    }
    case 'triangle': {
      ctx.beginPath()
      ctx.moveTo(s, 0); ctx.lineTo(-s * 0.62, s * 0.72); ctx.lineTo(-s * 0.62, -s * 0.72)
      ctx.closePath()
      ctx.fillStyle = rgba(color, 1); ctx.fill()
      break
    }
  }
  ctx.restore()
}

/** Draw one ring's full motif set at a given master alpha + scale. Used both for the
 *  live frontier rings and for baking completed rings into the accumulation buffer. */
export function drawRing(
  ctx: CanvasRenderingContext2D, ring: Ring, cx: number, cy: number,
  maxR: number, lut: Rgb[], mirror: boolean, lineW: number,
  alpha: number, scale: number,
): void {
  if (alpha <= 0) return
  const color = lut[ring.colorIdx % lut.length]
  const r = ring.radius * maxR
  const s = ring.size * maxR * scale
  const step = (Math.PI * 2) / ring.count
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = prevAlpha * alpha
  for (let j = 0; j < ring.count; j++) {
    const ang = ring.angle0 + j * step
    drawMotif(ctx, ring.motif, cx, cy, r, ang, s, color, lineW)
    if (mirror) {
      // Half-offset mirrored twin — still a multiple-of-N set, so symmetry holds.
      drawMotif(ctx, ring.motif, cx, cy, r, ang + step / 2, s * 0.7, color, lineW)
    }
  }
  ctx.globalAlpha = prevAlpha
}

/** Live master alpha for a fully-baked ring at reveal fraction `a` → eased bloom-in. */
export function revealAlpha(a: number): number { return easeOut(a) }
export function revealScale(a: number): number { return 0.6 + 0.4 * easeOut(a) }
