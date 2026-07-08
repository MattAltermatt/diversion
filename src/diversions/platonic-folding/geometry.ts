// Platonic Folding — the pure 3-D fold math: build a Platonic solid's exact vertex/face
// topology, derive a "fold tree" (a spanning tree of the face-adjacency graph, one hinge
// per tree edge), and evaluate every face's world position at any fold parameter t∈[0,1].
// All framework-agnostic + deterministic (no DOM, no global Math.random) so it is fully
// unit-testable and a given seed always yields the same net + fold.
//
// The trick that makes this tractable without hand-authoring nets: every hinge's fold
// angle is derived directly from the ASSEMBLED solid's own geometry — the angle between
// the two adjacent faces' outward normals — so there is no separate "unfolded 2-D net"
// representation to construct by hand. At fold=1 every hinge rotation is the identity
// (each face sits at its true assembled position); at fold=0 every hinge has rotated its
// entire child subtree until the child's normal exactly matches its parent's, which by
// induction collapses EVERY face's normal to the root face's normal — i.e. the whole
// mesh goes flat. See `computeWorldTransforms`.
import { mulberry32 } from '../../framework/rng'

export interface Vec3 { x: number; y: number; z: number }

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scaleVec = (a: Vec3, f: number): Vec3 => ({ x: a.x * f, y: a.y * f, z: a.z * f })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const length = (a: Vec3): number => Math.sqrt(dot(a, a))
export const normalize = (a: Vec3): Vec3 => {
  const l = length(a)
  return l < 1e-12 ? { x: 0, y: 0, z: 0 } : scaleVec(a, 1 / l)
}
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x))
export const centroid = (pts: Vec3[]): Vec3 =>
  scaleVec(pts.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), 1 / pts.length)

/** Angle (radians, 0..π) between two vectors. */
export function angleBetween(a: Vec3, b: Vec3): number {
  const na = normalize(a), nb = normalize(b)
  return Math.acos(clamp(dot(na, nb), -1, 1))
}

// ─── Rigid transforms (3×3 rotation + translation, row-major) ──────────────────────
export interface Affine { m: number[]; b: Vec3 }

export const IDENTITY: Affine = { m: [1, 0, 0, 0, 1, 0, 0, 0, 1], b: { x: 0, y: 0, z: 0 } }

export function matMul(a: number[], b: number[]): number[] {
  const r = new Array(9).fill(0) as number[]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let s = 0
      for (let k = 0; k < 3; k++) s += a[i * 3 + k] * b[k * 3 + j]
      r[i * 3 + j] = s
    }
  }
  return r
}

export function matVec(m: number[], v: Vec3): Vec3 {
  return {
    x: m[0] * v.x + m[1] * v.y + m[2] * v.z,
    y: m[3] * v.x + m[4] * v.y + m[5] * v.z,
    z: m[6] * v.x + m[7] * v.y + m[8] * v.z,
  }
}

/** Rodrigues' rotation formula as a 3×3 matrix: rotate by `theta` about unit `axis`. */
export function rotationMatrixAboutAxis(axis: Vec3, theta: number): number[] {
  const { x: kx, y: ky, z: kz } = axis
  const c = Math.cos(theta), s = Math.sin(theta), C = 1 - c
  return [
    kx * kx * C + c, kx * ky * C - kz * s, kx * kz * C + ky * s,
    ky * kx * C + kz * s, ky * ky * C + c, ky * kz * C - kx * s,
    kz * kx * C - ky * s, kz * ky * C + kx * s, kz * kz * C + c,
  ]
}

/** Rotate a free vector (e.g. a normal) about a unit axis through the origin. */
export function rotateVec(v: Vec3, axis: Vec3, theta: number): Vec3 {
  return matVec(rotationMatrixAboutAxis(axis, theta), v)
}

