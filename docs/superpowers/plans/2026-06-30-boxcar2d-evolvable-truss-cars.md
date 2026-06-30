# BoxCar2D Evolvable Spring-Truss Cars — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace BoxCar2D's fixed 8-vertex radial chassis with a free-form spring-truss genome where every part — node positions/count, member stiffness, wheel count, and per-wheel motor (incl. reverse) — evolves.

**Architecture:** A car is 3–7 nodes (small circle bodies) whose Delaunay triangulation forms the members (Box2D distance joints with per-edge spring stiffness — a "rigid bar" is just a very stiff spring). 1–6 wheels mount to nodes, each with its own signed motor. The genome is fixed-length with present-toggles so the existing uniform crossover and GA scaffolding keep working unchanged; connectivity is guaranteed by triangulation, so there's no repair-of-graph logic and no invalid cars. All values are rng-derived from the seed → the share-link determinism contract holds (the URL stores config + seed, never the evolved cars).

**Tech Stack:** TypeScript, phaser-box2d (Box2D v3), Vitest. Spec: `docs/superpowers/specs/2026-06-30-boxcar2d-evolvable-truss-cars-design.md`.

**Conventions:** dev server `npm run dev` (port 5180); tests `npx vitest run <path>`; typecheck `npx tsc -p tsconfig.json --noEmit`; build `npm run build`. Git identity is already set per-repo. Commit after each task.

---

## File Structure

```
new:     src/diversions/boxcar2d/triangulate.ts        (+ triangulate.test.ts)
rewrite: src/diversions/boxcar2d/genome.ts             (+ genome.test.ts)
rewrite: src/diversions/boxcar2d/car.ts                (+ car.test.ts)
rewrite: src/diversions/boxcar2d/render.ts
edit:    src/diversions/boxcar2d/physics.ts            (add createDistanceJoint)
edit:    src/diversions/boxcar2d/schema.ts             (remove 2 motor sliders)
edit:    src/diversions/boxcar2d/index.ts              (chassis → centroid wiring)
unchanged: ga.ts, fitness.ts, terrain.ts, rubble.ts, presets.ts, palette.ts,
           ga.test.ts, schema.test.ts, framework codec tests
```

`crossover`, `mutate`, `GenomeRanges`, `DEFAULT_RANGES`, `randomGenome` keep their names/signatures so `ga.ts` and `index.ts`'s `breedGeneration(..., DEFAULT_RANGES)` call need no change.

---

## Task 1: Delaunay triangulation module

**Files:**
- Create: `src/diversions/boxcar2d/triangulate.ts`
- Test: `src/diversions/boxcar2d/triangulate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/diversions/boxcar2d/triangulate.test.ts
import { describe, it, expect } from 'vitest'
import { triangulateEdges } from './triangulate'

const nodesCovered = (edges: [number, number][], n: number) => {
  const seen = new Set<number>()
  for (const [a, b] of edges) { seen.add(a); seen.add(b) }
  return seen.size === n
}

describe('triangulateEdges', () => {
  it('a single triangle yields its 3 edges', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 2 }])
    expect(e).toHaveLength(3)
    expect(nodesCovered(e, 3)).toBe(true)
  })

  it('a convex quad yields 5 edges (4 sides + 1 diagonal), all nodes connected', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }])
    expect(e).toHaveLength(5)
    expect(nodesCovered(e, 4)).toBe(true)
  })

  it('collinear points fall back to a connecting chain (n-1 edges, all covered)', () => {
    const e = triangulateEdges([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }])
    expect(e).toHaveLength(3)
    expect(nodesCovered(e, 4)).toBe(true)
  })

  it('fewer than 3 points → chain', () => {
    expect(triangulateEdges([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toEqual([[0, 1]])
  })

  it('is deterministic (same input → same edges)', () => {
    const pts = [{ x: 0, y: 0 }, { x: 2, y: 0.3 }, { x: 1.5, y: 2 }, { x: -0.5, y: 1.6 }, { x: 0.8, y: 0.9 }]
    const norm = (e: [number, number][]) => e.map(([a, b]) => `${a}-${b}`).sort()
    expect(norm(triangulateEdges(pts))).toEqual(norm(triangulateEdges(pts)))
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/triangulate.test.ts`
Expected: FAIL — `triangulate.ts` does not exist / `triangulateEdges` is not a function.

- [ ] **Step 3: Write the implementation**

