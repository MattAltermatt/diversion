// Platonic Folding (GH #114) — a Platonic solid's flattened net folds itself shut into
// the solid, turns slowly in a fixed key light, then unfolds flat again: origami built
// from hinge geometry, not paper. Inspired by the unfolding-polyhedra lineage of
// xscreensaver hacks (jwz's `polyhedra` / `polytopes`); this fold-tree construction
// (dihedral angles derived straight from the assembled solid's own face normals — see
// geometry.ts) and the rendering are an original, clean-room implementation.
//
// The whole show is a small phase state machine (net → folding → spin → settle →
// unfolding → next) driving one scalar `fold` ∈ [0,1] and a `(yaw, pitch)` camera
// orientation; the load-bearing 3-D math (solid topology, fold tree, per-face world
// transforms) lives in the pure, tested `geometry` module.
import { defineDiversion, type Size } from '../../framework/types'
import { platonicFoldingSchema, type PlatonicFoldingConfig } from './schema'
import { palettePresets } from './presets'
import {
  PLATONIC_SOLIDS, buildFoldMesh, computeWorldTransforms, applyAffine, matVec, matMul,
  rotationMatrixAboutAxis, project, clamp, dot, easeInOutCubic, lerpAngleShortest,
  pickCycleStart, deriveTreeSeed, type FoldTree, type Vec3,
} from './geometry'
import { mulberry32 } from '../../framework/rng'
import { parseHex6, rgba, type RGB } from '../../framework/color'

const CAM_DIST = 3
const FIT = 0.32
const LIGHT_DIR: Vec3 = { x: 0.4, y: 0.55, z: 0.75 }
const REST_YAW = 0.6
const REST_PITCH = 0.34
const NET_HOLD = 1.2 // seconds the flat net is held before it starts folding
const SETTLE_DURATION = 1 // seconds to ease the tumble back to rest before unfolding

type Phase = 'net' | 'folding' | 'spin' | 'settle' | 'unfolding'

interface PFState {
  cfg: PlatonicFoldingConfig
  w: number
  h: number
  startIdx: number // seeded starting index into PLATONIC_SOLIDS (cycle mode)
  cycleCount: number
  tree: FoldTree
  phase: Phase
  phaseT: number
  fold: number
  yaw: number
  pitch: number
  yawAtSpinEnd: number
  pitchAtSpinEnd: number
  yawRate: number
  pitchRate: number
}

function kindForCycle(cfg: PlatonicFoldingConfig, startIdx: number, cycleCount: number) {
  if (cfg.solid !== 'cycle') return cfg.solid
  return PLATONIC_SOLIDS[(startIdx + cycleCount) % PLATONIC_SOLIDS.length]
}

function seedRates(cfg: PlatonicFoldingConfig, treeSeed: number) {
  const rng = mulberry32(treeSeed ^ 0x51ed270b)
  const dir = rng() < 0.5 ? -1 : 1
  return {
    yawRate: cfg.rotationSpeed * (0.85 + rng() * 0.3) * dir,
    pitchRate: cfg.rotationSpeed * 0.45 * (0.85 + rng() * 0.3) * (rng() < 0.5 ? -1 : 1),
  }
}

function initState(cfg: PlatonicFoldingConfig, size: Size): PFState {
  const startIdx = pickCycleStart(cfg.seed)
  const cycleCount = 0
  const kind = kindForCycle(cfg, startIdx, cycleCount)
  const treeSeed = deriveTreeSeed(cfg.seed, cycleCount)
  const tree = buildFoldMesh(kind, treeSeed)
  const rates = seedRates(cfg, treeSeed)
  return {
    cfg, w: size.width, h: size.height,
    startIdx, cycleCount, tree,
    phase: 'net', phaseT: 0, fold: 0,
    yaw: REST_YAW, pitch: REST_PITCH,
    yawAtSpinEnd: REST_YAW, pitchAtSpinEnd: REST_PITCH,
    yawRate: rates.yawRate, pitchRate: rates.pitchRate,
  }
}

function advanceCycle(state: PFState) {
  state.cycleCount += 1
  const kind = kindForCycle(state.cfg, state.startIdx, state.cycleCount)
  const treeSeed = deriveTreeSeed(state.cfg.seed, state.cycleCount)
  state.tree = buildFoldMesh(kind, treeSeed)
  const rates = seedRates(state.cfg, treeSeed)
  state.yawRate = rates.yawRate
  state.pitchRate = rates.pitchRate
}

function advancePhase(state: PFState, dts: number) {
  state.phaseT += dts
  const cfg = state.cfg
  switch (state.phase) {
    case 'net': {
      state.fold = 0; state.yaw = REST_YAW; state.pitch = REST_PITCH
      if (state.phaseT >= NET_HOLD) { state.phase = 'folding'; state.phaseT = 0 }
      break
    }
    case 'folding': {
      const s = clamp(state.phaseT / cfg.foldDuration, 0, 1)
      state.fold = easeInOutCubic(s)
      state.yaw = REST_YAW; state.pitch = REST_PITCH
      if (s >= 1) { state.phase = 'spin'; state.phaseT = 0; state.fold = 1 }
      break
    }
    case 'spin': {
      state.fold = 1
      state.yaw += state.yawRate * dts
      state.pitch += state.pitchRate * dts
      if (state.phaseT >= cfg.holdDuration) {
        state.yawAtSpinEnd = state.yaw
        state.pitchAtSpinEnd = state.pitch
        state.phase = 'settle'; state.phaseT = 0
      }
      break
    }
    case 'settle': {
      const s = clamp(state.phaseT / SETTLE_DURATION, 0, 1)
      const e = easeInOutCubic(s)
      state.yaw = lerpAngleShortest(state.yawAtSpinEnd, REST_YAW, e)
      state.pitch = lerpAngleShortest(state.pitchAtSpinEnd, REST_PITCH, e)
      state.fold = 1
      if (s >= 1) { state.phase = 'unfolding'; state.phaseT = 0 }
      break
    }
    case 'unfolding': {
      const s = clamp(state.phaseT / cfg.foldDuration, 0, 1)
      state.fold = 1 - easeInOutCubic(s)
      state.yaw = REST_YAW; state.pitch = REST_PITCH
      if (s >= 1) {
        advanceCycle(state)
        state.phase = 'net'; state.phaseT = 0; state.fold = 0
      }
      break
    }
  }
}