/** A rigid rotation by `theta` about the *line* through point `pivot` with direction `axis`. */
export function rotationTransform(pivot: Vec3, axis: Vec3, theta: number): Affine {
  const m = rotationMatrixAboutAxis(axis, theta)
  const rotatedPivot = matVec(m, pivot)
  return { m, b: sub(pivot, rotatedPivot) }
}

/** Compose two affine transforms: apply `inner` first, then `outer`. */
export function composeAffine(outer: Affine, inner: Affine): Affine {
  return { m: matMul(outer.m, inner.m), b: add(matVec(outer.m, inner.b), outer.b) }
}

export function applyAffine(t: Affine, v: Vec3): Vec3 {
  return add(matVec(t.m, v), t.b)
}

// ─── Solid topology ──────────────────────────────────────────────────────────────
export const PLATONIC_SOLIDS = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'] as const
export type PlatonicSolid = (typeof PLATONIC_SOLIDS)[number]

export interface SolidMesh {
  /** True (assembled) vertex positions, uniformly scaled to a unit circumradius. */
  verts: Vec3[]
  /** Each face is a cyclic loop of vertex indices around its boundary (either winding —
   *  orientation is not load-bearing here; only `faceNormals` needs to be outward-correct). */
  faces: number[][]
  /** Outward unit normal per face, in the true assembled state. */
  faceNormals: Vec3[]
}

function newellNormal(pts: Vec3[]): Vec3 {
  let n: Vec3 = { x: 0, y: 0, z: 0 }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    n = add(n, {
      x: (a.y - b.y) * (a.z + b.z),
      y: (a.z - b.z) * (a.x + b.x),
      z: (a.x - b.x) * (a.y + b.y),
    })
  }
  return normalize(n)
}

/** Uniformly scale to unit circumradius and derive outward-corrected face normals. */
function finalizeSolid(vertsRaw: Vec3[], faces: number[][]): SolidMesh {
  const maxLen = Math.max(...vertsRaw.map(length))
  const verts = vertsRaw.map((v) => scaleVec(v, 1 / maxLen))
  const faceNormals = faces.map((loop) => {
    const pts = loop.map((i) => verts[i])
    const n = newellNormal(pts)
    const c = centroid(pts)
    return dot(n, c) < 0 ? scaleVec(n, -1) : n
  })
  return { verts, faces, faceNormals }
}

function buildTetrahedron(): SolidMesh {
  const verts: Vec3[] = [
    { x: 1, y: 1, z: 1 }, { x: 1, y: -1, z: -1 }, { x: -1, y: 1, z: -1 }, { x: -1, y: -1, z: 1 },
  ]
  const faces = [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]] // each omits one vertex
  return finalizeSolid(verts, faces)
}

function buildCube(): SolidMesh {
  // index bit0=x bit1=y bit2=z, 0 → −1, 1 → +1
  const verts: Vec3[] = []
  for (let i = 0; i < 8; i++) {
    verts.push({ x: i & 1 ? 1 : -1, y: i & 2 ? 1 : -1, z: i & 4 ? 1 : -1 })
  }
  const faces = [
    [0, 1, 3, 2], [4, 5, 7, 6], // z=-1, z=+1
    [0, 1, 5, 4], [2, 3, 7, 6], // y=-1, y=+1
    [0, 2, 6, 4], [1, 3, 7, 5], // x=-1, x=+1
  ]
  return finalizeSolid(verts, faces)
}

function buildOctahedron(): SolidMesh {
  const verts: Vec3[] = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ]
  const faces: number[][] = []
  for (const a of [0, 1]) for (const b of [2, 3]) for (const c of [4, 5]) faces.push([a, b, c])
  return finalizeSolid(verts, faces)
}