```ts
// src/diversions/boxcar2d/triangulate.ts
/**
 * triangulate.ts — pure, deterministic 2D Delaunay (Bowyer–Watson).
 *
 * A BoxCar2D car's structural members are the edges of the Delaunay triangulation
 * of its (≤7) node positions: always one connected, rigid, non-self-crossing frame
 * ("always a triangle to connect them"). No engine/DOM imports → runs headless.
 *
 * Degeneracy fallback: <3 points, or fully collinear points (no triangle emerges),
 * connect as a chain in (x, then y) order so the frame is still one piece.
 */
export interface Pt { x: number; y: number }
export type Edge = [number, number] // indices into the input array, a < b

export function triangulateEdges(pts: Pt[]): Edge[] {
  if (pts.length < 3) return chain(pts)
  const tris = bowyerWatson(pts)
  if (tris.length === 0) return chain(pts) // collinear → no triangles
  const seen = new Set<string>()
  const edges: Edge[] = []
  const add = (a: number, b: number) => {
    if (a > b) { const t = a; a = b; b = t }
    const k = `${a},${b}`
    if (!seen.has(k)) { seen.add(k); edges.push([a, b]) }
  }
  for (const t of tris) { add(t[0], t[1]); add(t[1], t[2]); add(t[2], t[0]) }
  return edges
}

function chain(pts: Pt[]): Edge[] {
  const idx = pts.map((_, i) => i).sort((a, b) => pts[a].x - pts[b].x || pts[a].y - pts[b].y)
  const edges: Edge[] = []
  for (let i = 1; i < idx.length; i++) {
    let a = idx[i - 1], b = idx[i]
    if (a > b) { const t = a; a = b; b = t }
    edges.push([a, b])
  }
  return edges
}

type Tri = [number, number, number]

function bowyerWatson(pts: Pt[]): Tri[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  const dmax = Math.max(maxX - minX, maxY - minY) || 1
  const midx = (minX + maxX) / 2, midy = (minY + maxY) / 2
  const n = pts.length
  // working vertex list = real points + 3 super-triangle vertices
  const sp: Pt[] = pts.concat([
    { x: midx - 20 * dmax, y: midy - dmax },
    { x: midx, y: midy + 20 * dmax },
    { x: midx + 20 * dmax, y: midy - dmax },
  ])
  let tris: Tri[] = [[n, n + 1, n + 2]]
  for (let i = 0; i < n; i++) {
    const bad: Tri[] = []
    for (const t of tris) if (inCircumcircle(sp[i], sp[t[0]], sp[t[1]], sp[t[2]])) bad.push(t)
    // boundary = edges that belong to exactly one bad triangle
    const counts = new Map<string, number>()
    const store = new Map<string, [number, number]>()
    for (const t of bad) {
      const es: [number, number][] = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]
      for (const [a, b] of es) {
        const k = a < b ? `${a},${b}` : `${b},${a}`
        counts.set(k, (counts.get(k) || 0) + 1)
        store.set(k, [a, b])
      }
    }
    tris = tris.filter(t => !bad.includes(t))
    for (const [k, c] of counts) if (c === 1) { const [a, b] = store.get(k)!; tris.push([a, b, i]) }
  }
  // discard any triangle still touching a super-triangle vertex
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n)
}

/** True if p is strictly inside the circumcircle of triangle (a,b,c).
 *  Orientation-normalized so it works for CW and CCW triangles. */
function inCircumcircle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const ax = a.x - p.x, ay = a.y - p.y
  const bx = b.x - p.x, by = b.y - p.y
  const cx = c.x - p.x, cy = c.y - p.y
  const det =
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)
  const orient = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)
  return orient > 0 ? det > 0 : det < 0
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/diversions/boxcar2d/triangulate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/triangulate.ts src/diversions/boxcar2d/triangulate.test.ts
git commit -m "feat(boxcar2d): deterministic Delaunay triangulation for truss members"
```

---

## Task 2: Distance-joint physics helper

**Files:**
- Modify: `src/diversions/boxcar2d/physics.ts`

- [ ] **Step 1: Add the import**

In `physics.ts`, add `CreateDistanceJoint` to the existing `phaser-box2d` import block (alongside `CreateWheelJoint`):

```ts
  CreateWheelJoint,
  CreateDistanceJoint,
```

- [ ] **Step 2: Add the helper (place it right after `createWheelJoint`)**

```ts
export interface DistanceJointOpts {
  bodyA: BodyId
  bodyB: BodyId
  /** Rest length in meters (set to the bodies' current separation at build). */
  length: number
  /** Spring frequency (Hz). High ≈ rigid bar; low ≈ floppy spring. */
  hertz: number
  dampingRatio: number
}

/** Spring distance joint between two node bodies = one truss member. Anchored at
 *  each body's center (node circles are centered on the node), so `length` is the
 *  node-to-node rest distance. A "rigid bar" is simply a very high `hertz`. */
export function createDistanceJoint(worldId: WorldId, opts: DistanceJointOpts): JointId {
  const result = CreateDistanceJoint({
    worldId,
    bodyIdA: opts.bodyA,
    bodyIdB: opts.bodyB,
    anchorA: new b2Vec2(0, 0),
    anchorB: new b2Vec2(0, 0),
    length: opts.length,
    enableSpring: true,
    hertz: opts.hertz,
    dampingRatio: opts.dampingRatio,
    collideConnected: false,
  })
  return result.jointId
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS (no new errors). *(Verified directly when `car.ts` consumes it in Task 4; this task only adds the seam.)*

- [ ] **Step 4: Commit**

```bash
git add src/diversions/boxcar2d/physics.ts
git commit -m "feat(boxcar2d): createDistanceJoint physics seam for spring members"
```

---

## Task 3: Genome rewrite (truss genome)

**Files:**
- Rewrite: `src/diversions/boxcar2d/genome.ts`
- Rewrite: `src/diversions/boxcar2d/genome.test.ts`

- [ ] **Step 1: Write the failing test (full replacement)**

```ts
// src/diversions/boxcar2d/genome.test.ts
import { describe, it, expect } from 'vitest'
import {
  randomGenome, crossover, mutate, repair, pairIndex,
  MAX_NODES, MIN_NODES, MAX_WHEELS, MIN_WHEELS, N_PAIRS, DEFAULT_RANGES,
} from './genome'
import { mulberry32 } from '../../framework/rng'

const countNodes = (g: ReturnType<typeof randomGenome>) => g.nodes.filter(n => n.present).length
const countWheels = (g: ReturnType<typeof randomGenome>) => g.wheels.filter(w => w.present).length

