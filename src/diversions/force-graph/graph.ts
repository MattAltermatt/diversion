// graph.ts — framework-agnostic graph generation + force-directed layout.
// Pure: no DOM, no canvas. Deterministic from cfg.seed so "same seed → same
// graph AND same layout after N steps". The framework owns the rAF loop; this
// module exposes createLayout / stepLayout / updateView for it to drive.
import { mulberry32 } from '../../framework/rng'
import type { ForceGraphConfig } from './schema'

export interface GraphNode {
  x: number; y: number       // layout-space position
  vx: number; vy: number     // velocity (layout units / step)
  community: number          // cluster id (for community colouring + gen)
  degree: number             // edge count (node size + degree colouring)
}

export interface LayoutView { scale: number; cx: number; cy: number }

export interface LayoutState {
  cfg: ForceGraphConfig
  w: number; h: number
  nodes: GraphNode[]
  edges: Array<[number, number]>
  maxDegree: number
  communityCount: number
  temp: number               // FR-style displacement cap, cools over time
  step: number               // sim steps elapsed (deterministic clock)
  meanSpeed: number          // sqrt(mean v²) — the settle metric
  settledMs: number          // wall-time held below the settle threshold
  view: LayoutView           // slow-lerped autofit transform
}

// ─── tuning (mechanism constants; the schema exposes the levers) ─────────────
const FIT_MARGIN = 0.86      // fit node bounds into this fraction of the frame
const VIEW_TAU = 900         // ms — autofit lerp time constant (slow, no swim)
const TEMP_COOL = 0.994      // per-step temperature decay
const TEMP_FLOOR_FRAC = 0.004 // floor temp at springLength * this (freeze the settle)

// ─── graph generation ───────────────────────────────────────────────────────

/** Undirected edge key so we never add a duplicate / self-loop. */
const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

interface RawGraph {
  n: number
  edges: Array<[number, number]>
  community: number[]
  communityCount: number
}

function genTree(n: number, density: number, rng: () => number): RawGraph {
  // A root with a fixed handful of main branches → a few readable sub-trees that
  // bloom apart. Nodes past the branch seeds attach to a random NON-root earlier
  // node, so the branch count (== communities) stays fixed.
  const branches = Math.min(n - 1, Math.max(2, Math.min(5, Math.floor(n / 24) + 3)))
  const parent = new Array<number>(n).fill(-1)
  const community = new Array<number>(n).fill(0)
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    const k = edgeKey(a, b)
    if (seen.has(k)) return
    seen.add(k); edges.push([a, b])
  }
  for (let i = 1; i < n; i++) {
    let p: number
    if (i <= branches) { p = 0; community[i] = i - 1 }
    else {
      // attach to a random earlier non-root node; inherit its branch
      p = 1 + Math.floor(rng() * (i - 1))
      community[i] = community[p]
    }
    parent[i] = p
    addEdge(i, p)
  }
  // extra cross-links (density) — makes it a graph, not a pure tree
  const extra = Math.round(density * n)
  for (let e = 0; e < extra; e++) {
    const a = Math.floor(rng() * n), b = Math.floor(rng() * n)
    addEdge(a, b)
  }
  return { n, edges, community, communityCount: branches }
}

function genClusters(n: number, density: number, rng: () => number): RawGraph {
  const K = Math.max(2, Math.min(6, Math.round(n / 24)))
  const community = new Array<number>(n)
  for (let i = 0; i < n; i++) community[i] = Math.floor(rng() * K)
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    const k = edgeKey(a, b)
    if (seen.has(k)) return
    seen.add(k); edges.push([a, b])
  }
  // connected backbone: each node links to a random earlier node, strongly
  // preferring its own community (keeps clusters tight but the whole graph one piece)
  for (let i = 1; i < n; i++) {
    let j = -1
    if (rng() < 0.85) {
      // earliest-first scan for a same-community earlier node, random start
      const start = Math.floor(rng() * i)
      for (let s = 0; s < i; s++) {
        const cand = (start + s) % i
        if (community[cand] === community[i]) { j = cand; break }
      }
    }
    if (j < 0) j = Math.floor(rng() * i)
    addEdge(i, j)
  }
  // dense intra-community extra edges
  const extra = Math.round(density * n * 2)
  for (let e = 0; e < extra; e++) {
    const a = Math.floor(rng() * n)
    // pick b in the same community as a
    let b = Math.floor(rng() * n)
    for (let t = 0; t < 6 && community[b] !== community[a]; t++) b = Math.floor(rng() * n)
    addEdge(a, b)
  }
  return { n, edges, community, communityCount: K }
}

function genSmallWorld(n: number, density: number, rng: () => number): RawGraph {
  // Watts–Strogatz: ring lattice (k nearest neighbours each side) + rewiring.
  const kEach = 2
  const K = Math.max(2, Math.min(6, Math.round(n / 24)))
  const community = new Array<number>(n)
  const seg = n / K
  for (let i = 0; i < n; i++) community[i] = Math.min(K - 1, Math.floor(i / seg))
  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  const addEdge = (a: number, b: number) => {
    if (a === b) return
    const k = edgeKey(a, b)
    if (seen.has(k)) return
    seen.add(k); edges.push([a, b])
  }
  const rewire = 0.15 + density * 0.5 // density feeds the rewiring probability
  for (let i = 0; i < n; i++) {
    for (let d = 1; d <= kEach; d++) {
      let target = (i + d) % n
      if (rng() < rewire) target = Math.floor(rng() * n)
      addEdge(i, target)
    }
  }
  return { n, edges, community, communityCount: K }
}