/** Canonical icosahedron vertex/face table (golden-rectangle construction). */
function buildIcosahedron(): SolidMesh {
  const t = (1 + Math.sqrt(5)) / 2
  const verts: Vec3[] = [
    { x: -1, y: t, z: 0 }, { x: 1, y: t, z: 0 }, { x: -1, y: -t, z: 0 }, { x: 1, y: -t, z: 0 },
    { x: 0, y: -1, z: t }, { x: 0, y: 1, z: t }, { x: 0, y: -1, z: -t }, { x: 0, y: 1, z: -t },
    { x: t, y: 0, z: -1 }, { x: t, y: 0, z: 1 }, { x: -t, y: 0, z: -1 }, { x: -t, y: 0, z: 1 },
  ]
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  return finalizeSolid(verts, faces)
}

/** Faces touching vertex `v`, walked in cyclic (fan) order around it. Works for any
 *  closed manifold mesh where each vertex's faces form a single ring — used to build
 *  the dodecahedron as the icosahedron's dual (one dodecahedron face per icosahedron
 *  vertex, its corners being that vertex's incident face-centroids in ring order). */
function facesAroundVertex(faces: number[][], v: number): number[] {
  const containing: number[] = []
  faces.forEach((f, i) => { if (f.includes(v)) containing.push(i) })
  const n = containing.length
  const others = containing.map((fi) => faces[fi].filter((x) => x !== v))
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const shared = others[a].filter((x) => others[b].includes(x))
      if (shared.length === 1) { adj[a].push(b); adj[b].push(a) }
    }
  }
  const order = [0]
  let prev = -1, cur = 0
  for (let step = 1; step < n; step++) {
    const next = adj[cur].find((x) => x !== prev)
    if (next === undefined) break
    order.push(next); prev = cur; cur = next
  }
  return order.map((idx) => containing[idx])
}

function buildDodecahedron(): SolidMesh {
  const icosa = buildIcosahedron()
  // One dodecahedron vertex per icosahedron face (its centroid); the icosahedron is
  // face-transitive so a single uniform rescale (done inside finalizeSolid) suffices.
  const vertsRaw = icosa.faces.map((f) => centroid(f.map((i) => icosa.verts[i])))
  const faces = icosa.verts.map((_, v) => facesAroundVertex(icosa.faces, v))
  return finalizeSolid(vertsRaw, faces)
}

export function buildSolid(kind: PlatonicSolid): SolidMesh {
  switch (kind) {
    case 'tetrahedron': return buildTetrahedron()
    case 'cube': return buildCube()
    case 'octahedron': return buildOctahedron()
    case 'dodecahedron': return buildDodecahedron()
    case 'icosahedron': return buildIcosahedron()
  }
}

// ─── Fold tree ───────────────────────────────────────────────────────────────────
export interface Hinge {
  parent: number
  child: number
  a: Vec3 // one endpoint of the hinge edge (true coords)
  dir: Vec3 // normalized hinge-edge direction (true coords)
  /** Signed fold angle: rotating the child's TRUE normal by this angle about (a, dir)
   *  lands it exactly on the parent's TRUE normal — i.e. this is the full unfold swing. */
  angle: number
}

export interface FoldTree {
  mesh: SolidMesh
  root: number
  /** BFS order, root first — a parent always precedes its children. */
  order: number[]
  /** Per-face BFS depth (root = 0); used to band-color faces by distance from the root. */
  depth: number[]
  /** Per-face incoming hinge (null for the root). */
  hingeOf: (Hinge | null)[]
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

interface AdjEdge { other: number; shared: [number, number] }

function buildAdjacency(mesh: SolidMesh): AdjEdge[][] {
  const n = mesh.faces.length
  const adj: AdjEdge[][] = Array.from({ length: n }, () => [])
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const shared = mesh.faces[i].filter((x) => mesh.faces[j].includes(x))
      if (shared.length === 2) {
        const pair: [number, number] = [shared[0], shared[1]]
        adj[i].push({ other: j, shared: pair })
        adj[j].push({ other: i, shared: pair })
      }
    }
  }
  return adj
}