describe('randomGenome', () => {
  it('is fixed-length with valid counts and in-range values', () => {
    for (let s = 1; s <= 30; s++) {
      const g = randomGenome(mulberry32(s))
      expect(g.nodes).toHaveLength(MAX_NODES)
      expect(g.pairs).toHaveLength(N_PAIRS)
      expect(g.wheels).toHaveLength(MAX_WHEELS)
      expect(countNodes(g)).toBeGreaterThanOrEqual(MIN_NODES)
      expect(countWheels(g)).toBeGreaterThanOrEqual(MIN_WHEELS)
      for (const n of g.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeXMin)
        expect(n.x).toBeLessThanOrEqual(DEFAULT_RANGES.nodeXMax)
      }
      for (const w of g.wheels) {
        if (!w.present) continue
        expect(g.nodes[w.node].present).toBe(true) // wheel mounts an active node
        expect(Math.abs(w.motorSpeed)).toBeLessThanOrEqual(DEFAULT_RANGES.motorSpeedAbs)
      }
    }
  })

  it('can produce a backward-spinning (negative motorSpeed) wheel somewhere', () => {
    let sawNegative = false
    for (let s = 1; s <= 40 && !sawNegative; s++) {
      sawNegative = randomGenome(mulberry32(s)).wheels.some(w => w.motorSpeed < 0)
    }
    expect(sawNegative).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    expect(randomGenome(mulberry32(7))).toEqual(randomGenome(mulberry32(7)))
  })
})

