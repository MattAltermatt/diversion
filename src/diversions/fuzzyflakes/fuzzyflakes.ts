// Fuzzyflakes — a calm field of soft, decorative, radially-symmetric snowflakes
// drifting and slowly rotating. Clean-room take on xscreensaver's `fuzzyflakes`.
// These are DRAWN geometric flakes (not a growth CA): each has K-fold symmetry —
// one arm is built once and stamped K times, under a low-alpha plush halo.
//
// This module is framework-agnostic and unit-testable: no DOM-instantiating
// imports. All randomness rides the seeded `mulberry32` stream so the same seed
// reproduces the same field.
import { mulberry32 } from '../../framework/rng'
import type { FuzzyflakesConfig } from './schema'

export const TAU = Math.PI * 2

export type Flake = {
  x: number
  y: number
  size: number       // arm length / radius, in CSS px
  rot: number        // current rotation (radians)
  rotDir: 1 | -1     // spin direction
  vxJit: number      // -1..1 per-flake sideways drift bias
  colorIndex: number // index into the active palette (mod length at draw time)
  // Cached glow-disc gradient (#273): rebuilt only when this flake's colour or the
  // fuzziness changes, not per frame. glowR is a function of the (fixed) size, so it
  // isn't part of the key. See drawFlake.
  glowGrad?: CanvasGradient
  glowKey?: string
}

// Named palettes — err toward contrast so flakes read clearly on a deep field.
export const PALETTES: Record<FuzzyflakesConfig['palette'], string[]> = {
  frost: ['#ffffff', '#d6ecff', '#a9d5ff', '#7fbdf5', '#c9e8ff'],
  pastel: ['#ffd1e8', '#c9f5e1', '#fff4b8', '#d7ccff', '#bfe3ff'],
  jewel: ['#ff5d8f', '#4cc9f0', '#43e0a8', '#ffd166', '#b388ff'],
}

/** K evenly-spaced arm angles for a flake rotated by `rot`. Spacing is exactly
 *  2π/K — the headline symmetry guarantee. */
export function armAngles(k: number, rot = 0): number[] {
  const out: number[] = []
  for (let i = 0; i < k; i++) out.push(rot + (i * TAU) / k)
  return out
}

/** Build the deterministic flake field for a config + viewport. Sorted small→large
 *  so the draw loop paints far (small) flakes first and near (large) ones on top. */
export function createFlakes(cfg: FuzzyflakesConfig, w: number, h: number): Flake[] {
  const rnd = mulberry32((cfg.seed >>> 0) ^ 0x9e3779b9)
  const lo = Math.min(cfg.sizeMin, cfg.sizeMax)
  const hi = Math.max(cfg.sizeMin, cfg.sizeMax)
  const flakes: Flake[] = []
  for (let i = 0; i < cfg.flakeCount; i++) {
    flakes.push({
      x: rnd() * w,
      y: rnd() * h,
      size: lo + rnd() * (hi - lo),
      rot: rnd() * TAU,
      rotDir: rnd() < 0.5 ? -1 : 1,
      vxJit: rnd() * 2 - 1,
      colorIndex: Math.floor(rnd() * 997),
    })
  }
  flakes.sort((a, b) => a.size - b.size)
  return flakes
}

/** Advance the field by `dtMs` milliseconds: gentle downward breeze (near flakes
 *  faster for depth), slow per-flake spin, and edge-wrap so it never empties. */
export function stepFlakes(flakes: Flake[], cfg: FuzzyflakesConfig, w: number, h: number, dtMs: number): void {
  const dt = dtMs / 1000
  const lo = Math.min(cfg.sizeMin, cfg.sizeMax)
  const hi = Math.max(cfg.sizeMin, cfg.sizeMax)
  const denom = Math.max(1e-6, hi - lo)
  for (const f of flakes) {
    const depth = (f.size - lo) / denom // 0 = far/small, 1 = near/large
    const vy = cfg.driftSpeed * 50 * (0.5 + depth)
    const vx = cfg.driftSpeed * 12 * f.vxJit
    f.y += vy * dt
    f.x += vx * dt
    f.rot += f.rotDir * cfg.rotateSpeed * 0.5 * dt
    const m = f.size * 1.6
    const spanY = h + 2 * m
    const spanX = w + 2 * m
    if (f.y > h + m) f.y -= spanY
    else if (f.y < -m) f.y += spanY
    if (f.x > w + m) f.x -= spanX
    else if (f.x < -m) f.x += spanX
  }
}

// ── Arm geometry ────────────────────────────────────────────────────────────
// An arm points along +x from the flake centre, length L. `segments` are line
// pairs [x1,y1,x2,y2]; `dots` are [x, radius] beads. Both are symmetric about the
// arm axis by construction, so stamping K copies yields a K-fold flake.
export type Arm = { segments: number[][]; dots: number[][] }

