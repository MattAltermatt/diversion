import { mulberry32 } from '../../framework/rng'
import type { CrystalConfig } from './schema'
import {
  resolveGroup, basisMat, cartOrient, applyM, type WallpaperGroup, type Mat,
} from './groups'
import { resolvePalette } from './palettes'

// ── Motif ───────────────────────────────────────────────────────────────────
// A small cluster of rigid shapes placed inside one fundamental domain (a corner
// wedge of the cell). The group's ops replicate it across the plane. Each shape
// is drawn in local pixel coordinates so it stays undistorted; only its anchor
// rides the (possibly sheared) lattice.

export type ShapeType = 'disc' | 'ring' | 'bar' | 'tri' | 'petal'
export type Shape = {
  type: ShapeType
  u: number // fractional anchor in the cell (0..1)
  v: number
  size: number // fraction of cellSize
  angle: number // local orientation (rad)
  color: string
}

const SHAPE_TYPES: ShapeType[] = ['disc', 'ring', 'bar', 'tri', 'petal']

/** Deterministic motif from the seed — same seed → identical shapes. */
export function buildMotif(seed: number, complexity: number, colors: string[]): Shape[] {
  const rnd = mulberry32((seed ^ 0x2f1b3c7d) >>> 0)
  const n = Math.max(1, Math.min(8, complexity))
  const shapes: Shape[] = []
  for (let i = 0; i < n; i++) {
    shapes.push({
      type: SHAPE_TYPES[Math.floor(rnd() * SHAPE_TYPES.length)],
      // keep anchors within a corner wedge so the symmetry copies read clearly
      u: 0.1 + rnd() * 0.5,
      v: 0.1 + rnd() * 0.5,
      size: 0.12 + rnd() * 0.22,
      angle: rnd() * Math.PI * 2,
      color: colors[Math.floor(rnd() * colors.length)],
    })
  }
  return shapes
}

// ── State ─────────────────────────────────────────────────────────────────
export type CrystalState = {
  cfg: CrystalConfig
  w: number
  h: number
  group: WallpaperGroup
  motif: Shape[]
  colors: string[]
  driftPhase: number // accumulates dt·driftSpeed
  elapsed: number //     ms since (re)seed, for the reseed cycle
}

export function createState(cfg: CrystalConfig, w: number, h: number): CrystalState {
  const group = resolveGroup(cfg.group, cfg.seed)
  const colors = resolvePalette(cfg.palette, cfg.seed)
  const motif = buildMotif(cfg.seed, cfg.motifComplexity, colors)
  return { cfg, w, h, group, motif, colors, driftPhase: 0, elapsed: 0 }
}

/** Rebuild the derived group/motif/palette when a structural field changes. */
export function rebuild(st: CrystalState): void {
  st.group = resolveGroup(st.cfg.group, st.cfg.seed)
  st.colors = resolvePalette(st.cfg.palette, st.cfg.seed)
  st.motif = buildMotif(st.cfg.seed, st.cfg.motifComplexity, st.colors)
}

// ── Tiling range ────────────────────────────────────────────────────────────
const DRIFT_ROT = 0.03 //  rad per unit driftPhase (very slow, zen)
const DRIFT_TRANS = 0.05 // fractional-cell glide per unit driftPhase

/** Symmetric integer lattice-offset radius that guarantees the finite stamp
 *  loop covers the whole viewport (plus a margin) with no gaps. */
export function offsetRadius(grp: WallpaperGroup, w: number, h: number, cellSize: number): number {
  const screenR = Math.hypot(w, h) / 2
  const l1 = Math.hypot(grp.b1[0], grp.b1[1])
  const l2 = Math.hypot(grp.b2[0], grp.b2[1])
  const minLen = Math.min(l1, l2)
  return Math.ceil(screenR / (cellSize * minLen)) + 3
}