describe('pairIndex', () => {
  it('maps every unordered pair to a distinct slot in [0, N_PAIRS)', () => {
    const seen = new Set<number>()
    for (let i = 0; i < MAX_NODES; i++)
      for (let j = i + 1; j < MAX_NODES; j++) {
        const idx = pairIndex(i, j)
        expect(idx).toBe(pairIndex(j, i)) // symmetric
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(N_PAIRS)
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    expect(seen.size).toBe(N_PAIRS)
  })
})

describe('crossover', () => {
  it('every gene comes from a parent and the child is valid + deterministic', () => {
    const a = randomGenome(mulberry32(1)), b = randomGenome(mulberry32(2))
    const child = crossover(a, b, mulberry32(3))
    child.pairs.forEach((p, i) =>
      expect([a.pairs[i].stiffness, b.pairs[i].stiffness]).toContain(p.stiffness))
    expect(countNodes(child)).toBeGreaterThanOrEqual(MIN_NODES)
    expect(countWheels(child)).toBeGreaterThanOrEqual(MIN_WHEELS)
    expect(crossover(a, b, mulberry32(3))).toEqual(crossover(a, b, mulberry32(3)))
  })
})

describe('mutate', () => {
  it('rate 0 is identity', () => {
    const g = randomGenome(mulberry32(5))
    expect(mutate(g, 0, mulberry32(9))).toEqual(g)
  })

  it('rate 1 keeps the genome valid and in range', () => {
    const g = randomGenome(mulberry32(5))
    const m = mutate(g, 1, mulberry32(9))
    expect(m.nodes).toHaveLength(MAX_NODES)
    expect(countNodes(m)).toBeGreaterThanOrEqual(MIN_NODES)
    expect(countWheels(m)).toBeGreaterThanOrEqual(MIN_WHEELS)
    m.wheels.forEach(w => { if (w.present) expect(m.nodes[w.node].present).toBe(true) })
  })
})

describe('repair', () => {
  it('forces a wiped genome up to the minimums', () => {
    const g = randomGenome(mulberry32(11))
    g.nodes.forEach(n => (n.present = false))
    g.wheels.forEach(w => (w.present = false))
    const r = repair(g)
    expect(countNodes(r)).toBe(MIN_NODES)
    expect(countWheels(r)).toBe(MIN_WHEELS)
    r.wheels.forEach(w => { if (w.present) expect(r.nodes[w.node].present).toBe(true) })
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/genome.test.ts`
Expected: FAIL — old genome exports (`mags`, `N_VERTICES`) gone, new exports not yet present.

- [ ] **Step 3: Write the implementation (full replacement of `genome.ts`)**

```ts
// src/diversions/boxcar2d/genome.ts
/**
 * genome.ts — the evolvable spring-truss car genome (#156).
 *
 * Fixed-length with present-toggles so the GA's uniform per-gene crossover keeps
 * working: 7 node slots, a 21-slot node-pair table (stiffness/damping), 6 wheel
 * slots. A car's actual node/wheel COUNT is how many slots are toggled on — random
 * at birth (3–7 nodes, 1–6 wheels), drifting via toggle mutation. Which node-pairs
 * are real members is NOT a gene — it's derived by Delaunay triangulation (car.ts);
 * the pair table is only consulted for pairs that end up as members.
 *
 * `repair` keeps every genome valid (≥3 nodes, ≥1 wheel, wheels on active nodes)
 * with NO rng, so crossover/mutation stay reproducible (share-link determinism).
 */
export const MAX_NODES = 7
export const MIN_NODES = 3
export const MAX_WHEELS = 6
export const MIN_WHEELS = 1
export const N_PAIRS = (MAX_NODES * (MAX_NODES - 1)) / 2 // 21

// Birth toggle probabilities (not user-facing; tuned for varied gen-1 junk).
const NODE_PRESENT_P = 0.7
const WHEEL_PRESENT_P = 0.55
const POWERED_P = 0.7

export interface NodeGene { present: boolean; x: number; y: number; mass: number }
export interface PairGene { stiffness: number; damping: number } // both 0..1
export interface WheelGene {
  present: boolean
  node: number // slot index of the node it mounts to
  radius: number
  grip: number
  mass: number
  powered: boolean
  motorSpeed: number // SIGNED — negative spins backward
  torque: number
}
export interface Genome { nodes: NodeGene[]; pairs: PairGene[]; wheels: WheelGene[] }

export interface GenomeRanges {
  nodeXMin: number; nodeXMax: number
  nodeYMin: number; nodeYMax: number
  nodeMassMin: number; nodeMassMax: number
  wheelRMin: number; wheelRMax: number
  gripMin: number; gripMax: number
  wheelMassMin: number; wheelMassMax: number
  motorSpeedAbs: number
  torqueMin: number; torqueMax: number
}

// 🎚️ tunable defaults (meters / density / rad·s⁻¹). Wide ranges → varied, often
// absurd gen-1 cars so the junk→competent arc stays vivid.
export const DEFAULT_RANGES: GenomeRanges = {
  nodeXMin: -1.2, nodeXMax: 1.2,
  nodeYMin: -0.8, nodeYMax: 0.8,
  nodeMassMin: 0.5, nodeMassMax: 3,
  wheelRMin: 0.15, wheelRMax: 0.65,
  gripMin: 0.3, gripMax: 1.5,
  wheelMassMin: 0.5, wheelMassMax: 2,
  motorSpeedAbs: 30,
  torqueMin: 5, torqueMax: 120,
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Flat slot for the unordered node pair (i,j), i≠j, in the N_PAIRS upper triangle. */
export function pairIndex(i: number, j: number): number {
  if (i > j) { const t = i; i = j; j = t }
  return i * MAX_NODES - (i * (i + 1)) / 2 + (j - i - 1)
}

export function randomGenome(rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const nodes: NodeGene[] = Array.from({ length: MAX_NODES }, () => ({
    present: rng() < NODE_PRESENT_P,
    x: lerp(r.nodeXMin, r.nodeXMax, rng()),
    y: lerp(r.nodeYMin, r.nodeYMax, rng()),
    mass: lerp(r.nodeMassMin, r.nodeMassMax, rng()),
  }))
  const pairs: PairGene[] = Array.from({ length: N_PAIRS }, () => ({
    stiffness: rng(),
    damping: rng(),
  }))
  const wheels: WheelGene[] = Array.from({ length: MAX_WHEELS }, () => ({
    present: rng() < WHEEL_PRESENT_P,
    node: Math.floor(rng() * MAX_NODES),
    radius: lerp(r.wheelRMin, r.wheelRMax, rng()),
    grip: lerp(r.gripMin, r.gripMax, rng()),
    mass: lerp(r.wheelMassMin, r.wheelMassMax, rng()),
    powered: rng() < POWERED_P,
    motorSpeed: lerp(-r.motorSpeedAbs, r.motorSpeedAbs, rng()),
    torque: lerp(r.torqueMin, r.torqueMax, rng()),
  }))
  return repair({ nodes, pairs, wheels })
}

/** Force a genome valid: ≥MIN_NODES nodes, ≥MIN_WHEELS wheels, every active wheel
 *  on an active node. Pure + deterministic (no rng) so breeding stays reproducible. */
export function repair(g: Genome): Genome {
  let active = g.nodes.filter(n => n.present).length
  for (let i = 0; i < MAX_NODES && active < MIN_NODES; i++) {
    if (!g.nodes[i].present) { g.nodes[i].present = true; active++ }
  }
  let wActive = g.wheels.filter(w => w.present).length
  for (let i = 0; i < MAX_WHEELS && wActive < MIN_WHEELS; i++) {
    if (!g.wheels[i].present) { g.wheels[i].present = true; wActive++ }
  }
  const presentNodes = g.nodes.map((n, i) => (n.present ? i : -1)).filter(i => i >= 0)
  for (const w of g.wheels) {
    if (!w.present) continue
    if (!g.nodes[w.node]?.present) {
      // snap to the active node nearest (by slot index) to the requested one
      w.node = presentNodes.reduce(
        (best, idx) => (Math.abs(idx - w.node) < Math.abs(best - w.node) ? idx : best),
        presentNodes[0],
      )
    }
  }
  return g
}

export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const pick = <T,>(x: T, y: T) => (rng() < 0.5 ? x : y)
  const nodes = a.nodes.map((n, i) => ({
    present: pick(n.present, b.nodes[i].present),
    x: pick(n.x, b.nodes[i].x),
    y: pick(n.y, b.nodes[i].y),
    mass: pick(n.mass, b.nodes[i].mass),
  }))
  const pairs = a.pairs.map((p, i) => ({
    stiffness: pick(p.stiffness, b.pairs[i].stiffness),
    damping: pick(p.damping, b.pairs[i].damping),
  }))
  const wheels = a.wheels.map((w, i) => ({
    present: pick(w.present, b.wheels[i].present),
    node: pick(w.node, b.wheels[i].node),
    radius: pick(w.radius, b.wheels[i].radius),
    grip: pick(w.grip, b.wheels[i].grip),
    mass: pick(w.mass, b.wheels[i].mass),
    powered: pick(w.powered, b.wheels[i].powered),
    motorSpeed: pick(w.motorSpeed, b.wheels[i].motorSpeed),
    torque: pick(w.torque, b.wheels[i].torque),
  }))
  return repair({ nodes, pairs, wheels })
}

export function mutate(g: Genome, rate: number, rng: () => number, r: GenomeRanges = DEFAULT_RANGES): Genome {
  const jit = (v: number, lo: number, hi: number) =>
    rng() < rate ? clamp(v + (rng() * 2 - 1) * (hi - lo) * 0.25, lo, hi) : v
  const flip = (b: boolean) => (rng() < rate ? !b : b)
  const nodes = g.nodes.map(n => ({
    present: flip(n.present),
    x: jit(n.x, r.nodeXMin, r.nodeXMax),
    y: jit(n.y, r.nodeYMin, r.nodeYMax),
    mass: jit(n.mass, r.nodeMassMin, r.nodeMassMax),
  }))
  const pairs = g.pairs.map(p => ({
    stiffness: jit(p.stiffness, 0, 1),
    damping: jit(p.damping, 0, 1),
  }))
  const wheels = g.wheels.map(w => ({
    present: flip(w.present),
    node: rng() < rate ? Math.floor(rng() * MAX_NODES) : w.node,
    radius: jit(w.radius, r.wheelRMin, r.wheelRMax),
    grip: jit(w.grip, r.gripMin, r.gripMax),
    mass: jit(w.mass, r.wheelMassMin, r.wheelMassMax),
    powered: flip(w.powered),
    motorSpeed: jit(w.motorSpeed, -r.motorSpeedAbs, r.motorSpeedAbs),
    torque: jit(w.torque, r.torqueMin, r.torqueMax),
  }))
  return repair({ nodes, pairs, wheels })
}
```

> Note: `mutate` at rate 0 never flips and never jitters, so it returns a structurally identical genome; `repair` is a no-op on an already-valid genome, so `toEqual(g)` holds.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/diversions/boxcar2d/genome.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/genome.ts src/diversions/boxcar2d/genome.test.ts
git commit -m "feat(boxcar2d): evolvable spring-truss genome (nodes/pairs/wheels)"
```

---

## Task 4: Car build rewrite (nodes, members, wheels, centroid)

**Files:**
- Rewrite: `src/diversions/boxcar2d/car.ts`
- Rewrite: `src/diversions/boxcar2d/car.test.ts`

- [ ] **Step 1: Write the failing test (full replacement)**

```ts
// src/diversions/boxcar2d/car.test.ts
import { describe, it, expect } from 'vitest'
import { simulateCar, buildCar, carCentroid } from './car'
import { randomGenome } from './genome'
import { makeTerrain, terrainPoints } from './terrain'
import { createWorld, destroyWorld, buildTerrainBody } from './physics'
import { mulberry32 } from '../../framework/rng'
import { triangulateEdges } from './triangulate'

const TERRAIN = terrainPoints(makeTerrain(1, 0.5), 0, 300, 1.5)
const CFG = { gravity: -10, maxSteps: 1200, stallSteps: 180, progressEps: 0.1, spawnX: 2, spawnY: 3 }

describe('buildCar', () => {
  it('creates one body per active node, one member per Delaunay edge, one body per active wheel', () => {
    const g = randomGenome(mulberry32(7))
    const world = createWorld(-10)
    buildTerrainBody(world, TERRAIN)
    const car = buildCar(world, g, { x: 2, y: 3 })

    const activeNodes = g.nodes.filter(n => n.present).length
    const activeWheels = g.wheels.filter(w => w.present).length
    const localPts = g.nodes.filter(n => n.present).map(n => ({ x: n.x, y: n.y }))

    expect(car.nodes).toHaveLength(activeNodes)
    expect(car.members).toHaveLength(triangulateEdges(localPts).length)
    expect(car.wheels).toHaveLength(activeWheels)
    destroyWorld(world)
  })
})

describe('carCentroid', () => {
  it('returns the mean of the node positions', () => {
    const g = randomGenome(mulberry32(3))
    const world = createWorld(-10)
    buildTerrainBody(world, TERRAIN)
    const car = buildCar(world, g, { x: 2, y: 3 })
    const c = carCentroid(car)
    expect(Number.isFinite(c.x)).toBe(true)
    expect(Number.isFinite(c.y)).toBe(true)
    destroyWorld(world)
  })
})

describe('simulateCar', () => {
  it('same genome + terrain → identical fitness (determinism keystone)', () => {
    const g = randomGenome(mulberry32(7))
    expect(simulateCar(g, TERRAIN, CFG).fitness).toBe(simulateCar(g, TERRAIN, CFG).fitness)
  })
  it('returns a finite, non-negative distance', () => {
    const g = randomGenome(mulberry32(8))
    const f = simulateCar(g, TERRAIN, CFG).fitness
    expect(Number.isFinite(f)).toBe(true)
    expect(f).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/car.test.ts`
Expected: FAIL — `buildCar` signature changed / `chassisVertices` gone / `carCentroid` missing.

- [ ] **Step 3: Write the implementation (full replacement of `car.ts`)**

```ts
// src/diversions/boxcar2d/car.ts
/**
 * car.ts — turns a truss Genome into Box2D bodies and runs a headless solo sim.
 *
 * Each active node → a small circle body (it bumps terrain). The active nodes'
 * local positions are Delaunay-triangulated; every edge → a spring distance joint
 * (a "rigid bar" is just a very high hertz). Each active wheel → a circle body
 * joined to its mount node by a motorized wheel joint with its own SIGNED speed
 * (negative = backward) and torque. There is no single chassis body — progress is
 * tracked via the node centroid.
 */
import {
  createWorld, destroyWorld, stepWorld, buildTerrainBody,
  createCircleBody, createWheelJoint, createDistanceJoint,
  getBodyPosition, type WorldId, type BodyId, type Vec2,
} from './physics'
import { type Genome, pairIndex } from './genome'
import { triangulateEdges } from './triangulate'

export const CAR_GROUP = -1

// 🎚️ mechanism constants (not user balance).
const NODE_RADIUS = 0.10      // m — collision disc for every node
const NODE_FRICTION = 0.5
const HERTZ_MIN = 0.8         // stiffness 0 → floppy spring
const HERTZ_MAX = 15          // stiffness 1 → near-rigid bar
const DAMP_MIN = 0.1
const DAMP_MAX = 1.0
const WHEEL_HERTZ = 4         // wheel suspension (unchanged from the original car)
const WHEEL_DAMPING = 0.7

export interface CarBodies {
  /** Active nodes only, each tagged with its original genome slot (for pair lookup). */
  nodes: { body: BodyId; slot: number }[]
  /** Members as index pairs into `nodes[]`, plus the edge stiffness (for render). */
  members: { a: number; b: number; stiffness: number }[]
  wheels: { body: BodyId; radius: number }[]
}
export interface SimCfg {
  gravity: number; maxSteps: number; stallSteps: number; progressEps: number
  spawnX: number; spawnY: number
}
export interface SimResult { fitness: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function buildCar(worldId: WorldId, g: Genome, spawn: Vec2): CarBodies {
  const active = g.nodes.map((n, i) => ({ n, slot: i })).filter(o => o.n.present)
  const local = active.map(o => ({ x: o.n.x, y: o.n.y }))
  const nodes = active.map(o => ({
    body: createCircleBody(worldId, {
      position: { x: spawn.x + o.n.x, y: spawn.y + o.n.y },
      radius: NODE_RADIUS, density: o.n.mass, friction: NODE_FRICTION, groupIndex: CAR_GROUP,
    }),
    slot: o.slot,
  }))

  // members = Delaunay edges of the active nodes (indices into the active array)
  const members: CarBodies['members'] = []
  for (const [ai, bi] of triangulateEdges(local)) {
    const pg = g.pairs[pairIndex(nodes[ai].slot, nodes[bi].slot)]
    const dx = local[bi].x - local[ai].x
    const dy = local[bi].y - local[ai].y
    createDistanceJoint(worldId, {
      bodyA: nodes[ai].body, bodyB: nodes[bi].body,
      length: Math.hypot(dx, dy),
      hertz: lerp(HERTZ_MIN, HERTZ_MAX, pg.stiffness),
      dampingRatio: lerp(DAMP_MIN, DAMP_MAX, pg.damping),
    })
    members.push({ a: ai, b: bi, stiffness: pg.stiffness })
  }

  // wheels mount to a node body (repair guarantees the slot is active)
  const slotToArr = new Map(nodes.map((nd, k) => [nd.slot, k]))
  const wheels: CarBodies['wheels'] = []
  for (const w of g.wheels) {
    if (!w.present) continue
    const k = slotToArr.get(w.node)
    if (k === undefined) continue // unreachable after repair; guards a malformed genome
    const np = getBodyPosition(nodes[k].body)
    const body = createCircleBody(worldId, {
      position: { x: np.x, y: np.y }, radius: w.radius, density: w.mass,
      friction: w.grip, groupIndex: CAR_GROUP,
    })
    createWheelJoint(worldId, {
      chassis: nodes[k].body, wheel: body, localAnchorA: { x: 0, y: 0 },
      axisX: 0, axisY: 1, enableSpring: true, hertz: WHEEL_HERTZ, dampingRatio: WHEEL_DAMPING,
      // negate so a POSITIVE gene drives the car forward (matches the original
      // convention where the motor spun the wheel to move +x); negative = reverse.
      enableMotor: w.powered, motorSpeed: -w.motorSpeed, maxMotorTorque: w.torque,
    })
    wheels.push({ body, radius: w.radius })
  }

  return { nodes, members, wheels }
}

/** Mean of the node body positions — the car's reference point (no single chassis). */
export function carCentroid(car: CarBodies): Vec2 {
  let sx = 0, sy = 0
  for (const nd of car.nodes) { const p = getBodyPosition(nd.body); sx += p.x; sy += p.y }
  const n = car.nodes.length || 1
  return { x: sx / n, y: sy / n }
}

export function simulateCar(g: Genome, terrain: Vec2[], cfg: SimCfg): SimResult {
  const world = createWorld(cfg.gravity)
  buildTerrainBody(world, terrain)
  const car = buildCar(world, g, { x: cfg.spawnX, y: cfg.spawnY })
  let maxX = cfg.spawnX
  let stall = 0
  for (let i = 0; i < cfg.maxSteps; i++) {
    stepWorld(world, 1)
    const px = carCentroid(car).x
    if (px > maxX + cfg.progressEps) { maxX = px; stall = 0 }
    else if (++stall >= cfg.stallSteps) break
  }
  destroyWorld(world)
  return { fitness: Math.max(0, maxX - cfg.spawnX) }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/diversions/boxcar2d/car.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/boxcar2d/car.ts src/diversions/boxcar2d/car.test.ts
git commit -m "feat(boxcar2d): build truss cars (node bodies + spring members + per-wheel motors)"
```

---

## Task 5: Remove global motor sliders from the schema

**Files:**
- Modify: `src/diversions/boxcar2d/schema.ts:51-56`

- [ ] **Step 1: Delete the two motor fields**

Remove these lines from `boxcar2dSchema` (motor is now per-wheel evolved, not a global knob):

```ts
  motorTorque: z.number().min(5).max(120).default(40)
    .meta({ section: 'Tuning', ui: 'slider', min: 5, max: 120, step: 1, label: 'Motor torque',
            help: 'Drive strength of the wheels. Too low and cars sit still; too high and they backflip.' }),
  motorSpeed: z.number().min(2).max(30).default(12)
    .meta({ section: 'Tuning', ui: 'slider', min: 2, max: 30, step: 1, label: 'Motor speed',
            help: 'Target wheel spin rate (rad/s).' }),
```

- [ ] **Step 2: Run the schema + codec tests**

Run: `npx vitest run src/diversions/boxcar2d/schema.test.ts src/framework`
Expected: PASS. `schema.test.ts` never referenced the motor fields; the codec is schema-driven (no hardcoded boxcar2d keys), and decode degrades per-field, so old share-links carrying `motorSpeed`/`motorTorque` simply ignore those keys.

- [ ] **Step 3: Commit**

```bash
git add src/diversions/boxcar2d/schema.ts
git commit -m "feat(boxcar2d): drop global motor sliders (motor is now per-wheel evolved)"
```

---

## Task 6: Wire the host to the centroid + new car shape

**Files:**
- Modify: `src/diversions/boxcar2d/index.ts`

- [ ] **Step 1: Update imports**

In `index.ts`, change the `./car` import to add `carCentroid`:

```ts
import { buildCar, carCentroid, type CarBodies } from './car'
```

- [ ] **Step 2: `spawnCar` — drop the motor argument**

Replace the `buildCar` call (currently `index.ts:155-158`):

```ts
  const bodies = buildCar(state.world, g, { x: state.spawnX, y: state.spawnY })
```

- [ ] **Step 3: `endCurrentCar` — free node bodies instead of a chassis**

Replace `destroyBody(state.current.chassis)` and the wheel loop (currently `index.ts:191-192`):

```ts
  // free the finished car's bodies (the long-running leak guard)
  for (const nd of state.current.nodes) destroyBody(nd.body)
  for (const w of state.current.wheels) destroyBody(w.body)
```

- [ ] **Step 4: `stepCar` — track the centroid**

Replace `const x = getBodyPosition(state.current.chassis).x` (currently `index.ts:224`):

```ts
  const x = carCentroid(state.current).x
```

- [ ] **Step 5: `frame` — follow the centroid**

Replace `const cp = getBodyPosition(state.current.chassis)` (currently `index.ts:310`):

```ts
    const cp = carCentroid(state.current)
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS. (`getBodyPosition` may now be unused in `index.ts` — if tsc/eslint flags it, remove it from the `./physics` import. `createPolygonBody` is still used by rubble; keep it.)

- [ ] **Step 7: Commit**

```bash
git add src/diversions/boxcar2d/index.ts
git commit -m "feat(boxcar2d): track car centroid instead of a single chassis body"
```

---

## Task 7: Skeletal rendering (members, nodes, wheels)

**Files:**
- Modify: `src/diversions/boxcar2d/render.ts`

- [ ] **Step 1: Update the imports**

`carCentroid` lives in `./car`, the body reads in `./physics`. Replace the existing `./physics` import line with these two:

```ts
import { getBodyPosition, getBodyAngle, SCALE } from './physics'
import { carCentroid } from './car'
```

- [ ] **Step 2: Add a spring-drawing helper (top of the file, after `isLight`)**

```ts
const SPRING_THRESH = 0.55       // stiffness ≥ this draws as a straight bar
const SPRING_COLOR = '#7fd1c4'   // accent for springy members (high contrast vs sky)

/** Draw a coil between two canvas points — reads as a spring. */
function drawSpring(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len, px = -uy, py = ux
  const coils = 6, amp = 5, inset = len * 0.18
  const sx = x1 + ux * inset, sy = y1 + uy * inset
  const ex = x2 - ux * inset, ey = y2 - uy * inset
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(sx, sy)
  const seg = coils * 2
  for (let i = 1; i < seg; i++) {
    const t = i / seg
    const cx = sx + (ex - sx) * t, cy = sy + (ey - sy) * t
    const s = i % 2 ? 1 : -1
    ctx.lineTo(cx + px * amp * s, cy + py * amp * s)
  }
  ctx.lineTo(ex, ey)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}
```

- [ ] **Step 3: Replace the car-drawing block**

Replace everything from `// current car — wireframe...` through the `ctx.restore()` that closes the chassis transform (currently `render.ts:142-182`, i.e. up to and including the `ctx.restore()` on line 182 — but NOT the wheels block that follows) with:

```ts
  // current car — skeletal truss: members (bars/springs) + nodes, drawn directly
  // in world space (no per-body transform; each member spans two live node bodies).
  const car = s.current
  for (const mem of car.members) {
    const pa = getBodyPosition(car.nodes[mem.a].body)
    const pb = getBodyPosition(car.nodes[mem.b].body)
    const x1 = sx(pa.x), y1 = sy(pa.y), x2 = sx(pb.x), y2 = sy(pb.y)
    if (mem.stiffness >= SPRING_THRESH) {
      ctx.strokeStyle = s.cfg.color.chassis
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.lineTo(x2, y2)
      ctx.stroke()
    } else {
      ctx.strokeStyle = SPRING_COLOR
      ctx.lineWidth = 2.4
      drawSpring(ctx, x1, y1, x2, y2)
    }
  }
  // nodes — small filled dots in the chassis colour
  ctx.fillStyle = s.cfg.color.chassis
  for (const nd of car.nodes) {
    const p = getBodyPosition(nd.body)
    ctx.beginPath()
    ctx.arc(sx(p.x), sy(p.y), 3.5, 0, Math.PI * 2)
    ctx.fill()
  }
```

> The following wheels block (`for (const w of car.wheels) { ... }`) is unchanged — it already draws each wheel from its world body position and angle.

- [ ] **Step 4: Fix the HUD distance readout**

In the HUD block, the distance text used the old chassis position `cp`. Just above the `if (s.cfg.showHud)` block, add:

```ts
  const cp = carCentroid(car)
```

The existing HUD line `... cp.x - s.spawnX ...` then works against the centroid. (There is no longer a `const cp` earlier in the function, so this is the sole definition.)

- [ ] **Step 5: Typecheck + run the diversion's tests**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS (no references to `car.chassis` / `car.verts` remain).

Run: `npx vitest run src/diversions/boxcar2d`
Expected: PASS (render has no unit test; this confirms nothing else regressed).

- [ ] **Step 6: Commit**

```bash
git add src/diversions/boxcar2d/render.ts
git commit -m "feat(boxcar2d): skeletal truss rendering (spring/bar members + nodes)"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: PASS — all suites green (≈1443 prior + new triangulate tests; genome/car rewritten). If any boxcar2d test still imports a removed symbol (`N_VERTICES`, `chassisVertices`, `mags`, `N_WHEELS`), fix the import to the new API and re-run.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: PASS (Vite + tsc build completes).

- [ ] **Step 4: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(boxcar2d): green suite + build after truss-genome rewrite"
```

---

## Task 9: Code review

**Files:** none (review only)

- [ ] **Step 1: Dispatch the project reviewers**

Dispatch two agents in parallel against the branch diff:
- `diversion-reviewer` — UX invariants, schema-as-single-source-of-truth, URL-codec keystone (confirm removing the motor leaves doesn't break decode resilience; confirm everything stays rng/seed-deterministic).
- `perf-analyzer` — per-frame allocations in `render.ts` (the member/node loops run every frame), and the per-car body/joint lifecycle in `car.ts` + `index.ts` (every node body, wheel body, and distance joint must be freed — worlds are destroyed on teardown, but cars are freed individually in `endCurrentCar`; verify no leaked bodies across generations).

- [ ] **Step 2: Triage and apply**

Apply confirmed fixes (use `superpowers:receiving-code-review` for judgement). Re-run `npx vitest run` + `npx tsc --noEmit` after any change. Commit fixes:

```bash
git add -A
git commit -m "fix(boxcar2d): apply code-review findings"
```

---

## Task 10: Chrome visual verification

**Files:** none (manual verify gate)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background). Confirm the listening port (pinned 5180, but Vite may bump).

- [ ] **Step 2: Open in Chrome (chrome-devtools MCP, never the built-in preview)**

URL: `http://localhost:5180/d/boxcar2d/play?mute=1`

- [ ] **Step 3: Verify the live behaviour**
- Gen-1 cars are varied free-form trusses (not radial blobs): differing node counts, asymmetric shapes, visible spring coils (teal) vs rigid bars (amber), 1–6 wheels.
- At least some wheels visibly spin backward; some are free-rolling.
- Frames visibly flex/squish at soft members (suspension), hold shape at stiff ones.
- Cars improve generation over generation (HUD gen/best advances); camera follows smoothly; no car falls through terrain.
- Toggle terrain types / mode (distance vs time) — still works; no console errors.
- Confirm determinism: same seed reloads the same run.

- [ ] **Step 4: Hand off for user-verify-before-FF-merge**

Surface the URL and what to look at; wait for explicit user approval before squashing + FF-merging to `main` and closing #156.

---

## Self-Review

**Spec coverage:**
- Genome (nodes/pairs/wheels, counts, signed motor, every value a gene) → Task 3. ✅
- Delaunay-derived members + connectivity guarantee + collinear fallback → Task 1, consumed in Task 4. ✅
- Skeletal physics (node circle bodies collide, members = spring joints, no member collision) → Task 2 (joint seam) + Task 4 (build). ✅
- Per-wheel motor incl. reverse + powered toggle → Task 3 (genes) + Task 4 (wheel joint). ✅
- Centroid tracking (no single chassis) → Task 4 (`carCentroid`) + Task 6 (host wiring). ✅
- Schema: remove global motor sliders; codec resilience → Task 5. ✅
- Render skeletal (springs as coils, bars, nodes, wheels) → Task 7. ✅
- GA/fitness/modes/terrain/rubble unchanged; share-link determinism preserved → no-change verified (ga.ts/fitness.ts/schema fields), confirmed in Task 8/9/10. ✅
- Full replace, not a carType mode → no mode field added; old genome fully removed. ✅

**Placeholder scan:** none — every code step contains complete content.

**Type consistency:** `CarBodies` = `{ nodes:{body,slot}[]; members:{a,b,stiffness}[]; wheels:{body,radius}[] }` is defined in Task 4 and consumed identically in Tasks 6 (`state.current.nodes`) and 7 (`car.members`, `car.nodes`). `carCentroid(car): Vec2` defined Task 4, imported from `./car` in Tasks 6 & 7. `createDistanceJoint(worldId, {bodyA,bodyB,length,hertz,dampingRatio})` defined Task 2, called identically in Task 4. `pairIndex`, `MAX_NODES`, `N_PAIRS`, `DEFAULT_RANGES`, `crossover`, `mutate` names match between Task 3 and `ga.ts`/`index.ts` (unchanged). `buildCar(worldId, g, spawn)` (3 args) matches the Task 6 call site.
```
