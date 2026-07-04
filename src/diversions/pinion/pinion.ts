import { mulberry32 } from '../../framework/rng'
import type { PinionConfig } from './schema'

const TAU = Math.PI * 2

// ── Gear proportions (virtual units). One shared MODULE across all gears is the
// meshing keystone: pitch radius rp = MODULE·T/2, so a meshing pair sits at centre
// distance rp₁+rp₂ = MODULE·(T₁+T₂)/2, and one gear's tooth (addendum = MODULE) drops
// into the other's dedendum (1.25·MODULE) with clearance. ──
const MODULE = 10
const ADDENDUM_F = 1.0 // tooth stands MODULE·ADDENDUM_F·toothDepth beyond the pitch circle
const DEDENDUM_F = 1.25 // root sits MODULE·DEDENDUM_F·toothDepth inside the pitch circle
// Tooth angular half-widths as a fraction of the tooth cell Δ = 2π/T. Because rp∝T
// these fractions give a tooth ARC thickness independent of T (T cancels), and the
// tooth base (0.46·Δ) is deliberately thinner than the gap (0.54·Δ) so any pair of
// meshing gears interlocks without the tooth flanks colliding.
const TOOTH_HALF_BASE = 0.23
const TOOTH_HALF_TIP = 0.12

export type LayoutMode = PinionConfig['layout']
export type StyleMode = PinionConfig['style']
export type PaletteName = PinionConfig['palette']

/** Per-gear resolved colours (computed once per style/palette change, never per
 *  frame — a per-frame colour rebuild is the #1 jank source). */
export interface GearColors {
  fill: string
  outline: string
  hub: string
  bolt: string
  highlight: string
  spoke: string
}

/** One gear in the train. Geometry is in virtual units (viewport-independent); the
 *  draw pass fits the whole train's bounding box into the live canvas. `phase0` is
 *  the seed-solved base rotation that puts this gear in mesh with its parent; `phase`
 *  is the live rotation advanced each frame by `omega` (rad/s, signed). */
export interface Gear {
  index: number
  parent: number // index of the gear this meshes with, or -1 for the root
  depth: number
  cx: number
  cy: number
  T: number
  rp: number // pitch radius
  rOut: number // tooth-tip radius (for collision + bbox)
  rHub: number
  sign: number // +1 / -1 rotation sense; alternates across every mesh
  phase0: number // base rotation (rad) that meshes with parent
  phase: number // live rotation (rad)
  omega: number // resolved angular speed (rad/s, signed)
  rim: Float32Array // local (lx,ly) rim vertices, pitch-centred, unrotated
  col: GearColors
}

export interface PinionState {
  gears: Gear[]
  cfg: PinionConfig
  w: number
  h: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}

// ── Colour helpers ──

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
/** Scale toward black (k<1) — a metallic shadow. */
function darken(hex: string, k: number): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r * k, g * k, b * k)
}
/** Blend toward white by k (0..1) — a metallic highlight. */
function lighten(hex: string, k: number): string {
  const [r, g, b] = parseHex(hex)
  return toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)
}
/** HSL→#rrggbb (spectrum palette only; called at build, never per frame). */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((((h % 360) + 360) % 360) / 60)
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if (hp < 1) { r = c; g = x } else if (hp < 2) { r = x; g = c }
  else if (hp < 3) { g = c; b = x } else if (hp < 4) { g = x; b = c }
  else if (hp < 5) { r = x; b = c } else { r = c; b = x }
  const m = l - c / 2
  return toHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
}

const PALETTES: Record<Exclude<PaletteName, 'spectrum'>, string[]> = {
  brass: ['#caa14b', '#e6c878', '#a67c33', '#d8b45c', '#8f6b2e', '#f0d38a'],
  copper: ['#c8703a', '#e0955c', '#9c4a24', '#d98a4f', '#b5623a', '#eaa877'],
  jewel: ['#e63973', '#ffb02e', '#2ec4b6', '#3a86ff', '#8a5cf6', '#ff5d5d'],
  steel: ['#8a93a3', '#c3ccd8', '#5f6875', '#a7b0be', '#727b88', '#dfe6ef'],
}