// ─── Colour ────────────────────────────────────────────────────────────────────
function scaleRGB(c: RGB, f: number): RGB {
  const clampCh = (v: number) => Math.max(0, Math.min(255, v))
  return { r: clampCh(c.r * f), g: clampCh(c.g * f), b: clampCh(c.b * f) }
}

function render(state: PFState, ctx: CanvasRenderingContext2D) {
  const cfg = state.cfg
  const { w, h, tree, fold, yaw, pitch } = state
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, w, h)

  const transforms = computeWorldTransforms(tree, fold)
  const rot = matMul(rotationMatrixAboutAxis({ x: 0, y: 1, z: 0 }, yaw), rotationMatrixAboutAxis({ x: 1, y: 0, z: 0 }, pitch))
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) * FIT * CAM_DIST
  const palette = cfg.palette

  const faces = tree.mesh.faces.map((loop, fi) => {
    const pts = loop.map((vi) => matVec(rot, applyAffine(transforms[fi], tree.mesh.verts[vi])))
    const normal = matVec(rot, matVec(transforms[fi].m, tree.mesh.faceNormals[fi]))
    const avgZ = pts.reduce((s, p) => s + p.z, 0) / pts.length
    return { pts, normal, avgZ, color: palette[tree.depth[fi] % palette.length] }
  })
  // Painter's algorithm, far → near — exact for a convex solid, a reasonable
  // approximation during the (briefly non-convex) fold transient.
  faces.sort((a, b) => a.avgZ - b.avgZ)

  ctx.lineJoin = 'round'
  for (const face of faces) {
    const proj = face.pts.map((p) => project(p, CAM_DIST))
    const light = clamp(dot(face.normal, LIGHT_DIR), 0, 1)
    const shade = (1 - cfg.lightContrast) * 0.55 + cfg.lightContrast * light
    const col = scaleRGB(parseHex6(face.color), 0.4 + 0.9 * shade)

    ctx.beginPath()
    proj.forEach((p, i) => {
      const x = cx + p.x * scale, y = cy - p.y * scale
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    })
    ctx.closePath()

    if (cfg.renderMode === 'filled') {
      if (cfg.glow > 0) {
        ctx.strokeStyle = rgba(col, cfg.glow)
        ctx.lineWidth = cfg.lineWidth * 3 + 1.5
        ctx.stroke()
      }
      ctx.fillStyle = rgba(col, 1)
      ctx.fill()
      ctx.strokeStyle = rgba(scaleRGB(col, 0.55), 0.9)
      ctx.lineWidth = cfg.lineWidth * 0.6
      ctx.stroke()
    } else {
      if (cfg.glow > 0) {
        ctx.strokeStyle = rgba(col, cfg.glow)
        ctx.lineWidth = cfg.lineWidth * 3 + 1
        ctx.stroke()
      }
      ctx.strokeStyle = rgba(col, 0.5 + 0.5 * shade)
      ctx.lineWidth = cfg.lineWidth
      ctx.stroke()
    }
  }
}

const platonicFolding = defineDiversion<typeof platonicFoldingSchema, PFState, '2d'>({
  id: 'platonic-folding',
  title: 'Platonic Folding',
  description: "A Platonic solid's flattened net folds itself shut into shape, turns slowly in "
    + 'the light, then unfolds flat again — origami built from hinge geometry, not paper. '
    + "Inspired by the unfolding-polyhedra lineage of jwz's xscreensaver hacks (polyhedra / "
    + 'polytopes); this fold construction and rendering are an original implementation.',
  kind: '2d',
  schema: platonicFoldingSchema,

  setup(ctx, config, size) {
    const state = initState(config, size)
    ctx.fillStyle = config.background
    ctx.fillRect(0, 0, size.width, size.height)
    return state
  },

  frame(state, ctx, _t, dt) {
    advancePhase(state, dt / 1000)
    render(state, ctx)
  },

  resize(state, size, ctx) {
    // Viewport-independent geometry: just track the new size, never rebuild the mesh.
    state.w = size.width
    state.h = size.height
    ctx.fillStyle = state.cfg.background
    ctx.fillRect(0, 0, size.width, size.height)
  },

  update(state, config, size) {
    const c = state.cfg
    if (config.solid !== c.solid || config.seed !== c.seed) {
      const next = initState(config, size)
      next.w = state.w; next.h = state.h
      Object.assign(state, next)
      return true
    }
    state.cfg = config // motion/style/color all apply live
    return true
  },

  presets: [{ label: 'Palette', options: palettePresets }],
})

export default platonicFolding
