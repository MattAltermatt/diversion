// Hypercube — the pure 4-D (and 5-D) polytope math: build the vertex/edge topology,
// rotate a vertex through several coordinate planes, then perspective-project it down
// one dimension at a time to the 2-D screen. All framework-agnostic + deterministic
// (no DOM, no global Math.random) so it is fully unit-testable and the same seed always
// yields the same projection at a given time.
import { mulberry32 } from '../../framework/rng'

export type Polytope = 'tesseract' | 'sixteen-cell' | 'penteract'

export interface PolytopeMesh {
  /** N-dimensional vertices (each an array of `dim` coords). */
  verts: number[][]
  /** Index pairs into `verts`. */
  edges: [number, number][]
  dim: number
}

/** Build the vertex + edge topology for one polytope. Deterministic, no RNG. */
export function buildPolytope(kind: Polytope): PolytopeMesh {
  if (kind === 'sixteen-cell') return buildOrthoplex4()
  const dim = kind === 'penteract' ? 5 : 4
  return buildHypercube(dim)
}

/** The N-cube: 2^dim vertices at (±1)^dim; an edge joins any two that differ in
 *  exactly ONE coordinate. dim=4 → 16 verts / 32 edges (the tesseract);
 *  dim=5 → 32 verts / 80 edges (the penteract). */
function buildHypercube(dim: number): PolytopeMesh {
  const n = 1 << dim
  const verts: number[][] = []
  for (let a = 0; a < n; a++) {
    const v: number[] = []
    for (let c = 0; c < dim; c++) v.push((a >> c) & 1 ? 1 : -1)
    verts.push(v)
  }
  const edges: [number, number][] = []
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < dim; b++) {
      const nb = a ^ (1 << b) // flip one coordinate → differs in exactly one axis
      if (nb > a) edges.push([a, nb])
    }
  }
  return { verts, edges, dim }
}

/** The 4-orthoplex (16-cell), dual of the tesseract: 8 vertices at ±unit-axis
 *  (±1,0,0,0) & permutations; every pair is joined by an edge EXCEPT the two
 *  antipodal points sharing an axis → 24 edges. */
function buildOrthoplex4(): PolytopeMesh {
  const dim = 4
  const verts: number[][] = []
  for (let axis = 0; axis < dim; axis++) {
    const pos = [0, 0, 0, 0]; pos[axis] = 1; verts.push(pos)
    const neg = [0, 0, 0, 0]; neg[axis] = -1; verts.push(neg)
  }
  // verts[2*axis] = +axis, verts[2*axis+1] = -axis.
  const edges: [number, number][] = []
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      if ((i >> 1) === (j >> 1)) continue // same axis → antipodal, no edge
      edges.push([i, j])
    }
  }
  return { verts, edges, dim }
}

/** A rotation applied in the (i, j) coordinate plane by `angle` radians. */
export interface PlaneRotation {
  i: number
  j: number
  angle: number
}

/** Rotate a copy of `v` through each plane rotation in sequence (does not mutate v).
 *  Each planar rotation preserves the vector's norm, so the full 4-D structure keeps
 *  its shape as it turns — only the projection changes. */
export function rotate(v: number[], rots: PlaneRotation[]): number[] {
  const out = v.slice()
  for (const r of rots) {
    const c = Math.cos(r.angle), s = Math.sin(r.angle)
    const a = out[r.i], b = out[r.j]
    out[r.i] = a * c - b * s
    out[r.j] = a * s + b * c
  }
  return out
}

export interface Projected {
  x: number
  y: number
  /** Depth cue: the 3-D z the final 2-D projection dropped. Larger = nearer the
   *  camera (it foreshortens to a bigger on-screen scale). Used to shade edges. */
  depth: number
}

/** Perspective-project an N-D point down to 2-D, one dimension at a time. Each step
 *  divides the surviving coords by (distance − lastCoord): the 4-D → 3-D step uses
 *  `dist4`, the final 3-D → 2-D step uses `dist3` (higher dims reuse dist4). A vertex
 *  with a larger dropped coordinate lands closer to the camera and projects bigger —
 *  which is exactly the tesseract's mesmerising inside-out swelling. */
export function project(point: number[], dist4: number, dist3: number): Projected {
  const p = point.slice()
  let depth = 0
  for (let d = p.length; d > 2; d--) {
    const last = p[d - 1]
    const dist = d === 3 ? dist3 : dist4
    // Clamp keeps a vertex that swings behind the camera from exploding to infinity.
    const denom = Math.max(0.35, dist - last)
    const k = 1 / denom
    for (let i = 0; i < d - 1; i++) p[i] *= k
    if (d === 3) depth = last // the 3-D z, captured before the final divide
  }
  return { x: p[0], y: p[1], depth }
}

export interface SeedState {
  /** Initial angle (phase) per rotation plane. */
  angles: number[]
  /** Per-plane speed multiplier (mild jitter) so each seed tumbles a little uniquely. */
  mul: number[]
}

/** Deterministically derive per-plane starting angles + speed jitter from a seed.
 *  Same seed → identical SeedState; different seed → different. */
export function buildSeedState(seed: number, planeCount: number): SeedState {
  const rng = mulberry32(seed)
  const angles: number[] = []
  const mul: number[] = []
  for (let i = 0; i < planeCount; i++) {
    angles.push(rng() * Math.PI * 2)
    mul.push(1 + (rng() * 2 - 1) * 0.14) // ±14 %
  }
  return { angles, mul }
}