function baseColor(palette: PaletteName, index: number): string {
  if (palette === 'spectrum') return hslToHex(index * 47, 0.62, 0.58)
  const arr = PALETTES[palette]
  return arr[index % arr.length]
}

function gearColors(palette: PaletteName, index: number): GearColors {
  const fill = baseColor(palette, index)
  return {
    fill,
    outline: darken(fill, 0.42),
    hub: darken(fill, 0.66),
    bolt: darken(fill, 0.34),
    highlight: lighten(fill, 0.4),
    spoke: darken(fill, 0.5),
  }
}

/** (Re)compute every gear's colours from the current style/palette. */
export function resolveColors(state: PinionState): void {
  for (const g of state.gears) g.col = gearColors(state.cfg.palette, g.index)
}

// ── Geometry ──

function hubRadius(rp: number): number {
  return Math.max(MODULE * 0.7, rp * 0.24)
}

/** Build a gear's rim outline as local (lx,ly) vertices, pitch-centred (tooth 0
 *  centred at local angle 0 ⇒ a tooth points along +x before rotation). Four
 *  vertices per tooth trace a trapezoid (root → tip → tip → root); the straight
 *  hop to the next tooth's first vertex is the root land (the gap the neighbour's
 *  tooth enters). No Path2D — the caller strokes/fills via moveTo/lineTo. */
export function buildRim(T: number, rp: number, toothDepth: number): { rim: Float32Array; rOut: number } {
  const rOut = rp + MODULE * ADDENDUM_F * toothDepth
  const rRoot = Math.max(rp * 0.5, rp - MODULE * DEDENDUM_F * toothDepth)
  const delta = TAU / T
  const hb = delta * TOOTH_HALF_BASE
  const ht = delta * TOOTH_HALF_TIP
  const rim = new Float32Array(T * 4 * 2)
  let k = 0
  const put = (a: number, r: number) => { rim[k++] = r * Math.cos(a); rim[k++] = r * Math.sin(a) }
  for (let i = 0; i < T; i++) {
    const c = i * delta
    put(c - hb, rRoot)
    put(c - ht, rOut)
    put(c + ht, rOut)
    put(c + hb, rRoot)
  }
  return { rim, rOut }
}

/** Base rotation (rad) for a child so a tooth of the parent drops into a gap of the
 *  child at the mesh line. Solves p_parent(β) + p_child(β+π) ≡ ½ (mod 1), where
 *  p_i(θ) = (θ−φ_i)·T_i/2π is the fractional tooth position (integer = tooth centre,
 *  half-integer = gap centre) and β is the world direction parent→child. This SUM
 *  invariant (not a difference) is what the opposite-sign ratio ω_p·T_p = −ω_c·T_c
 *  keeps constant as both gears turn — so the mesh, once solved, holds forever. */
export function solveChildPhase(parentT: number, parentPhase0: number, childT: number, beta: number): number {
  return beta + Math.PI - Math.PI / childT + (parentT / childT) * (beta - parentPhase0)
}

/** Fractional tooth position of a gear at world angle θ for a given rotation. */
export function toothPos(theta: number, phase: number, T: number): number {
  return (theta - phase) * T / TAU
}

/** Residual of the mesh invariant for a parent/child pair at time tSec: 0.5 means a
 *  tooth of one sits exactly in a gap of the other. Used by the tests. */
export function meshResidual(parent: Gear, child: Gear, tSec: number): number {
  const beta = Math.atan2(child.cy - parent.cy, child.cx - parent.cx)
  const pp = parent.phase0 + parent.omega * tSec
  const cp = child.phase0 + child.omega * tSec
  const sum = toothPos(beta, pp, parent.T) + toothPos(beta + Math.PI, cp, child.T)
  return ((sum % 1) + 1) % 1
}

