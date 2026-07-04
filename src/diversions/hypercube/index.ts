// Hypercube / Tesseract (GH #104) — a glowing 4-D wireframe endlessly turning
// inside-out through the fourth dimension. The framework owns the rAF loop and calls
// frame() each tick; the whole scene is redrawn every frame (background → depth-sorted
// glowing edges → corner dots, all LIVE — nothing is baked), so every control edits
// live and there is no accumulation buffer to bleed. The load-bearing part — the 4-D
// rotation + double perspective projection — lives in the pure, tested `geometry` module.
import { defineDiversion, type Size } from '../../framework/types'
import { hypercubeSchema, type HypercubeConfig } from './schema'
import {
  buildPolytope, rotate, project, buildSeedState,
  type PolytopeMesh, type PlaneRotation, type Projected, type SeedState,
} from './geometry'
import { parseHex6, mix, rgba, hslToRgb, type RGB } from '../../framework/color'

const TAU = Math.PI * 2
// Fraction of the short screen side the wireframe fills; distance-compensated so the
// object stays a roughly constant size as the projection distance is tuned.
const FIT = 0.16

// The rotation planes we animate, tagged by which schema speed drives each. Axis
// indices: 0=x 1=y 2=z 3=w 4=v(5th). The *W planes fold through the 4th dimension.
type PlaneRole = 'xw' | 'yw' | 'zw' | 'spin' | 'extraA' | 'extraB'
interface PlaneDef { i: number; j: number; role: PlaneRole }

const PLANES_4D: PlaneDef[] = [
  { i: 0, j: 3, role: 'xw' },
  { i: 1, j: 3, role: 'yw' },
  { i: 2, j: 3, role: 'zw' },
  { i: 0, j: 2, role: 'spin' }, // ordinary 3-D tumble in the X–Z plane
]
// The penteract adds the 5th axis (index 4): two more planes so it genuinely folds
// through the extra dimension, driven off the primary speeds.
const PLANES_5D: PlaneDef[] = [
  ...PLANES_4D,
  { i: 3, j: 4, role: 'extraA' },
  { i: 1, j: 4, role: 'extraB' },
]

function planesFor(dim: number): PlaneDef[] {
  return dim === 5 ? PLANES_5D : PLANES_4D
}

function speedFor(role: PlaneRole, cfg: HypercubeConfig): number {
  switch (role) {
    case 'xw': return cfg.speedXW
    case 'yw': return cfg.speedYW
    case 'zw': return cfg.speedZW
    case 'spin': return cfg.spin3D
    case 'extraA': return cfg.speedXW * 0.55 // the 5th dim always turns off the mains
    case 'extraB': return cfg.speedYW * 0.45
  }
}

interface HypercubeState {
  cfg: HypercubeConfig
  w: number
  h: number
  mesh: PolytopeMesh
  planes: PlaneDef[]
  angles: number[] // live rotation angle per plane (accumulated)
  seedState: SeedState
  proj: Projected[] // scratch reused each frame (one per vertex) — no per-frame alloc
}

function initState(cfg: HypercubeConfig, size: Size): HypercubeState {
  const mesh = buildPolytope(cfg.polytope)
  const planes = planesFor(mesh.dim)
  const seedState = buildSeedState(cfg.seed, planes.length)
  return {
    cfg,
    w: size.width,
    h: size.height,
    mesh,
    planes,
    angles: seedState.angles.slice(),
    seedState,
    proj: mesh.verts.map(() => ({ x: 0, y: 0, depth: 0 })),
  }
}

// ─── Colour ────────────────────────────────────────────────────────────────────────
function scaleRGB(c: RGB, f: number): RGB {
  return { r: c.r * f, g: c.g * f, b: c.b * f }
}

/** Colour for one edge given its normalized depth t (0 = farthest, 1 = nearest). */
function edgeColor(cfg: HypercubeConfig, near: RGB, far: RGB, idx: number, count: number, t: number): RGB {
  if (cfg.colorMode === 'single') return scaleRGB(near, 0.32 + 0.68 * t)
  if (cfg.colorMode === 'spectrum') return hslToRgb((idx / Math.max(1, count)) * 360, 82, 40 + 26 * t)
  return mix(far, near, t) // 'depth'
}