function generate(cfg: ForceGraphConfig, rng: () => number): RawGraph {
  const n = cfg.nodeCount
  switch (cfg.graphType) {
    case 'tree': return genTree(n, cfg.edgeDensity, rng)
    case 'small-world': return genSmallWorld(n, cfg.edgeDensity, rng)
    case 'clusters':
    default: return genClusters(n, cfg.edgeDensity, rng)
  }
}

// ─── layout construction ─────────────────────────────────────────────────────

export function createLayout(cfg: ForceGraphConfig, w: number, h: number): LayoutState {
  const rng = mulberry32(cfg.seed >>> 0)
  const raw = generate(cfg, rng)
  const n = raw.n

  // scramble initial positions on a small disc → a tight tangle to unfold
  const R = cfg.springLength * Math.sqrt(n) * 0.32
  const nodes: GraphNode[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const ang = rng() * Math.PI * 2
    const rad = Math.sqrt(rng()) * R
    nodes[i] = {
      x: Math.cos(ang) * rad,
      y: Math.sin(ang) * rad,
      vx: 0, vy: 0,
      community: raw.community[i],
      degree: 0,
    }
  }
  for (const [a, b] of raw.edges) { nodes[a].degree++; nodes[b].degree++ }
  let maxDegree = 1
  for (const nd of nodes) if (nd.degree > maxDegree) maxDegree = nd.degree

  const state: LayoutState = {
    cfg, w, h,
    nodes, edges: raw.edges,
    maxDegree,
    communityCount: raw.communityCount,
    temp: cfg.springLength * 2,
    step: 0,
    meanSpeed: Infinity,
    settledMs: 0,
    view: { scale: 1, cx: 0, cy: 0 },
  }
  // snap the view so frame 1 is already framed (no zoom-in swim)
  state.view = fitTarget(state)
  return state
}

// ─── one force-directed step (fixed dt = 1, deterministic) ───────────────────

export function stepLayout(state: LayoutState): void {
  const { nodes, edges, cfg } = state
  const n = nodes.length
  const L = cfg.springLength
  const rep = cfg.repulsion
  const ks = cfg.springStiffness
  const damp = cfg.damping
  const fx = new Float64Array(n)
  const fy = new Float64Array(n)

  // repulsion — every pair pushes apart (Fruchterman–Reingold: ~ L²/d, a 1/d law)
  for (let i = 0; i < n; i++) {
    const a = nodes[i]
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j]
      let dx = a.x - b.x, dy = a.y - b.y
      let d2 = dx * dx + dy * dy
      if (d2 < 1e-6) {
        // coincident → deterministic tiny nudge from the index pair
        dx = ((i * 13 + j * 7) % 17) / 17 - 0.5
        dy = ((i * 5 + j * 11) % 19) / 19 - 0.5
        d2 = dx * dx + dy * dy + 1e-6
      }
      const d = Math.sqrt(d2)
      const f = (rep * L * L) / d           // magnitude (∝ 1/d)
      const ux = dx / d, uy = dy / d
      fx[i] += ux * f; fy[i] += uy * f
      fx[j] -= ux * f; fy[j] -= uy * f
    }
  }

  // attraction — springs on edges pull endpoints toward the link length
  for (let e = 0; e < edges.length; e++) {
    const i = edges[e][0], j = edges[e][1]
    const a = nodes[i], b = nodes[j]
    const dx = b.x - a.x, dy = b.y - a.y
    const d = Math.sqrt(dx * dx + dy * dy) + 1e-6
    const f = (ks * d * d) / L             // FR attractive (∝ d²/L)
    const ux = dx / d, uy = dy / d
    fx[i] += ux * f; fy[i] += uy * f
    fx[j] -= ux * f; fy[j] -= uy * f
  }

  // integrate with damping; cap displacement by the cooling temperature
  const temp = state.temp
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const nd = nodes[i]
    let vx = (nd.vx + fx[i]) * damp
    let vy = (nd.vy + fy[i]) * damp
    const sp = Math.hypot(vx, vy)
    if (sp > temp && sp > 1e-9) { const s = temp / sp; vx *= s; vy *= s }
    nd.vx = vx; nd.vy = vy
    nd.x += vx; nd.y += vy
    sumSq += vx * vx + vy * vy
  }
  state.meanSpeed = Math.sqrt(sumSq / n)
  state.temp = Math.max(L * TEMP_FLOOR_FRAC, temp * TEMP_COOL)
  state.step++
}

/** Absolute (link-length-relative, NOT screen-proportional) settle threshold:
 *  mean node speed below this = the layout has come to rest. */
export function settleThreshold(cfg: ForceGraphConfig): number {
  return cfg.springLength * 0.01
}

// ─── autofit view (keeps the network framed as it expands / settles) ──────────

export function fitTarget(state: LayoutState): LayoutView {
  const { nodes, w, h } = state
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of nodes) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const scale = Math.min((w * FIT_MARGIN) / bw, (h * FIT_MARGIN) / bh)
  return { scale, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 }
}

/** Slow-lerp the live view toward the fit target so the frame never snaps. */
export function updateView(state: LayoutState, dt: number): void {
  const t = fitTarget(state)
  const a = 1 - Math.exp(-dt / VIEW_TAU)
  state.view.scale += (t.scale - state.view.scale) * a
  state.view.cx += (t.cx - state.view.cx) * a
  state.view.cy += (t.cy - state.view.cy) * a
}

/** Total spring energy — Σ (d − L)² over edges. A pure relaxation metric for the
 *  headline test: it falls monotonically-ish as the tangle unfolds. */
export function springEnergy(state: LayoutState): number {
  const L = state.cfg.springLength
  let e = 0
  for (const [i, j] of state.edges) {
    const a = state.nodes[i], b = state.nodes[j]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    e += (d - L) * (d - L)
  }
  return e
}