function makeGear(
  index: number, parent: number, depth: number, cx: number, cy: number,
  T: number, sign: number, phase0: number, toothDepth: number,
): Gear {
  const rp = MODULE * T / 2
  const { rim, rOut } = buildRim(T, rp, toothDepth)
  return {
    index, parent, depth, cx, cy, T, rp, rOut, rHub: hubRadius(rp),
    sign, phase0, phase: phase0, omega: 0, rim,
    col: gearColors('brass', index),
  }
}

/** True if a candidate gear (non-parent) tooth-tips would overlap any existing gear.
 *  Meshing parent is excluded — it is meant to sit at pitch distance (< rOut sum).
 *  Everyone else must clear tip+tip plus a small gap so no accidental collision. */
function collides(gears: Gear[], cx: number, cy: number, rOut: number, parentIdx: number): boolean {
  for (const g of gears) {
    if (g.index === parentIdx) continue
    const dx = cx - g.cx, dy = cy - g.cy
    if (Math.hypot(dx, dy) < g.rOut + rOut + MODULE * 0.18) return true
  }
  return false
}

/** Attempt to place a child of `parent` at world direction `beta`. Returns the gear
 *  (added to `gears`) or null on collision. */
function tryPlace(
  gears: Gear[], parent: Gear, beta: number, T: number, toothDepth: number,
): Gear | null {
  const rp = MODULE * T / 2
  const { rOut } = buildRim(T, rp, toothDepth)
  const d = parent.rp + rp
  const cx = parent.cx + d * Math.cos(beta)
  const cy = parent.cy + d * Math.sin(beta)
  if (collides(gears, cx, cy, rOut, parent.index)) return null
  const phase0 = solveChildPhase(parent.T, parent.phase0, T, beta)
  const g = makeGear(gears.length, parent.index, parent.depth + 1, cx, cy, T, -parent.sign, phase0, toothDepth)
  gears.push(g)
  return g
}

/** Resolve every gear's signed angular speed: ω_i = sign_i · driveSpeed · T_root/T_i,
 *  so |ω_i·T_i| is constant across the whole connected train (the root turns at
 *  exactly driveSpeed) and the sign alternates across each mesh. Pure — reused live
 *  when the drive speed changes without re-seeding. */
export function resolveOmega(gears: Gear[], driveSpeed: number): void {
  if (gears.length === 0) return
  const rootT = gears[0].T
  for (const g of gears) g.omega = g.sign * driveSpeed * rootT / g.T
}

/** Grow the connected gear train deterministically from the seed. A pure tree (each
 *  gear meshes with exactly one existing parent) — no cycles, so the phase/ratio
 *  solve is always consistent. */
export function buildGears(cfg: PinionConfig): Gear[] {
  const rng = mulberry32(cfg.seed >>> 0)
  const lo = Math.min(cfg.teethMin, cfg.teethMax)
  const hi = Math.max(cfg.teethMin, cfg.teethMax)
  const pickT = () => lo + Math.floor(rng() * (hi - lo + 1))
  const td = cfg.toothDepth
  const count = cfg.gearCount
  const ATTEMPTS = 120

  const gears: Gear[] = []
  // Root gear at the virtual origin. Ring gets a big sun; others a random size.
  const rootT = cfg.layout === 'ring' ? hi : pickT()
  gears.push(makeGear(0, -1, 0, 0, 0, rootT, 1, 0, td))

  if (cfg.layout === 'chain') {
    let heading = rng() * TAU
    let last = gears[0]
    for (let i = 1; i < count; i++) {
      let placed: Gear | null = null
      for (let a = 0; a < ATTEMPTS && !placed; a++) {
        const fromLast = a < ATTEMPTS * 0.65
        const parent = fromLast ? last : gears[Math.floor(rng() * gears.length)]
        const beta = fromLast
          ? heading + (rng() - 0.5) * 1.6 // wander the train
          : rng() * TAU
        const g = tryPlace(gears, parent, beta, pickT(), td)
        if (g) { placed = g; if (parent === last) { heading = beta; last = g } }
      }
      if (!placed) break // train boxed in — stop early
    }
  } else if (cfg.layout === 'ring') {
    const sun = gears[0]
    let angle = rng() * TAU
    let i = 1
    // First: pack planet gears around the sun.
    let scanned = 0
    while (i < count && scanned < TAU * 2.2) {
      const T = pickT()
      const g = tryPlace(gears, sun, angle, T, td)
      if (g) {
        i++
        angle += (g.rp * 2.3) / (sun.rp + g.rp) // step past the planet just placed
        scanned += (g.rp * 2.3) / (sun.rp + g.rp)
      } else {
        angle += 0.14
        scanned += 0.14
      }
    }
    // Overflow: bud remaining gears off random non-sun gears.
    for (; i < count; i++) {
      let placed: Gear | null = null
      for (let a = 0; a < ATTEMPTS && !placed; a++) {
        const parent = gears[1 + Math.floor(rng() * (gears.length - 1))] ?? sun
        placed = tryPlace(gears, parent, rng() * TAU, pickT(), td)
      }
      if (!placed) break
    }
  } else {
    // cluster: bud each new gear off a random existing gear in a random free direction.
    for (let i = 1; i < count; i++) {
      let placed: Gear | null = null
      for (let a = 0; a < ATTEMPTS && !placed; a++) {
        const parent = gears[Math.floor(rng() * gears.length)]
        placed = tryPlace(gears, parent, rng() * TAU, pickT(), td)
      }
      if (!placed) break
    }
  }

  resolveOmega(gears, cfg.driveSpeed)
  return gears
}