/** Build a spanning tree (BFS) of the face-adjacency graph, seeded so the same seed
 *  always yields the same root + tree shape + hinge angles. */
export function buildFoldTree(mesh: SolidMesh, seed: number): FoldTree {
  const rng = mulberry32(seed)
  const n = mesh.faces.length
  const adj = buildAdjacency(mesh)
  const root = Math.floor(rng() * n)

  const visited = new Array(n).fill(false) as boolean[]
  const parentEdge: (null | { parent: number; shared: [number, number] })[] = new Array(n).fill(null)
  const depth = new Array(n).fill(-1) as number[]
  const order: number[] = [root]
  visited[root] = true
  depth[root] = 0
  const queue = [root]
  while (queue.length) {
    const f = queue.shift()!
    const neighbors = shuffle(adj[f].slice(), rng)
    for (const nb of neighbors) {
      if (visited[nb.other]) continue
      visited[nb.other] = true
      parentEdge[nb.other] = { parent: f, shared: nb.shared }
      depth[nb.other] = depth[f] + 1
      order.push(nb.other)
      queue.push(nb.other)
    }
  }

  const hingeOf: (Hinge | null)[] = new Array(n).fill(null)
  for (const f of order) {
    const pe = parentEdge[f]
    if (!pe) continue
    const a = mesh.verts[pe.shared[0]]
    const b = mesh.verts[pe.shared[1]]
    const dir = normalize(sub(b, a))
    const nParent = mesh.faceNormals[pe.parent]
    const nChild = mesh.faceNormals[f]
    const mag = angleBetween(nParent, nChild)
    const rotPos = rotateVec(nChild, dir, mag)
    const rotNeg = rotateVec(nChild, dir, -mag)
    const sign = dot(rotPos, nParent) >= dot(rotNeg, nParent) ? 1 : -1
    hingeOf[f] = { parent: pe.parent, child: f, a, dir, angle: sign * mag }
  }

  return { mesh, root, order, depth, hingeOf }
}

export function buildFoldMesh(kind: PlatonicSolid, seed: number): FoldTree {
  return buildFoldTree(buildSolid(kind), seed)
}

/** World transform per face at fold parameter t (0 = flat net, 1 = fully assembled). */
export function computeWorldTransforms(tree: FoldTree, t: number): Affine[] {
  const n = tree.mesh.faces.length
  const transforms: Affine[] = new Array(n)
  transforms[tree.root] = IDENTITY
  for (const f of tree.order) {
    if (f === tree.root) continue
    const h = tree.hingeOf[f]!
    const angle = h.angle * (1 - t)
    const local = rotationTransform(h.a, h.dir, angle)
    transforms[f] = composeAffine(transforms[h.parent], local)
  }
  return transforms
}

// ─── Small deterministic helpers used by the diversion's animation state ──────────
export function pickCycleStart(seed: number): number {
  return Math.floor(mulberry32(seed)() * PLATONIC_SOLIDS.length)
}

/** Deterministically derive a per-cycle tree seed from the base seed + loop count, so
 *  every "next solid" in a cycle reproducibly gets its own net layout. */
export function deriveTreeSeed(seed: number, cycleCount: number): number {
  return (seed ^ Math.imul(cycleCount + 1, 0x9e3779b9)) >>> 0
}

export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

/** Lerp an angle toward a target by the shortest angular path, even when `from` has
 *  wound up far outside [-π, π] after a long continuous spin. */
export function lerpAngleShortest(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2
  let diff = (to - from) % twoPi
  if (diff > Math.PI) diff -= twoPi
  if (diff < -Math.PI) diff += twoPi
  return from + diff * t
}

/** Perspective-project a rotated 3-D point to 2-D (camera looks along +z, larger z = nearer). */
export function project(p: Vec3, dist: number): { x: number; y: number } {
  const denom = Math.max(0.9, dist - p.z)
  return { x: p.x / denom, y: p.y / denom }
}
