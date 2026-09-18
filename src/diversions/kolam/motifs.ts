// ─────────────────────────────────────────────────────────────────────────────
// MOTIF VOCABULARY — closed and open polylines in local/world px, ready to be
// wobbled and bundled by geometry.ts.
//
// `leaf` and `drop` look alike at a glance — both are petal-shaped outlines
// pointing outward from `ang` — but `drop` is deliberately NOT mirror-symmetric
// along its own axis (its half-width also grows with `u`, `leaf`'s doesn't).
// That asymmetry is what makes a drop read as sitting INSIDE something rather
// than as another petal; collapsing the two to the same taper is the mutant
// this module's tests are written to catch.
// ─────────────────────────────────────────────────────────────────────────────

import type { Pt } from './geometry'

const sample = (f: (t: number) => Pt, steps: number): Pt[] => {
  const p: Pt[] = []
  for (let i = 0; i < steps; i++) p.push(f((i / steps) * Math.PI * 2))
  return p
}

/** A closed petal/leaf: two arcs meeting at a tip, pointing outward at `ang`. */
export function leaf(cx: number, cy: number, ang: number, len: number, wide: number): Pt[] {
  const pts: Pt[] = []
  const co = Math.cos(ang), si = Math.sin(ang)
  const put = (u: number, v: number) => pts.push({ x: cx + u * co - v * si, y: cy + u * si + v * co })
  const S = 26
  for (let i = 0; i <= S; i++) { const u = i / S; put(u * len, Math.sin(u * Math.PI) * wide) }
  for (let i = S; i >= 0; i--) { const u = i / S; put(u * len, -Math.sin(u * Math.PI) * wide) }
  return pts
}

/** A teardrop: a point at the near end, swelling toward the far end. Distinct
 *  from `leaf`, which is symmetric — the asymmetry is what makes it read as
 *  sitting INSIDE something rather than as another petal. */
export function drop(cx: number, cy: number, ang: number, len: number, wide: number): Pt[] {
  const pts: Pt[] = []
  const co = Math.cos(ang), si = Math.sin(ang), S = 26
  const put = (u: number, v: number) => pts.push({ x: cx + u * co - v * si, y: cy + u * si + v * co })
  const halfw = (u: number) => wide * Math.sin(Math.PI * u) * (0.42 + 0.58 * u)
  for (let i = 0; i <= S; i++) { const u = i / S; put(u * len, halfw(u)) }
  for (let i = S; i >= 0; i--) { const u = i / S; put(u * len, -halfw(u)) }
  return pts
}

/** A rhombus pointing outward — the angular member of the vocabulary. */
export function diamond(cx: number, cy: number, ang: number, len: number, wide: number): Pt[] {
  const co = Math.cos(ang), si = Math.sin(ang)
  const at = (u: number, v: number): Pt => ({ x: cx + u * co - v * si, y: cy + u * si + v * co })
  const p = [at(0, 0), at(len * 0.5, wide), at(len, 0), at(len * 0.5, -wide)]
  p.push({ ...p[0] })
  return p
}

/** A triangle pointing outward, and the hatch lines that fill it. Returns the
 *  outline plus its hatching separately, because the outline wants a bundle and
 *  the hatching emphatically does not — hatching a bundle is a solid block. */
export function hatchTri(
  cx: number,
  cy: number,
  ang: number,
  len: number,
  wide: number,
  lines = 3,
): { outline: Pt[]; hatch: [Pt, Pt][] } {
  const co = Math.cos(ang), si = Math.sin(ang)
  const at = (u: number, v: number): Pt => ({ x: cx + u * co - v * si, y: cy + u * si + v * co })
  const outline = [at(0, -wide), at(len, 0), at(0, wide)]
  outline.push({ ...outline[0] })
  const hatch: [Pt, Pt][] = []
  for (let i = 1; i <= lines; i++) {
    const u = (i / (lines + 1)) * len
    const w = wide * (1 - u / len)
    hatch.push([at(u, -w), at(u, w)])
  }
  return { outline, hatch }
}

/** A logarithmic spiral terminal — the little corner curl. */
export function spiralHook(cx: number, cy: number, ang: number, size: number, turns = 1.6): Pt[] {
  const pts: Pt[] = []
  const S = 70
  const b = 0.32
  for (let i = 0; i <= S; i++) {
    const t = (i / S) * turns * Math.PI * 2
    const r = size * Math.exp(b * (t - turns * Math.PI * 2))
    const a = ang + t
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  return pts
}

/** r(θ) = R(1 + amp·cos(N·θ)) — the wavy ring that makes the broad bands. */
export function wavyRing(cx: number, cy: number, R: number, lobes: number, amp: number, steps = 400): Pt[] {
  return sample((t) => {
    const r = R * (1 + amp * Math.cos(lobes * t))
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }
  }, steps)
}

/** Scalloped lace: outward bulges, k of them. */
export function scallopRing(cx: number, cy: number, R: number, k: number, depth: number, steps = 560): Pt[] {
  return sample((t) => {
    const r = R + depth * Math.abs(Math.sin((k * t) / 2))
    return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) }
  }, steps)
}

/** A superellipse — the rounded square the middle register sits on. */
export function roundedSquare(cx: number, cy: number, R: number, p: number, steps = 360): Pt[] {
  return sample((t) => {
    const c = Math.cos(t), s = Math.sin(t)
    const d = Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p)
    return { x: cx + (R * c) / d, y: cy + (R * s) / d }
  }, steps)
}

/** Parallel hatching clipped to a rotated square — the centre fill. */
export function hatchSquare(cx: number, cy: number, half: number, ang: number, step: number): [Pt, Pt][] {
  const lines: [Pt, Pt][] = []
  const co = Math.cos(ang), si = Math.sin(ang)
  for (let v = -half; v <= half; v += step) {
    const a = { u: -half, v }, b = { u: half, v }
    lines.push([
      { x: cx + a.u * co - a.v * si, y: cy + a.u * si + a.v * co },
      { x: cx + b.u * co - b.v * si, y: cy + b.u * si + b.v * co },
    ])
  }
  return lines
}