function computeBBox(gears: Gear[]): PinionState['bbox'] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const g of gears) {
    if (g.cx - g.rOut < minX) minX = g.cx - g.rOut
    if (g.cy - g.rOut < minY) minY = g.cy - g.rOut
    if (g.cx + g.rOut > maxX) maxX = g.cx + g.rOut
    if (g.cy + g.rOut > maxY) maxY = g.cy + g.rOut
  }
  if (!isFinite(minX)) { minX = -1; minY = -1; maxX = 1; maxY = 1 }
  return { minX, minY, maxX, maxY }
}

export function createPinionState(cfg: PinionConfig, w: number, h: number): PinionState {
  const gears = buildGears(cfg)
  const state: PinionState = { gears, cfg, w, h, bbox: computeBBox(gears) }
  resolveColors(state)
  return state
}

/** Advance every gear's rotation by dt (ms). */
export function stepPinion(state: PinionState, dt: number): void {
  const dts = dt / 1000
  for (const g of state.gears) g.phase = (g.phase + g.omega * dts) % TAU
}

/** Fit the train's virtual bounding box into the live canvas (centred, scaled by
 *  `fill`). Recomputed each frame from w/h so resize just re-fits — no regen. */
function fitTransform(state: PinionState): { s: number; tx: number; ty: number } {
  const { minX, minY, maxX, maxY } = state.bbox
  const bw = Math.max(1e-6, maxX - minX)
  const bh = Math.max(1e-6, maxY - minY)
  const s = state.cfg.fill * Math.min(state.w / bw, state.h / bh)
  const cxV = (minX + maxX) / 2
  const cyV = (minY + maxY) / 2
  return { s, tx: state.w / 2 - cxV * s, ty: state.h / 2 - cyV * s }
}

/** Trace a gear's rim into the current path (screen space), rotated by its live
 *  phase. Rotates each precomputed local vertex by (cosφ,sinφ) — 2 trig per gear,
 *  not per vertex. */
function pathGear(ctx: CanvasRenderingContext2D, g: Gear, s: number, tx: number, ty: number): void {
  const cosp = Math.cos(g.phase), sinp = Math.sin(g.phase)
  const rim = g.rim
  const n = rim.length
  ctx.beginPath()
  for (let i = 0; i < n; i += 2) {
    const lx = rim[i], ly = rim[i + 1]
    const rx = lx * cosp - ly * sinp
    const ry = lx * sinp + ly * cosp
    const X = tx + (g.cx + rx) * s
    const Y = ty + (g.cy + ry) * s
    if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y)
  }
  ctx.closePath()
}

