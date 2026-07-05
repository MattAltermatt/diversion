// Pure marbling maths — the closed-form drop & comb deformations (Aubrey Jaffer,
// "Mathematical Marbling") and their exact inverses. The fragment shader (gl.ts)
// re-implements the *inverse* walk in GLSL; this module is the JS source of truth
// for the schedule generator and the round-trip unit tests. No DOM imports — pure.

export type Vec2 = { x: number; y: number }

/** A drop of ink: fresh disk of radius r at centre c, colour index into the palette. */
export interface DropOp {
  kind: 'drop'
  cx: number
  cy: number
  r: number // final radius
  color: number // palette index
  startMs: number
  durMs: number
}

/** A comb pass: a rank of parallel tines pulling along unit dir (mx,my), teeth spaced
 *  `spacing` apart (perpendicular), full pull `z`, falloff length `falloff` (world units).
 *  Tooth lines run parallel to M so perpendicular distance is invariant → the inverse is
 *  exact. Displacement uses exp(−dNear/falloff) — the numerically-robust form of Jaffer's
 *  u^dNear (u = exp(−1/falloff)); in a [0,1] world an intuitive length beats a ~1e-14 u. */
export interface CombOp {
  kind: 'comb'
  ax: number
  ay: number // a point the rank passes through
  mx: number
  my: number // unit pull direction M
  spacing: number
  phase: number // perpendicular offset of the tooth lattice
  z: number // full pull amount
  falloff: number // decay length λ of the pull between teeth (world units)
  startMs: number
  durMs: number
}

/** A whirlpool: points rotate around centre (cx,cy) by an angle that decays with radius
 *  (θ = strength·exp(−r/radius)). Rotation preserves r, so the inverse is just rotate-back
 *  by −θ(r) — exact and singularity-free. Swirls the existing colours into a spiral. */
export interface VortexOp {
  kind: 'vortex'
  cx: number
  cy: number
  strength: number // peak rotation (radians) at the centre
  radius: number // decay length λ of the swirl (world units)
  startMs: number
  durMs: number
}

export type Operation = DropOp | CombOp | VortexOp

// ─── DROP ────────────────────────────────────────────────────────────────────
// forward: P' = C + (P−C)·√(1 + r²/|P−C|²)  — pushes the whole plane radially out
//          to make room for the new disk.

export function dropForward(p: Vec2, c: Vec2, r: number): Vec2 {
  const dx = p.x - c.x
  const dy = p.y - c.y
  const d2 = dx * dx + dy * dy
  if (d2 === 0) return { x: p.x, y: p.y } // centre maps to itself
  const s = Math.sqrt(1 + (r * r) / d2)
  return { x: c.x + dx * s, y: c.y + dy * s }
}

/** Inverse of a drop. Returns null when Q is inside the fresh disk (D² < r²) — the pixel
 *  IS this drop's ink and has no earlier pre-image. */
export function dropInverse(q: Vec2, c: Vec2, r: number): Vec2 | null {
  const dx = q.x - c.x
  const dy = q.y - c.y
  const D2 = dx * dx + dy * dy
  if (D2 < r * r) return null // terminal: fresh paint
  const s = Math.sqrt(1 - (r * r) / D2)
  return { x: c.x + dx * s, y: c.y + dy * s }
}

// ─── COMB ────────────────────────────────────────────────────────────────────
// forward: P' = P + z·u^{dNear}·M,  dNear = dist to nearest tooth line (⟂ measure).

/** Perpendicular distance from p to the nearest tooth line of the rank. */
export function combNearDist(p: Vec2, o: CombOp): number {
  // N ⟂ M
  const nx = -o.my
  const ny = o.mx
  const perp = (p.x - o.ax) * nx + (p.y - o.ay) * ny
  // fold into [-spacing/2, spacing/2] around the nearest tooth
  const half = o.spacing / 2
  let m = (perp - o.phase + half) % o.spacing
  if (m < 0) m += o.spacing
  return Math.abs(m - half)
}

export function combForward(p: Vec2, o: CombOp): Vec2 {
  const dNear = combNearDist(p, o)
  const disp = o.z * Math.exp(-dNear / o.falloff)
  return { x: p.x + disp * o.mx, y: p.y + disp * o.my }
}

/** Inverse of a comb. dNear(Q) == dNear(P) because the displacement is along M and the
 *  tooth lines are parallel to M (perpendicular offset unchanged) — so it's exact. */
export function combInverse(q: Vec2, o: CombOp): Vec2 {
  const dNear = combNearDist(q, o) // invariant along M
  const disp = o.z * Math.exp(-dNear / o.falloff)
  return { x: q.x - disp * o.mx, y: q.y - disp * o.my }
}

// ─── partial (animated) parameters ────────────────────────────────────────────
// The newest in-progress op animates a single completion scalar; earlier ops are frozen.

/** Ease-out for a drop bloom: ink spreads fast then settles (√ profile reads as diffusion). */
export function dropRadiusAt(o: DropOp, sheetMs: number): number {
  if (sheetMs >= o.startMs + o.durMs) return o.r
  if (sheetMs <= o.startMs) return 0
  const t = (sheetMs - o.startMs) / o.durMs
  return o.r * Math.sqrt(t)
}

/** Comb pull ramps in linearly as the rake is drawn across. */
export function combPullAt(o: CombOp, sheetMs: number): number {
  if (sheetMs >= o.startMs + o.durMs) return o.z
  if (sheetMs <= o.startMs) return 0
  return o.z * ((sheetMs - o.startMs) / o.durMs)
}

// ─── VORTEX ────────────────────────────────────────────────────────────────
// forward: rotate P around C by θ(r) = strength·exp(−r/radius), r = |P−C|.

function vortexAngle(o: VortexOp, r: number): number {
  return o.strength * Math.exp(-r / o.radius)
}

export function vortexForward(p: Vec2, o: VortexOp): Vec2 {
  const dx = p.x - o.cx
  const dy = p.y - o.cy
  const r = Math.hypot(dx, dy)
  const a = vortexAngle(o, r)
  const s = Math.sin(a)
  const c = Math.cos(a)
  return { x: o.cx + c * dx - s * dy, y: o.cy + s * dx + c * dy }
}

/** Inverse rotates back by −θ(r). r is preserved by rotation, so θ(Q)==θ(P) — exact. */
export function vortexInverse(q: Vec2, o: VortexOp): Vec2 {
  const dx = q.x - o.cx
  const dy = q.y - o.cy
  const r = Math.hypot(dx, dy) // invariant under rotation
  const a = -vortexAngle(o, r)
  const s = Math.sin(a)
  const c = Math.cos(a)
  return { x: o.cx + c * dx - s * dy, y: o.cy + s * dx + c * dy }
}

/** Swirl spins up smoothly (ease-out) so the whirlpool winds on rather than snapping. */
export function vortexStrengthAt(o: VortexOp, sheetMs: number): number {
  if (sheetMs >= o.startMs + o.durMs) return o.strength
  if (sheetMs <= o.startMs) return 0
  const t = (sheetMs - o.startMs) / o.durMs
  return o.strength * (1 - (1 - t) * (1 - t)) // ease-out quad
}