// ── Render ──────────────────────────────────────────────────────────────────
export function render(st: CrystalState, ctx: CanvasRenderingContext2D): void {
  const { cfg, w, h, group, motif } = st
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const cs = cfg.cellSize
  const B = basisMat(group)
  const R = offsetRadius(group, w, h, cs)

  // whole-lattice drift: a slow rotation + a fractional glide
  const ang = st.driftPhase * DRIFT_ROT
  const ca = Math.cos(ang), sa = Math.sin(ang)
  const glide = st.driftPhase * DRIFT_TRANS
  const gu = glide, gv = glide * 0.5 // drift direction in fractional coords

  const cx = w / 2, cy = h / 2
  const base = ctx.getTransform() // the framework's DPR transform — compose on top

  // Cartesian→screen: rotate by drift, scale by cellSize, offset to centre.
  const toScreen = (fx: number, fy: number): [number, number] => {
    const c = applyM(B, fx, fy) // fractional → Cartesian (cell units)
    const sx = (c[0] * ca - c[1] * sa) * cs
    const sy = (c[0] * sa + c[1] * ca) * cs
    return [cx + sx, cy + sy]
  }

  // Precompute the per-op, per-shape data that doesn't depend on the lattice
  // cell (n,m): stamp orientation (drift ∘ B·M·B⁻¹) and each shape's base
  // fractional anchor. The hot n/m loop then only adds the cell offset.
  type Stamp = { l00: number; l10: number; l01: number; l11: number; fu0: number; fv0: number; s: Shape }
  const stamps: Stamp[] = []
  for (const o of group.ops) {
    const O: Mat = cartOrient(group, o.m) // orthogonal → motif stays rigid
    const l00 = ca * O[0] - sa * O[2]
    const l10 = sa * O[0] + ca * O[2]
    const l01 = ca * O[1] - sa * O[3]
    const l11 = sa * O[1] + ca * O[3]
    for (const s of motif) {
      const a = applyM(o.m, s.u, s.v) // op ∘ shape-anchor (+ op glide + drift glide)
      stamps.push({ l00, l10, l01, l11, fu0: a[0] + o.t[0] + gu, fv0: a[1] + o.t[1] + gv, s })
    }
  }

  for (const st2 of stamps) {
    for (let n = -R; n <= R; n++) {
      for (let m = -R; m <= R; m++) {
        const [px, py] = toScreen(st2.fu0 + n, st2.fv0 + m)
        if (px < -cs || px > w + cs || py < -cs || py > h + cs) continue // cull off-screen
        ctx.setTransform(base)
        ctx.transform(st2.l00, st2.l10, st2.l01, st2.l11, px, py) // orient at the anchor
        ctx.rotate(st2.s.angle)
        drawShape(ctx, st2.s, cs)
      }
    }
  }
  ctx.setTransform(base) // restore for the next frame's background fill
}

function drawShape(ctx: CanvasRenderingContext2D, s: Shape, cellSize: number): void {
  const r = s.size * cellSize
  ctx.fillStyle = s.color
  ctx.strokeStyle = s.color
  switch (s.type) {
    case 'disc':
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'ring':
      ctx.lineWidth = Math.max(1.5, r * 0.34)
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'bar': {
      const hw = r, hh = Math.max(1.5, r * 0.24)
      ctx.beginPath()
      ctx.rect(-hw, -hh, hw * 2, hh * 2)
      ctx.fill()
      break
    }
    case 'tri':
      ctx.beginPath()
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 - Math.PI / 2
        const x = Math.cos(a) * r, y = Math.sin(a) * r
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.fill()
      break
    case 'petal': {
      // a leaf: two symmetric quadratic curves from tip to tip
      ctx.beginPath()
      ctx.moveTo(-r, 0)
      ctx.quadraticCurveTo(0, r * 0.7, r, 0)
      ctx.quadraticCurveTo(0, -r * 0.7, -r, 0)
      ctx.closePath()
      ctx.fill()
      break
    }
  }
}