/** Spokes + inner rim ring for a big-enough gear, rotating with the wheel. */
function drawSpokes(
  ctx: CanvasRenderingContext2D, g: Gear, s: number, scx: number, scy: number, color: string,
): void {
  const rpS = g.rp * s
  if (rpS < 24 || g.T < 9) return
  const count = rpS > 58 ? 6 : 4
  const rInner = g.rHub * s * 1.05
  const rReach = g.rp * s * 0.78
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.2, rpS * 0.09)
  ctx.lineCap = 'round'
  for (let k = 0; k < count; k++) {
    const a = g.phase + k * TAU / count
    ctx.beginPath()
    ctx.moveTo(scx + rInner * Math.cos(a), scy + rInner * Math.sin(a))
    ctx.lineTo(scx + rReach * Math.cos(a), scy + rReach * Math.sin(a))
    ctx.stroke()
  }
  // inner ring
  ctx.lineWidth = Math.max(1, rpS * 0.05)
  ctx.beginPath()
  ctx.arc(scx, scy, rReach, 0, TAU)
  ctx.stroke()
}

/** Draw the whole mechanism fresh: background, then each gear (rim, hub, spokes). */
export function drawPinion(state: PinionState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h } = state
  const dpr = ctx.canvas.width / w
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.lineJoin = 'round'

  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const { s, tx, ty } = fitTransform(state)
  const style = cfg.style

  for (const g of state.gears) {
    const scx = tx + g.cx * s
    const scy = ty + g.cy * s
    const rpS = g.rp * s
    pathGear(ctx, g, s, tx, ty)

    if (style === 'line') {
      ctx.lineWidth = Math.max(1, rpS * 0.06)
      ctx.strokeStyle = g.col.fill
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(scx, scy, g.rHub * s, 0, TAU)
      ctx.stroke()
      drawSpokes(ctx, g, s, scx, scy, g.col.fill)
      continue
    }

    // filled rim (solid + brass)
    ctx.fillStyle = g.col.fill
    ctx.fill()
    ctx.lineWidth = Math.max(1, rpS * 0.05)
    ctx.strokeStyle = g.col.outline
    ctx.stroke()

    if (style === 'brass') {
      // highlight ring just inside the teeth for a metallic sheen
      ctx.lineWidth = Math.max(1, rpS * 0.06)
      ctx.strokeStyle = g.col.highlight
      ctx.beginPath()
      ctx.arc(scx, scy, g.rp * s * 0.9, 0, TAU)
      ctx.stroke()
    }

    drawSpokes(ctx, g, s, scx, scy, g.col.spoke)

    // hub + centre bolt
    ctx.beginPath()
    ctx.arc(scx, scy, g.rHub * s, 0, TAU)
    ctx.fillStyle = g.col.hub
    ctx.fill()
    ctx.lineWidth = Math.max(1, rpS * 0.04)
    ctx.strokeStyle = g.col.outline
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(scx, scy, g.rHub * s * 0.38, 0, TAU)
    ctx.fillStyle = g.col.bolt
    ctx.fill()
  }
}

/** Live-apply a config change. Structural edits (counts, sizes, layout, seed, tooth
 *  depth — all change geometry) rebuild → return false to re-run setup. Drive speed
 *  recomputes ω from each gear's seed-stable sign/T without disturbing phase; style /
 *  palette / background / fill apply live. */
export function updatePinion(state: PinionState, cfg: PinionConfig, w: number, h: number): boolean {
  const c = state.cfg
  if (
    cfg.gearCount !== c.gearCount || cfg.teethMin !== c.teethMin || cfg.teethMax !== c.teethMax
    || cfg.layout !== c.layout || cfg.seed !== c.seed || cfg.toothDepth !== c.toothDepth
  ) return false
  if (cfg.driveSpeed !== c.driveSpeed) resolveOmega(state.gears, cfg.driveSpeed)
  const recolor = cfg.palette !== c.palette
  state.cfg = cfg
  state.w = w
  state.h = h
  if (recolor) resolveColors(state)
  return true
}