export function buildArm(size: number, style: FuzzyflakesConfig['armStyle']): Arm {
  const L = size
  const segments: number[][] = []
  const dots: number[][] = []

  if (style === 'dotted') {
    const n = 6
    for (let i = 0; i <= n; i++) {
      const t = i / n
      dots.push([t * L, L * 0.1 * (1 - t * 0.6)])
    }
    return { segments, dots }
  }

  // spine
  segments.push([0, 0, L, 0])

  if (style === 'crystal') {
    // short side spurs
    for (const t of [0.42, 0.62]) {
      const bx = t * L
      const bl = (1 - t) * L * 0.28
      segments.push([bx, 0, bx + bl * 0.5, bl])
      segments.push([bx, 0, bx + bl * 0.5, -bl])
    }
    // diamond plate near the tip
    const cx = 0.84 * L
    const pd = L * 0.13
    segments.push([cx - pd, 0, cx, pd])
    segments.push([cx, pd, cx + pd, 0])
    segments.push([cx + pd, 0, cx, -pd])
    segments.push([cx, -pd, cx - pd, 0])
    return { segments, dots }
  }

  // 'stem' — forward-angled branch pairs, shrinking toward the tip
  for (const t of [0.4, 0.62, 0.82]) {
    const bx = t * L
    const bl = (1 - t) * L * 0.55
    const ang = Math.PI / 3 // 60° from the spine, angled toward the tip
    const dx = Math.cos(ang) * bl
    const dy = Math.sin(ang) * bl
    segments.push([bx, 0, bx + dx, dy])
    segments.push([bx, 0, bx + dx, -dy])
  }
  return { segments, dots }
}

// ── Rendering ────────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ]
}
const rgba = (c: [number, number, number], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

function strokeSegments(ctx: CanvasRenderingContext2D, seg: number[][]): void {
  if (seg.length === 0) return
  ctx.beginPath()
  for (const s of seg) {
    ctx.moveTo(s[0], s[1])
    ctx.lineTo(s[2], s[3])
  }
  ctx.stroke()
}
function fillDots(ctx: CanvasRenderingContext2D, dots: number[][], rScale: number): void {
  for (const d of dots) {
    ctx.beginPath()
    ctx.arc(d[0], 0, d[1] * rScale, 0, TAU)
    ctx.fill()
  }
}

function drawFlake(ctx: CanvasRenderingContext2D, f: Flake, cfg: FuzzyflakesConfig, pal: string[]): void {
  const col = hexToRgb(pal[f.colorIndex % pal.length])
  const fuzz = cfg.fuzziness
  const arm = buildArm(f.size, cfg.armStyle)
  const k = cfg.arms

  ctx.save()
  ctx.translate(f.x, f.y)
  ctx.rotate(f.rot)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Soft plush glow disc under everything (radial gradient, low alpha — never
  // additive, so overlapping flakes don't white out). The gradient is cached on the
  // flake and only rebuilt when its colour or the fuzziness changes — avoids a
  // createRadialGradient + 3 addColorStop per flake per frame (#273).
  const glowR = f.size * 1.15
  const glowKey = `${pal[f.colorIndex % pal.length]}|${fuzz}`
  if (f.glowKey !== glowKey) {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR)
    grad.addColorStop(0, rgba(col, 0.05 + 0.12 * fuzz))
    grad.addColorStop(0.5, rgba(col, 0.03 + 0.04 * fuzz))
    grad.addColorStop(1, rgba(col, 0))
    f.glowGrad = grad
    f.glowKey = glowKey
  }
  ctx.fillStyle = f.glowGrad!
  ctx.beginPath()
  ctx.arc(0, 0, glowR, 0, TAU)
  ctx.fill()

  // Halo pass — wide, translucent strokes for the fuzzy edge.
  ctx.strokeStyle = rgba(col, 0.12 + 0.16 * fuzz)
  ctx.fillStyle = rgba(col, 0.12 + 0.16 * fuzz)
  ctx.lineWidth = Math.max(2, f.size * 0.05) * (1 + fuzz * 1.6)
  for (const a of armAngles(k)) {
    ctx.save()
    ctx.rotate(a)
    strokeSegments(ctx, arm.segments)
    fillDots(ctx, arm.dots, 1.9 + fuzz)
    ctx.restore()
  }

  // Core pass — crisp, bright strokes on top.
  ctx.strokeStyle = rgba(col, 0.96)
  ctx.fillStyle = rgba(col, 0.96)
  ctx.lineWidth = Math.max(1, f.size * 0.028)
  for (const a of armAngles(k)) {
    ctx.save()
    ctx.rotate(a)
    strokeSegments(ctx, arm.segments)
    fillDots(ctx, arm.dots, 1)
    ctx.restore()
  }

  // Centre hub — halo then core.
  ctx.fillStyle = rgba(col, 0.18 + 0.18 * fuzz)
  ctx.beginPath()
  ctx.arc(0, 0, f.size * 0.16, 0, TAU)
  ctx.fill()
  ctx.fillStyle = rgba(col, 1)
  ctx.beginPath()
  ctx.arc(0, 0, f.size * 0.08, 0, TAU)
  ctx.fill()

  ctx.restore()
}

/** Paint one full frame: clear the deep field, then draw every flake (already
 *  sorted small→large so near flakes land on top). Fresh redraw each frame — no
 *  accumulation buffer, because the flakes drift. */
export function drawScene(ctx: CanvasRenderingContext2D, flakes: Flake[], cfg: FuzzyflakesConfig, w: number, h: number): void {
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)
  const pal = PALETTES[cfg.palette] ?? PALETTES.frost
  for (const f of flakes) drawFlake(ctx, f, cfg, pal)
}