const hypercube = defineDiversion<typeof hypercubeSchema, HypercubeState, '2d'>({
  id: 'hypercube',
  title: 'Hypercube',
  description: 'A glowing 4-D wireframe tesseract endlessly turning inside-out through the '
    + 'fourth dimension — the inner cube swelling to become the outer and back. Also a '
    + '16-cell and a 5-cube.',
  kind: '2d',
  schema: hypercubeSchema,

  setup(ctx, config, size) {
    const state = initState(config, size)
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    const cfg = state.cfg
    const { w, h, mesh, planes, angles, proj, seedState } = state
    const dts = dt / 1000

    // Advance each plane's angle (frame-rate independent), with the seed's mild jitter.
    const rots: PlaneRotation[] = []
    for (let k = 0; k < planes.length; k++) {
      angles[k] += speedFor(planes[k].role, cfg) * seedState.mul[k] * dts
      rots.push({ i: planes[k].i, j: planes[k].j, angle: angles[k] })
    }

    // Rotate + project every vertex; track the depth range for shading.
    let minD = Infinity, maxD = -Infinity
    for (let v = 0; v < mesh.verts.length; v++) {
      const p = project(rotate(mesh.verts[v], rots), cfg.proj4Distance, cfg.proj3Distance)
      proj[v] = p
      if (p.depth < minD) minD = p.depth
      if (p.depth > maxD) maxD = p.depth
    }
    const span = Math.max(1e-6, maxD - minD)

    // Background painted LIVE every frame (opaque) — crisp, live-editable, no bleed.
    ctx.fillStyle = cfg.background
    ctx.fillRect(0, 0, w, h)

    const cx = w / 2, cy = h / 2
    const scale = Math.min(w, h) * FIT * cfg.proj4Distance * cfg.zoom
    const near = parseHex6(cfg.nearColor)
    const far = parseHex6(cfg.farColor)

    // Depth-sort edges (far → near) so nearer, brighter edges draw on top.
    const edges = mesh.edges
    const order = edges.map((_, i) => i)
    const edgeDepth = edges.map(([a, b]) => (proj[a].depth + proj[b].depth) * 0.5)
    order.sort((i, j) => edgeDepth[i] - edgeDepth[j])

    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const ei of order) {
      const [a, b] = edges[ei]
      const pa = proj[a], pb = proj[b]
      const t = (edgeDepth[ei] - minD) / span // 0 far … 1 near
      const col = edgeColor(cfg, near, far, ei, edges.length, t)
      const x0 = cx + pa.x * scale, y0 = cy + pa.y * scale
      const x1 = cx + pb.x * scale, y1 = cy + pb.y * scale
      const lw = cfg.lineWidth * (0.4 + 0.6 * t)

      // Two-layer glow: a wide low-alpha halo under an opaque bright core — keeps the
      // colour from blowing out to white where edges cross (no additive 'lighter').
      if (cfg.glow > 0) {
        ctx.strokeStyle = rgba(col, cfg.glow * (0.3 + 0.7 * t))
        ctx.lineWidth = lw * 3 + 1.5
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      }
      ctx.strokeStyle = rgba(col, 0.45 + 0.55 * t)
      ctx.lineWidth = lw
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
    }

    // Corner dots, brighter/larger when nearer.
    if (cfg.vertices) {
      for (let v = 0; v < mesh.verts.length; v++) {
        const p = proj[v]
        const t = (p.depth - minD) / span
        const col = edgeColor(cfg, near, far, 0, 1, t)
        ctx.fillStyle = rgba(col, 0.5 + 0.5 * t)
        ctx.beginPath()
        ctx.arc(cx + p.x * scale, cy + p.y * scale, cfg.lineWidth * (0.5 + 0.7 * t), 0, TAU)
        ctx.fill()
      }
    }
  },

  resize(state, size, ctx) {
    // Viewport-independent geometry: just track the new size (do NOT rebuild — the
    // ResizeObserver fires on every fullscreen/drag reflow). Repaint the ground.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config, size) {
    // Structural fields rebuild the mesh / plane set / seeded orientation → re-setup.
    const c = state.cfg
    if (config.polytope !== c.polytope || config.seed !== c.seed) {
      const next = initState(config, size)
      next.w = state.w; next.h = state.h // keep the live canvas size
      Object.assign(state, next)
      return true
    }
    state.cfg = config // everything else (speeds, distances, colours, style) is live
    return true
  },
})

export default hypercube
