# Flock vs Hunter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `flock-vs-hunter` diversion (#159) — a co-evolving boids-vs-predators screensaver where both sides evolve by a small float-gene GA, rendered on a 2D canvas with soft trails and a legible arms-race HUD.

**Architecture:** Discrete generations with *persistent bodies* (survivors keep positions across a generation boundary; only genomes hot-swap in place → never blinks). Fully deterministic from `(seed, config)`: fixed 1/60 timestep, `dt` ignored, named `mulberry32` sub-streams, a fixed 1600×900 virtual world rendered with a cached cover-fit transform. The deterministic core (`genome`/`ga`/`spatialHash`/`steering`) is stance-agnostic; the round scheduler in `sim.ts` is the only stance-specific glue. Reuses the BoxCar2D GA shape (`roulettePick`/`breedGeneration`/`annealedRate`).

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest (co-located `*.test.ts`), custom framework contract (`defineDiversion`), `mulberry32` from `framework/rng.ts`.

**Spec:** `docs/superpowers/specs/2026-06-30-flock-vs-hunter-design.md`

**Conventions (apply to every task):**
- Run tests with `npx vitest run <path>`; typecheck with `npx tsc --noEmit`.
- Commit message style: terse one-line, no trailers, no emoji.
- All files under `src/diversions/flock-vs-hunter/`.
- Constants: `const DT = 1 / 60`, `const WORLD_W = 1600`, `const WORLD_H = 900`.
- **Never** use `Math.random`/`Date.now` in sim/genome/ga; only seeded streams.

---

### Task 1: Genome primitives (`genome.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/genome.ts`
- Test: `src/diversions/flock-vs-hunter/genome.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// genome.test.ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { FLOCK_SPEC, PRED_SPEC, randomGenome, crossover, mutate, gene } from './genome'

describe('genome', () => {
  it('randomGenome produces one in-range value per gene, deterministically', () => {
    const a = randomGenome(FLOCK_SPEC, mulberry32(1))
    const b = randomGenome(FLOCK_SPEC, mulberry32(1))
    expect(Array.from(a)).toEqual(Array.from(b)) // deterministic
    expect(a.length).toBe(FLOCK_SPEC.length)
    FLOCK_SPEC.forEach((s, i) => {
      expect(a[i]).toBeGreaterThanOrEqual(s.min)
      expect(a[i]).toBeLessThanOrEqual(s.max)
    })
  })

  it('crossover child gene equals one of the two parents at each index', () => {
    const rng = mulberry32(7)
    const a = randomGenome(PRED_SPEC, mulberry32(2))
    const b = randomGenome(PRED_SPEC, mulberry32(3))
    const c = crossover(a, b, rng)
    for (let i = 0; i < c.length; i++) expect([a[i], b[i]]).toContain(c[i])
  })

  it('mutate stays clamped to range even at rate 1', () => {
    const g = randomGenome(FLOCK_SPEC, mulberry32(4))
    const m = mutate(g, 1, mulberry32(5), FLOCK_SPEC)
    FLOCK_SPEC.forEach((s, i) => {
      expect(m[i]).toBeGreaterThanOrEqual(s.min)
      expect(m[i]).toBeLessThanOrEqual(s.max)
    })
  })

  it('gene() reads a named gene by spec key', () => {
    const g = randomGenome(FLOCK_SPEC, mulberry32(6))
    expect(gene(g, FLOCK_SPEC, 'maxSpeed')).toBe(g[FLOCK_SPEC.findIndex(s => s.key === 'maxSpeed')])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/genome.test.ts`
Expected: FAIL — cannot find module `./genome`.

- [ ] **Step 3: Write minimal implementation**

```ts
// genome.ts — flat float-gene genomes for flock + predator. No topology, no
// epistasis → plain uniform per-gene crossover is correct (unlike boxcar2d's truss).
export interface GeneSpec { key: string; min: number; max: number }
export type Genome = Float32Array // length = spec.length

export const FLOCK_SPEC: GeneSpec[] = [
  { key: 'separationW', min: 0, max: 3 },
  { key: 'alignmentW', min: 0, max: 3 },
  { key: 'cohesionW', min: 0, max: 3 },
  { key: 'fearW', min: 0, max: 6 }, // can dominate → visible balling/scatter
  { key: 'fearRadius', min: 20, max: 200 }, // world units
  { key: 'maxSpeed', min: 40, max: 160 }, // world units / second
]
export const PRED_SPEC: GeneSpec[] = [
  { key: 'lungeThreshold', min: 20, max: 160 },
  { key: 'leadFactor', min: 0, max: 1.5 },
  { key: 'fixation', min: 0, max: 1 },
  { key: 'maxSpeed', min: 50, max: 200 }, // ≥ flock ceiling so catches are possible
  { key: 'staminaBurst', min: 1, max: 2.5 },
]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Read a gene by its spec key (dev-ergonomic; the hot loop uses raw indices). */
export function gene(g: Genome, spec: GeneSpec[], key: string): number {
  return g[spec.findIndex(s => s.key === key)]
}

export function randomGenome(spec: GeneSpec[], rng: () => number): Genome {
  const g = new Float32Array(spec.length)
  for (let i = 0; i < spec.length; i++) g[i] = lerp(spec[i].min, spec[i].max, rng()) // FIXED order
  return g
}

/** Uniform per-gene crossover — one rng draw per gene, fixed order. */
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  const c = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) c[i] = rng() < 0.5 ? a[i] : b[i]
  return c
}

/** Per-gene jitter (±25% of range) with probability `rate`, clamped. No repair
 *  needed — clamping keeps genes valid (no structural constraints). */
export function mutate(g: Genome, rate: number, rng: () => number, spec: GeneSpec[]): Genome {
  const m = new Float32Array(g.length)
  for (let i = 0; i < g.length; i++) {
    const { min, max } = spec[i]
    m[i] = rng() < rate ? clamp(g[i] + (rng() * 2 - 1) * (max - min) * 0.25, min, max) : g[i]
  }
  return m
}

/** Smootherstep lerp between two genomes → the generation morph (cosmetic). */
export function lerpGenome(a: Genome, b: Genome, s: number): Genome {
  const t = s * s * s * (s * (s * 6 - 15) + 10)
  const o = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) o[i] = a[i] + (b[i] - a[i]) * t
  return o
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/genome.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/genome.ts src/diversions/flock-vs-hunter/genome.test.ts
git commit -m "feat(flock-vs-hunter): float-gene genomes + crossover/mutate"
```

---

### Task 2: GA (`ga.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/ga.ts`
- Test: `src/diversions/flock-vs-hunter/ga.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// ga.test.ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { FLOCK_SPEC, randomGenome } from './genome'
import { breedGeneration, annealedRate, type Scored } from './ga'

const pool = (rng: () => number): Scored[] =>
  Array.from({ length: 8 }, (_, i) => ({ genome: randomGenome(FLOCK_SPEC, rng), fitness: i }))

describe('ga', () => {
  it('breedGeneration is deterministic for a fixed rng + pool', () => {
    const p = pool(mulberry32(1))
    const a = breedGeneration(p, { eliteCount: 2, mutationRate: 0.1, spec: FLOCK_SPEC }, mulberry32(9))
    const b = breedGeneration(p, { eliteCount: 2, mutationRate: 0.1, spec: FLOCK_SPEC }, mulberry32(9))
    expect(a.map(g => Array.from(g))).toEqual(b.map(g => Array.from(g)))
  })

  it('preserves population size and copies the top elite verbatim', () => {
    const p = pool(mulberry32(2))
    const next = breedGeneration(p, { eliteCount: 2, mutationRate: 0, spec: FLOCK_SPEC }, mulberry32(3))
    expect(next.length).toBe(p.length)
    const topGenome = [...p].sort((a, b) => b.fitness - a.fitness)[0].genome
    expect(Array.from(next[0])).toEqual(Array.from(topGenome)) // elite carried unchanged
  })

  it('annealedRate cools a peak toward 25% over 8 generations', () => {
    expect(annealedRate(0.2, 1)).toBeCloseTo(0.2)
    expect(annealedRate(0.2, 9)).toBeCloseTo(0.05) // 0.2 * 0.25
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/ga.test.ts`
Expected: FAIL — cannot find module `./ga`.

- [ ] **Step 3: Write minimal implementation**

```ts
// ga.ts — the BoxCar2D GA shape (roulette + elite + crossover + mutate), made
// generic over Float32Array genomes. Deterministic: fixed rng call order.
import { type Genome, type GeneSpec, crossover, mutate } from './genome'

export interface Scored { genome: Genome; fitness: number }

const EPS = 1e-6
const ANNEAL_GENS = 8
const MUTATION_FLOOR_FRAC = 0.25

/** Mutation rate for a generation: gen-1 peak → floor (peak·0.25) by gen 9. */
export function annealedRate(peak: number, generation: number): number {
  const floor = peak * MUTATION_FLOOR_FRAC
  const t = Math.min(1, Math.max(0, (generation - 1) / ANNEAL_GENS))
  return peak + (floor - peak) * t
}

export function roulettePick(scored: Scored[], rng: () => number): Genome {
  const total = scored.reduce((s, x) => s + Math.max(EPS, x.fitness), 0)
  let r = rng() * total
  for (const x of scored) {
    r -= Math.max(EPS, x.fitness)
    if (r <= 0) return x.genome
  }
  return scored[scored.length - 1].genome
}

export function breedGeneration(
  scored: Scored[],
  opts: { eliteCount: number; mutationRate: number; spec: GeneSpec[] },
  rng: () => number,
): Genome[] {
  const ranked = [...scored].sort((a, b) => b.fitness - a.fitness)
  const size = ranked.length
  const elite = Math.min(opts.eliteCount, size)
  const next: Genome[] = ranked.slice(0, elite).map(s => s.genome)
  while (next.length < size) {
    const a = roulettePick(ranked, rng)
    const b = roulettePick(ranked, rng)
    next.push(mutate(crossover(a, b, rng), opts.mutationRate, rng, opts.spec))
  }
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/ga.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/ga.ts src/diversions/flock-vs-hunter/ga.test.ts
git commit -m "feat(flock-vs-hunter): reusable roulette+elite GA with annealing"
```

---

### Task 3: Spatial hash (`spatialHash.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/spatialHash.ts`
- Test: `src/diversions/flock-vs-hunter/spatialHash.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// spatialHash.test.ts
import { describe, it, expect } from 'vitest'
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'

const WORLD_W = 1600, WORLD_H = 900, R = 64

function brute(px: Float32Array, py: Float32Array, n: number, i: number, r: number): number[] {
  const out: number[] = []
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    const dx = px[j] - px[i], dy = py[j] - py[i]
    if (dx * dx + dy * dy <= r * r) out.push(j)
  }
  return out.sort((a, b) => a - b)
}

describe('SpatialHash', () => {
  it('neighborsWithin matches brute-force for a seeded cloud', () => {
    const rng = mulberry32(42)
    const n = 300
    const px = new Float32Array(n), py = new Float32Array(n)
    for (let i = 0; i < n; i++) { px[i] = rng() * WORLD_W; py[i] = rng() * WORLD_H }
    const hash = new SpatialHash(WORLD_W, WORLD_H, R)
    hash.rebuild(px, py, n)
    for (let i = 0; i < n; i++) {
      const got: number[] = []
      hash.neighborsWithin(px, py, i, R, 999, (j) => got.push(j))
      expect(got.sort((a, b) => a - b)).toEqual(brute(px, py, n, i, R))
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/spatialHash.test.ts`
Expected: FAIL — cannot find module `./spatialHash`.

- [ ] **Step 3: Write minimal implementation**

```ts
// spatialHash.ts — uniform grid, intrusive linked list over preallocated typed
// arrays → ZERO per-frame allocation, deterministic ascending-index iteration.
export class SpatialHash {
  private cols: number
  private rows: number
  private cell: number
  private head: Int32Array
  private next: Int32Array

  constructor(worldW: number, worldH: number, cellSize: number, maxN = 4096) {
    this.cell = cellSize
    this.cols = Math.ceil(worldW / cellSize)
    this.rows = Math.ceil(worldH / cellSize)
    this.head = new Int32Array(this.cols * this.rows)
    this.next = new Int32Array(maxN)
  }

  private cellIndex(x: number, y: number): number {
    let cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell)
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1
    return cy * this.cols + cx
  }

  /** Refill buckets by iterating 0..n in order → bucket chains are ascending-index. */
  rebuild(px: Float32Array, py: Float32Array, n: number): void {
    this.head.fill(-1)
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(px[i], py[i])
      this.next[i] = this.head[c]
      this.head[c] = i
    }
  }

  /** Visit up to `cap` neighbors of boid `i` within `r` (3×3 cell block). */
  neighborsWithin(
    px: Float32Array, py: Float32Array, i: number, r: number, cap: number,
    visit: (j: number) => void,
  ): void {
    const r2 = r * r
    let cx = Math.floor(px[i] / this.cell), cy = Math.floor(py[i] / this.cell)
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1
    let count = 0
    for (let gy = cy - 1; gy <= cy + 1; gy++) {
      if (gy < 0 || gy >= this.rows) continue
      for (let gx = cx - 1; gx <= cx + 1; gx++) {
        if (gx < 0 || gx >= this.cols) continue
        let j = this.head[gy * this.cols + gx]
        while (j !== -1) {
          if (j !== i) {
            const dx = px[j] - px[i], dy = py[j] - py[i]
            if (dx * dx + dy * dy <= r2) { visit(j); if (++count >= cap) return }
          }
          j = this.next[j]
        }
      }
    }
  }
}
```

Note: the test uses `R = 64` as both cell size and query radius, so the 3×3 block fully covers the radius (query radius ≤ cell size is the invariant the sim also honors). `cap = 999` in the test disables the cap so it matches brute-force exactly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/spatialHash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/spatialHash.ts src/diversions/flock-vs-hunter/spatialHash.test.ts
git commit -m "feat(flock-vs-hunter): allocation-free spatial hash grid"
```

---

### Task 4: Steering (`steering.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/steering.ts`
- Test: `src/diversions/flock-vs-hunter/steering.test.ts`

Steering is pure math over the SoA arrays. It writes acceleration into caller-provided `outX/outY` scalars via a small returned object (no per-call allocation in the hot loop is achieved by the sim reusing one scratch object — but for testability the functions take explicit args and return `{ax, ay}`; the sim will inline the same math). Test directional invariants.

- [ ] **Step 1: Write the failing test**

```ts
// steering.test.ts
import { describe, it, expect } from 'vitest'
import { flockAccel, predatorAim } from './steering'

// Minimal world helper: two boids, no predators.
function world(positions: [number, number][], vels: [number, number][]) {
  const n = positions.length
  const px = new Float32Array(n), py = new Float32Array(n)
  const vx = new Float32Array(n), vy = new Float32Array(n)
  positions.forEach(([x, y], i) => { px[i] = x; py[i] = y })
  vels.forEach(([x, y], i) => { vx[i] = x; vy[i] = y })
  return { px, py, vx, vy, n }
}

describe('steering', () => {
  it('separation pushes a boid away from a close neighbor', () => {
    const w = world([[100, 100], [110, 100]], [[0, 0], [0, 0]])
    // boid 0 has neighbor 1 to its right → separation ax should be negative (leftward)
    const a = flockAccel(w.px, w.py, w.vx, w.vy, 0, [1], [],
      { separationW: 2, alignmentW: 0, cohesionW: 0, fearW: 0, fearRadius: 100, maxForce: 999 },
      new Float32Array(0), new Float32Array(0), new Float32Array(0), new Float32Array(0))
    expect(a.ax).toBeLessThan(0)
  })

  it('fear points away from a predator', () => {
    const w = world([[100, 100]], [[0, 0]])
    const ppx = new Float32Array([120, 100]) // predator to the right
    const ppy = new Float32Array([100, 100])
    const a = flockAccel(w.px, w.py, w.vx, w.vy, 0, [], [0],
      { separationW: 0, alignmentW: 0, cohesionW: 0, fearW: 5, fearRadius: 100, maxForce: 999 },
      ppx, ppy, new Float32Array(1), new Float32Array(1))
    expect(a.ax).toBeLessThan(0) // flees left, away from the predator on the right
  })

  it('predatorAim leads ahead of the target along its velocity', () => {
    // target at x=0 moving +x → aim leads ahead of its current position
    const aim = predatorAim(0, 0, 100, 0, 40, 0, 1)
    expect(aim.x).toBeGreaterThan(0)
    // a bigger lead factor aims further ahead
    const more = predatorAim(0, 0, 100, 0, 40, 0, 1.5)
    expect(more.x).toBeGreaterThan(aim.x)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/steering.test.ts`
Expected: FAIL — cannot find module `./steering`.

- [ ] **Step 3: Write minimal implementation**

```ts
// steering.ts — pure boids + predator steering. Deterministic (no rng); all math
// is a function of positions/velocities/genes. The sim calls these per tick.
export interface FlockParams {
  separationW: number; alignmentW: number; cohesionW: number
  fearW: number; fearRadius: number; maxForce: number
}

const norm = (x: number, y: number): [number, number] => {
  const m = Math.hypot(x, y)
  return m > 1e-6 ? [x / m, y / m] : [0, 0]
}

/**
 * Flock acceleration for boid `i` over neighbor indices `neigh` (already within
 * perception radius) and predator indices `pred` (within fearRadius, checked here).
 * Returns {ax, ay} clamped to maxForce. Caller passes predator SoA arrays.
 */
export function flockAccel(
  px: Float32Array, py: Float32Array, vx: Float32Array, vy: Float32Array,
  i: number, neigh: number[], pred: number[], p: FlockParams,
  ppx: Float32Array, ppy: Float32Array, _pvx: Float32Array, _pvy: Float32Array,
): { ax: number; ay: number } {
  let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0
  for (const j of neigh) {
    const dx = px[i] - px[j], dy = py[i] - py[j]
    const d2 = dx * dx + dy * dy || 1e-6
    sepX += dx / d2; sepY += dy / d2 // inverse-square shove apart
    aliX += vx[j]; aliY += vy[j]
    cohX += px[j]; cohY += py[j]
  }
  let ax = 0, ay = 0
  if (neigh.length > 0) {
    const [sx, sy] = norm(sepX, sepY)
    ax += sx * p.separationW; ay += sy * p.separationW
    const [alx, aly] = norm(aliX / neigh.length - vx[i], aliY / neigh.length - vy[i])
    ax += alx * p.alignmentW; ay += aly * p.alignmentW
    const [cx, cy] = norm(cohX / neigh.length - px[i], cohY / neigh.length - py[i])
    ax += cx * p.cohesionW; ay += cy * p.cohesionW
  }
  for (const k of pred) {
    const dx = px[i] - ppx[k], dy = py[i] - ppy[k]
    const d = Math.hypot(dx, dy)
    if (d < p.fearRadius && d > 1e-6) {
      const falloff = 1 - d / p.fearRadius
      ax += (dx / d) * p.fearW * falloff
      ay += (dy / d) * p.fearW * falloff
    }
  }
  const m = Math.hypot(ax, ay)
  if (m > p.maxForce) { ax = (ax / m) * p.maxForce; ay = (ay / m) * p.maxForce }
  return { ax, ay }
}

/** Aim point ahead of a target along its velocity (predator lead). */
export function predatorAim(
  tx: number, ty: number, tvx: number, tvy: number,
  _hx: number, _hy: number, leadFactor: number,
): { x: number; y: number } {
  // constant lead horizon (seconds) scaled by leadFactor gene
  const HORIZON = 0.5
  return { x: tx + tvx * leadFactor * HORIZON, y: ty + tvy * leadFactor * HORIZON }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/steering.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/steering.ts src/diversions/flock-vs-hunter/steering.test.ts
git commit -m "feat(flock-vs-hunter): pure boids + predator steering"
```

---

### Task 5: Sim state + one tick, no evolution yet (`sim.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/sim.ts`
- Test: `src/diversions/flock-vs-hunter/sim.test.ts`

This task builds the `Ecosystem` state, `createSim`, and `stepSim` covering movement + catch + fitness accrual + `tickCount++`, using fixed `DT` and the RNG sub-streams. Evolution (round boundary + breeding) is added in Task 6. `SimConfig` is a plain subset of the eventual schema config so `sim.ts` has no schema dependency.

- [ ] **Step 1: Write the failing test**

```ts
// sim.test.ts
import { describe, it, expect } from 'vitest'
import { createSim, stepSim, DEFAULT_SIM_CONFIG, hashState, type SimConfig } from './sim'

const cfg: SimConfig = { ...DEFAULT_SIM_CONFIG, boidCount: 120, predatorCount: 3, seed: 42 }

describe('sim (movement + catch)', () => {
  it('is deterministic: same seed+config → identical state after 600 ticks', () => {
    const a = createSim(cfg); for (let i = 0; i < 600; i++) stepSim(a)
    const b = createSim(cfg); for (let i = 0; i < 600; i++) stepSim(b)
    expect(hashState(a)).toBe(hashState(b))
  })

  it('advances tickCount and keeps positions inside the wrapped world', () => {
    const s = createSim(cfg)
    for (let i = 0; i < 300; i++) stepSim(s)
    expect(s.tickCount).toBe(300)
    for (let i = 0; i < s.n; i++) {
      expect(s.px[i]).toBeGreaterThanOrEqual(0)
      expect(s.px[i]).toBeLessThan(1600)
      expect(s.py[i]).toBeGreaterThanOrEqual(0)
      expect(s.py[i]).toBeLessThan(900)
    }
  })

  it('records at least one catch over a long run with dense prey', () => {
    const s = createSim({ ...cfg, boidCount: 200, predatorCount: 5 })
    let kills = 0
    for (let i = 0; i < 2000; i++) { stepSim(s); kills = s.totalKills }
    expect(kills).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/sim.test.ts`
Expected: FAIL — cannot find module `./sim`.

- [ ] **Step 3: Write minimal implementation**

```ts
// sim.ts — the deterministic ecosystem. Fixed 1/60 timestep, seeded sub-streams,
// fixed 1600×900 virtual world with toroidal wrap. Task 5 = movement/catch/fitness;
// Task 6 adds the round scheduler + breeding.
import { mulberry32 } from '../../framework/rng'
import { SpatialHash } from './spatialHash'
import { flockAccel, predatorAim } from './steering'
import {
  FLOCK_SPEC, PRED_SPEC, randomGenome, gene, type Genome,
} from './genome'

export const DT = 1 / 60
export const WORLD_W = 1600
export const WORLD_H = 900
const PERCEPTION = 64 // world units; == spatial-hash cell size
const CATCH_R = 8
const MAX_NEIGHBORS = 24
const MAX_FORCE = 400 // accel clamp (world units / s²)
const LUNGE_STEPS = 48 // ~0.8 s at 60 Hz
const FATIGUE_FRAC = 0.7

export interface SimConfig {
  boidCount: number
  predatorCount: number
  seed: number
  roundLength: number // seconds (used in Task 6)
  flockMutationRate: number
  predMutationRate: number
  flockElites: number
  predElites: number
  immigrateEvery: number
  seasons: boolean
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  boidCount: 240, predatorCount: 4, seed: 42, roundLength: 22,
  flockMutationRate: 0.12, predMutationRate: 0.15, flockElites: 6, predElites: 1,
  immigrateEvery: 6, seasons: true,
}

export interface Ecosystem {
  cfg: SimConfig
  n: number // flock count
  pn: number // predator count
  // flock SoA
  px: Float32Array; py: Float32Array; vx: Float32Array; vy: Float32Array
  alive: Uint8Array
  survival: Float32Array // ticks alive this round (fitness accumulator)
  flockGenomes: Genome[]
  // predator SoA
  ppx: Float32Array; ppy: Float32Array; pvx: Float32Array; pvy: Float32Array
  predGenomes: Genome[]
  predKills: Float32Array // kills this round (fitness)
  predTarget: Int32Array // current target boid index, or -1
  predLunge: Int32Array // remaining lunge steps, or 0
  totalKills: number
  tickCount: number
  generation: number
  // rng sub-streams
  rngSpawn: () => number
  rngEvo: () => number
  rngTick: () => number
  hash: SpatialHash
  // scratch neighbor buffer (reused; no per-tick alloc)
  _neigh: number[]
  // determinism observability (filled in Task 6)
  gen1Elite?: { flock: number[]; pred: number[] }
  gen3Elite?: { flock: number[]; pred: number[] }
}

const wrap = (v: number, hi: number) => ((v % hi) + hi) % hi

export function createSim(cfg: SimConfig): Ecosystem {
  const rngSpawn = mulberry32((cfg.seed ^ 0x1a2b3c4d) >>> 0)
  const rngEvo = mulberry32((cfg.seed ^ 0x9e3779b9) >>> 0)
  const rngTick = mulberry32((cfg.seed ^ 0x517cc1b7) >>> 0)
  const n = cfg.boidCount, pn = cfg.predatorCount
  const s: Ecosystem = {
    cfg, n, pn,
    px: new Float32Array(n), py: new Float32Array(n),
    vx: new Float32Array(n), vy: new Float32Array(n),
    alive: new Uint8Array(n).fill(1),
    survival: new Float32Array(n),
    flockGenomes: Array.from({ length: n }, () => randomGenome(FLOCK_SPEC, rngSpawn)),
    ppx: new Float32Array(pn), ppy: new Float32Array(pn),
    pvx: new Float32Array(pn), pvy: new Float32Array(pn),
    predGenomes: Array.from({ length: pn }, () => randomGenome(PRED_SPEC, rngSpawn)),
    predKills: new Float32Array(pn),
    predTarget: new Int32Array(pn).fill(-1),
    predLunge: new Int32Array(pn),
    totalKills: 0, tickCount: 0, generation: 1,
    rngSpawn, rngEvo, rngTick,
    hash: new SpatialHash(WORLD_W, WORLD_H, PERCEPTION),
    _neigh: [],
  }
  for (let i = 0; i < n; i++) {
    s.px[i] = rngSpawn() * WORLD_W; s.py[i] = rngSpawn() * WORLD_H
    const ang = rngSpawn() * Math.PI * 2
    s.vx[i] = Math.cos(ang) * 20; s.vy[i] = Math.sin(ang) * 20
  }
  for (let k = 0; k < pn; k++) {
    s.ppx[k] = rngSpawn() * WORLD_W; s.ppy[k] = rngSpawn() * WORLD_H
  }
  return s
}

/** Deterministic "seasons": ±10% predator-speed multiplier from tickCount. */
function seasonMul(s: Ecosystem): number {
  if (!s.cfg.seasons) return 1
  return 1 + 0.1 * Math.sin(s.tickCount / (60 * 180) * Math.PI * 2) // ~3 min period
}

export function stepSim(s: Ecosystem): void {
  s.hash.rebuild(s.px, s.py, s.n)
  const seas = seasonMul(s)

  // — flock —
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) continue
    s.survival[i] += 1
    const g = s.flockGenomes[i]
    s._neigh.length = 0
    const nb = s._neigh
    s.hash.neighborsWithin(s.px, s.py, i, PERCEPTION, MAX_NEIGHBORS, (j) => { if (s.alive[j]) nb.push(j) })
    // predators within fear are checked inside flockAccel; pass all predator indices
    const predIdx: number[] = []
    for (let k = 0; k < s.pn; k++) predIdx.push(k)
    const a = flockAccel(
      s.px, s.py, s.vx, s.vy, i, nb, predIdx,
      {
        separationW: gene(g, FLOCK_SPEC, 'separationW'),
        alignmentW: gene(g, FLOCK_SPEC, 'alignmentW'),
        cohesionW: gene(g, FLOCK_SPEC, 'cohesionW'),
        fearW: gene(g, FLOCK_SPEC, 'fearW'),
        fearRadius: gene(g, FLOCK_SPEC, 'fearRadius'),
        maxForce: MAX_FORCE,
      },
      s.ppx, s.ppy, s.pvx, s.pvy,
    )
    s.vx[i] += a.ax * DT; s.vy[i] += a.ay * DT
    const maxSpeed = gene(g, FLOCK_SPEC, 'maxSpeed')
    const sp = Math.hypot(s.vx[i], s.vy[i])
    if (sp > maxSpeed) { s.vx[i] = (s.vx[i] / sp) * maxSpeed; s.vy[i] = (s.vy[i] / sp) * maxSpeed }
    s.px[i] = wrap(s.px[i] + s.vx[i] * DT, WORLD_W)
    s.py[i] = wrap(s.py[i] + s.vy[i] * DT, WORLD_H)
  }

  // — predators —
  for (let k = 0; k < s.pn; k++) {
    const g = s.predGenomes[k]
    const fixation = gene(g, PRED_SPEC, 'fixation')
    const leadFactor = gene(g, PRED_SPEC, 'leadFactor')
    const lunge = gene(g, PRED_SPEC, 'lungeThreshold')
    const burst = gene(g, PRED_SPEC, 'staminaBurst')
    let maxSpeed = gene(g, PRED_SPEC, 'maxSpeed') * seas
    // choose target: keep if fixated + alive, else re-pick nearest (tie → lowest idx)
    let t = s.predTarget[k]
    const reTarget = t < 0 || !s.alive[t] || s.rngTick() > fixation
    if (reTarget) {
      let best = -1, bestD = Infinity
      for (let i = 0; i < s.n; i++) {
        if (!s.alive[i]) continue
        const dx = s.px[i] - s.ppx[k], dy = s.py[i] - s.ppy[k]
        const d2 = dx * dx + dy * dy
        if (d2 < bestD) { bestD = d2; best = i }
      }
      t = best
    }
    s.predTarget[k] = t
    if (t < 0) continue
    const aim = predatorAim(s.px[t], s.py[t], s.vx[t], s.vy[t], s.ppx[k], s.ppy[k], leadFactor)
    const dx = aim.x - s.ppx[k], dy = aim.y - s.ppy[k]
    const d = Math.hypot(dx, dy) || 1e-6
    // lunge state
    const distTarget = Math.hypot(s.px[t] - s.ppx[k], s.py[t] - s.ppy[k])
    if (s.predLunge[k] > 0) s.predLunge[k] -= 1
    else if (distTarget < lunge) s.predLunge[k] = LUNGE_STEPS
    const speed = s.predLunge[k] > 0 ? maxSpeed * burst : maxSpeed * FATIGUE_FRAC
    s.pvx[k] = (dx / d) * speed; s.pvy[k] = (dy / d) * speed
    s.ppx[k] = wrap(s.ppx[k] + s.pvx[k] * DT, WORLD_W)
    s.ppy[k] = wrap(s.ppy[k] + s.pvy[k] * DT, WORLD_H)
    // catch: nearest alive prey within CATCH_R (tie → lowest idx)
    for (let i = 0; i < s.n; i++) {
      if (!s.alive[i]) continue
      const cdx = s.px[i] - s.ppx[k], cdy = s.py[i] - s.ppy[k]
      if (cdx * cdx + cdy * cdy <= CATCH_R * CATCH_R) {
        s.alive[i] = 0; s.predKills[k] += 1; s.totalKills += 1
        if (s.predTarget[k] === i) s.predTarget[k] = -1
        break
      }
    }
  }

  s.tickCount += 1
}

/** Cheap order-independent state hash for the determinism test. */
export function hashState(s: Ecosystem): string {
  let h = 2166136261 >>> 0
  const mix = (v: number) => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0 }
  for (let i = 0; i < s.n; i++) {
    mix(s.px[i] * 1000); mix(s.py[i] * 1000); mix(s.vx[i] * 1000); mix(s.alive[i])
    for (let g = 0; g < FLOCK_SPEC.length; g++) mix(s.flockGenomes[i][g] * 1000)
  }
  for (let k = 0; k < s.pn; k++) { mix(s.ppx[k] * 1000); mix(s.ppy[k] * 1000); mix(s.predKills[k]) }
  mix(s.tickCount); mix(s.generation)
  return (h >>> 0).toString(16)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/sim.test.ts`
Expected: PASS (3 tests). If the catch test fails, raise the loop to 4000 ticks — with random gen-0 genomes some seeds are slow to land a first catch (the assertion only needs one).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/sim.ts src/diversions/flock-vs-hunter/sim.test.ts
git commit -m "feat(flock-vs-hunter): deterministic ecosystem tick (movement+catch)"
```

---

### Task 6: Round scheduler + breeding + anti-stagnation (`sim.ts`)

**Files:**
- Modify: `src/diversions/flock-vs-hunter/sim.ts`
- Modify: `src/diversions/flock-vs-hunter/sim.test.ts`

Add generation turnover to `stepSim`: when `tickCount` hits a round boundary, score both populations, breed, hot-swap genomes onto surviving bodies, respawn dead slots at the flock centroid, apply immigration, capture gen1/gen3 elites. This is the stance-specific scheduler.

- [ ] **Step 1: Write the failing test (append to sim.test.ts)**

```ts
import { createSim as mk, stepSim as tick, DEFAULT_SIM_CONFIG as D, hashState as hs } from './sim'

describe('sim (evolution)', () => {
  const cfg = { ...D, boidCount: 120, predatorCount: 3, seed: 7, roundLength: 2 } // 2s = 120 ticks

  it('turns the generation over at the round boundary and refills the flock', () => {
    const s = mk(cfg)
    for (let i = 0; i < 120; i++) tick(s) // exactly one full round → the boundary
    expect(s.generation).toBe(2)
    let aliveCount = 0
    for (let i = 0; i < s.n; i++) aliveCount += s.alive[i]
    expect(aliveCount).toBe(s.n) // flock refilled to full at the round boundary
  })

  it('stays deterministic through several generations (breeding + immigration)', () => {
    const a = mk(cfg); for (let i = 0; i < 800; i++) tick(a)
    const b = mk(cfg); for (let i = 0; i < 800; i++) tick(b)
    expect(hs(a)).toBe(hs(b))
    expect(a.gen1Elite).toBeDefined()
    expect(a.gen3Elite).toBeDefined()
    expect(a.gen3Elite).toEqual(b.gen3Elite) // post-setup rng stream reproduces
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/sim.test.ts`
Expected: FAIL — `generation` stays 1 (no boundary logic yet).

- [ ] **Step 3: Write minimal implementation**

Add imports at the top of `sim.ts`:

```ts
import { breedGeneration, annealedRate, type Scored } from './ga'
import { randomGenome as rnd } from './genome'
```

Add the `endRound` function and call it from `stepSim` just before `s.tickCount += 1`:

```ts
// ── in stepSim, replace the final `s.tickCount += 1` with: ──
  s.tickCount += 1
  if (s.tickCount % Math.round(s.cfg.roundLength * 60) === 0) endRound(s)
```

```ts
function centroid(s: Ecosystem): { x: number; y: number; vx: number; vy: number } {
  let x = 0, y = 0, vx = 0, vy = 0, c = 0
  for (let i = 0; i < s.n; i++) if (s.alive[i]) { x += s.px[i]; y += s.py[i]; vx += s.vx[i]; vy += s.vy[i]; c++ }
  if (c === 0) return { x: WORLD_W / 2, y: WORLD_H / 2, vx: 0, vy: 0 }
  return { x: x / c, y: y / c, vx: vx / c, vy: vy / c }
}

function endRound(s: Ecosystem): void {
  // score
  const roundTicks = Math.round(s.cfg.roundLength * 60)
  const flockScored: Scored[] = s.flockGenomes.map((genome, i) => ({ genome, fitness: s.survival[i] / roundTicks }))
  const predScored: Scored[] = s.predGenomes.map((genome, k) => ({ genome, fitness: s.predKills[k] }))
  // breed (rngEvo, flock then predator — fixed order)
  const fRate = annealedRate(s.cfg.flockMutationRate, s.generation)
  const pRate = annealedRate(s.cfg.predMutationRate, s.generation)
  let nextFlock = breedGeneration(flockScored, { eliteCount: s.cfg.flockElites, mutationRate: fRate, spec: FLOCK_SPEC }, s.rngEvo)
  let nextPred = breedGeneration(predScored, { eliteCount: s.cfg.predElites, mutationRate: pRate, spec: PRED_SPEC }, s.rngEvo)
  // immigration: replace the weakest ~10% with fresh random genomes (rngEvo)
  if (s.cfg.immigrateEvery > 0 && s.generation % s.cfg.immigrateEvery === 0) {
    const fImm = Math.max(1, Math.floor(s.n * 0.1))
    for (let m = 0; m < fImm; m++) nextFlock[s.n - 1 - m] = rnd(FLOCK_SPEC, s.rngEvo)
    const pImm = Math.max(1, Math.floor(s.pn * 0.1))
    for (let m = 0; m < pImm; m++) nextPred[s.pn - 1 - m] = rnd(PRED_SPEC, s.rngEvo)
  }
  // install: survivors keep bodies; dead slots respawn at the flock centroid
  const c = centroid(s)
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) {
      s.px[i] = wrap(c.x + (s.rngSpawn() * 2 - 1) * 30, WORLD_W)
      s.py[i] = wrap(c.y + (s.rngSpawn() * 2 - 1) * 30, WORLD_H)
      s.vx[i] = c.vx; s.vy[i] = c.vy
      s.alive[i] = 1
    }
    s.flockGenomes[i] = nextFlock[i]
    s.survival[i] = 0
  }
  for (let k = 0; k < s.pn; k++) { s.predGenomes[k] = nextPred[k]; s.predKills[k] = 0 }
  s.generation += 1
  // determinism observability
  const elite = (gs: Genome[]) => Array.from(gs[0])
  if (s.generation === 2) s.gen1Elite = { flock: elite(nextFlock), pred: elite(nextPred) }
  if (s.generation === 4) s.gen3Elite = { flock: elite(nextFlock), pred: elite(nextPred) }
}
```

Note: `gen1Elite` is captured when entering generation 2 (i.e. the result of breeding generation 1), matching BoxCar2D's "firstGenFitness after the first breed" convention; `gen3Elite` after the third breed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/sim.test.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/sim.ts src/diversions/flock-vs-hunter/sim.test.ts
git commit -m "feat(flock-vs-hunter): generation scheduler with persistent bodies"
```

---

### Task 7: Schema + presets (`schema.ts`, `presets.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/schema.ts`
- Create: `src/diversions/flock-vs-hunter/presets.ts`
- Test: `src/diversions/flock-vs-hunter/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// schema.test.ts
import { describe, it, expect } from 'vitest'
import { flockVsHunterSchema } from './schema'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'
import { readMeta } from '../../framework/fieldMeta'

describe('flock-vs-hunter schema', () => {
  it('parses to calm defaults', () => {
    const cfg = flockVsHunterSchema.parse({})
    expect(cfg.boidCount).toBe(240)
    expect(cfg.predatorCount).toBe(4)
    expect(cfg.roundLength).toBe(22)
    expect(cfg.speed).toBe(1)
  })

  it('every slider field declares min and max (UX invariant 4)', () => {
    for (const [key, field] of Object.entries(flockVsHunterSchema.shape)) {
      const m = readMeta(field as any)
      if (m?.ui === 'slider') {
        expect(m.min, `${key} min`).toBeTypeOf('number')
        expect(m.max, `${key} max`).toBeTypeOf('number')
      }
    }
  })

  it('round-trips through the URL codec', () => {
    const cfg = flockVsHunterSchema.parse({ seed: 999, boidCount: 180 })
    const decoded = decodeConfig(flockVsHunterSchema, encodeConfig(flockVsHunterSchema, cfg))
    expect(decoded).toEqual(cfg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/schema.test.ts`
Expected: FAIL — cannot find module `./schema`.

- [ ] **Step 3: Write minimal implementation**

```ts
// schema.ts — single source of truth (form + URL codec + Config type).
import { z } from 'zod'

export const flockVsHunterSchema = z.object({
  boidCount: z.number().int().min(80).max(400).default(240)
    .meta({ section: 'Ecosystem', ui: 'slider', min: 80, max: 400, step: 10, label: 'Flock size',
            help: 'Boids in the flock. Each carries its own steering genes and breeds into the next generation. 240 stays 60fps and reads as a body.' }),
  predatorCount: z.number().int().min(1).max(8).default(4)
    .meta({ section: 'Ecosystem', ui: 'slider', min: 1, max: 8, step: 1, label: 'Hunters',
            help: 'Predators hunting the flock. A few keeps the pressure legible.' }),
  roundLength: z.number().min(12).max(45).default(22)
    .meta({ section: 'Evolution', ui: 'slider', min: 12, max: 45, step: 1, label: 'Generation length (s)',
            help: 'Seconds each generation runs before both flock and hunters breed. Longer = fairer scoring; shorter = more frequent generational beats.' }),
  morphSeconds: z.number().min(0).max(2.5).default(0.8)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 2.5, step: 0.1, label: 'Behavior morph',
            help: 'How long a new generation eases into its behavior. The flock keeps its positions and morphs — never a hard reset. 0 = instant.' }),
  flockMutationRate: z.number().min(0).max(1).default(0.12)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Flock mutation',
            help: 'Chance each flock gene drifts when breeding (a generation-1 peak that cools over the next several). Low = a calm, felt arms race.' }),
  predMutationRate: z.number().min(0).max(1).default(0.15)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 1, step: 0.01, label: 'Hunter mutation',
            help: 'Chance each hunter gene drifts. Slightly higher than the flock so the tiny hunter population keeps exploring.' }),
  flockElites: z.number().int().min(0).max(20).default(6)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 20, step: 1, label: 'Flock elites',
            help: 'Fittest boids copied unchanged into the next generation. Keep well below flock size.' }),
  predElites: z.number().int().min(0).max(4).default(1)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 4, step: 1, label: 'Hunter elites',
            help: 'Best hunters carried over verbatim so a good strategy is never lost.' }),
  immigrateEvery: z.number().int().min(0).max(20).default(6)
    .meta({ section: 'Evolution', ui: 'slider', min: 0, max: 20, step: 1, label: 'Fresh blood every (gens)',
            help: 'Every N generations, the weakest few of each population are replaced by brand-new random genes — keeps an all-night run from converging and going static. 0 = off.' }),
  seasons: z.boolean().default(true)
    .meta({ section: 'Evolution', ui: 'toggle', label: 'Seasons',
            help: 'Slowly breathe the hunters\' top speed up and down over minutes so the advantage keeps trading between hunter and hunted.' }),
  trailFade: z.number().min(0).max(0.6).default(0.12)
    .meta({ section: 'Look', ui: 'slider', min: 0, max: 0.6, step: 0.01, label: 'Trail length',
            help: 'How slowly the previous frame fades. Higher = longer, dreamier motion trails. 0 = crisp, no trails.' }),
  flockColors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(1).max(6)
    .default(['#7fd4ffcc', '#a9e7ffcc', '#d8f3ffcc'])
    .meta({ section: 'Look', ui: 'colorList', min: 1, max: 6, label: 'Flock colors',
            help: 'Boids tint by current speed across these. Cool + soft reads as a calm murmuration.' }),
  predatorColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ff3b30')
    .meta({ section: 'Look', ui: 'color', label: 'Hunter color',
            help: 'A bold, high-contrast color so the predators pop against the flock.' }),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#05070d')
    .meta({ section: 'Look', ui: 'color', label: 'Background', help: 'Trails fade toward this colour.' }),
  showHud: z.boolean().default(true)
    .meta({ section: 'Look', ui: 'toggle', label: 'Show HUD',
            help: 'Generation, survivor %, evolving strategy bars, and the survival sparkline.' }),
  speed: z.number().int().min(1).max(4).default(1)
    .meta({ section: 'Motion', ui: 'slider', min: 1, max: 4, step: 1, label: 'Speed',
            help: 'Visual fast-forward — sim steps per frame. Changes only how fast you watch, never the outcome.' }),
  seed: z.number().int().default(31337)
    .meta({ section: 'Advanced', ui: 'number', step: 1, label: 'Seed', randomizeOnFreshLoad: true,
            help: 'Any integer. The same seed + settings always replays the same hunt. A fresh visit rolls a new one.' }),
})

export type FlockVsHunterConfig = z.infer<typeof flockVsHunterSchema>
```

```ts
// presets.ts — declared data (framework renders one dropdown per group).
import type { PresetGroup } from '../../framework/types'
import type { FlockVsHunterConfig } from './schema'

export const flockVsHunterPresets: PresetGroup<FlockVsHunterConfig>[] = [
  {
    label: 'Dynamics',
    options: [
      { name: 'Calm Murmuration', patch: { boidCount: 240, predatorCount: 4, roundLength: 22, flockMutationRate: 0.12 } },
      { name: 'Predator Pressure', patch: { boidCount: 260, predatorCount: 7, roundLength: 18, predMutationRate: 0.2 } },
      { name: 'Skittish Flock', patch: { boidCount: 200, predatorCount: 2, roundLength: 26, flockMutationRate: 0.16 } },
    ],
  },
  {
    label: 'Palette',
    options: [
      { name: 'Ice & Ember', patch: { flockColors: ['#7fd4ffcc', '#a9e7ffcc', '#d8f3ffcc'], predatorColor: '#ff3b30', background: '#05070d' } },
      { name: 'Ink', patch: { flockColors: ['#c9c9d6aa', '#e8e8f0cc'], predatorColor: '#ffffff', background: '#0a0a0c' } },
      { name: 'Aurora', patch: { flockColors: ['#4dffb0cc', '#7 df0e0cc'.replace(' ', ''), '#b8ffe6cc'], predatorColor: '#ff36c6', background: '#04100c' } },
    ],
  },
]
```

Fix the Aurora middle color to a clean 8-hex before committing: use `'#7df0e0cc'`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/schema.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/schema.ts src/diversions/flock-vs-hunter/presets.ts src/diversions/flock-vs-hunter/schema.test.ts
git commit -m "feat(flock-vs-hunter): schema + presets"
```

---

### Task 8: Render (`render.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/render.ts`
- Test: `src/diversions/flock-vs-hunter/render.test.ts`

Rendering is primarily visual (Chrome verify in Task 10). The unit test only asserts it runs without throwing against a real `Ecosystem` and honors `showHud`. Use a lightweight canvas stub.

- [ ] **Step 1: Write the failing test**

```ts
// render.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSim, stepSim, DEFAULT_SIM_CONFIG } from './sim'
import { drawScene } from './render'
import { flockVsHunterSchema } from './schema'

function stubCtx() {
  const calls: string[] = []
  const rec = (name: string) => (...args: any[]) => { calls.push(name) }
  return {
    calls,
    ctx: new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'canvas') return { width: 800, height: 450 }
        if (['fillStyle', 'strokeStyle', 'globalAlpha', 'font', 'lineWidth', 'textAlign'].includes(prop)) return ''
        return rec(prop)
      },
      set: () => true,
    }) as unknown as CanvasRenderingContext2D,
  }
}

describe('render', () => {
  it('draws without throwing and paints boids', () => {
    const s = createSim({ ...DEFAULT_SIM_CONFIG, boidCount: 50, predatorCount: 2 })
    for (let i = 0; i < 30; i++) stepSim(s)
    const { ctx, calls } = stubCtx()
    const cfg = flockVsHunterSchema.parse({})
    expect(() => drawScene(ctx, s, cfg, { width: 800, height: 450 })).not.toThrow()
    expect(calls.filter(c => c === 'fill' || c === 'fillRect').length).toBeGreaterThan(0)
  })

  it('skips the HUD when showHud is false', () => {
    const s = createSim({ ...DEFAULT_SIM_CONFIG, boidCount: 50, predatorCount: 2 })
    const { ctx, calls } = stubCtx()
    const cfg = flockVsHunterSchema.parse({ showHud: false })
    drawScene(ctx, s, cfg, { width: 800, height: 450 })
    expect(calls.includes('fillText')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/render.test.ts`
Expected: FAIL — cannot find module `./render`.

- [ ] **Step 3: Write minimal implementation**

```ts
// render.ts — alpha-fade trails + boid/predator sprites + HUD. World→screen via a
// cover-fit transform (drawn in CSS pixels; the host DPR-scales the 2D context).
import type { Size } from '../../framework/types'
import { WORLD_W, WORLD_H, type Ecosystem } from './sim'
import { FLOCK_SPEC, PRED_SPEC, gene } from './genome'
import type { FlockVsHunterConfig } from './schema'

function coverFit(size: Size): { scale: number; ox: number; oy: number } {
  const scale = Math.max(size.width / WORLD_W, size.height / WORLD_H) // cover
  const ox = (size.width - WORLD_W * scale) / 2
  const oy = (size.height - WORLD_H * scale) / 2
  return { scale, ox, oy }
}

export function drawScene(ctx: CanvasRenderingContext2D, s: Ecosystem, cfg: FlockVsHunterConfig, size: Size): void {
  // trail fade: translucent bg rect (higher trailFade = slower fade = longer trails)
  const fadeAlpha = 1 - cfg.trailFade
  ctx.globalAlpha = cfg.trailFade > 0 ? fadeAlpha : 1
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.globalAlpha = 1

  const { scale, ox, oy } = coverFit(size)
  const sx = (wx: number) => ox + wx * scale
  const sy = (wy: number) => oy + wy * scale

  // boids: triangles oriented to velocity, tinted by speed across flockColors
  const colors = cfg.flockColors
  for (let i = 0; i < s.n; i++) {
    if (!s.alive[i]) continue
    const sp = Math.hypot(s.vx[i], s.vy[i])
    const maxSp = gene(s.flockGenomes[i], FLOCK_SPEC, 'maxSpeed')
    const ci = Math.min(colors.length - 1, Math.floor((sp / maxSp) * colors.length))
    ctx.fillStyle = colors[ci] ?? colors[0]
    const ang = Math.atan2(s.vy[i], s.vx[i])
    const x = sx(s.px[i]), y = sy(s.py[i]), r = 4
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang) * r * 1.6, y + Math.sin(ang) * r * 1.6)
    ctx.lineTo(x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r)
    ctx.lineTo(x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r)
    ctx.closePath()
    ctx.fill()
  }

  // predators: bold larger triangles
  ctx.fillStyle = cfg.predatorColor
  for (let k = 0; k < s.pn; k++) {
    const ang = Math.atan2(s.pvy[k], s.pvx[k])
    const x = sx(s.ppx[k]), y = sy(s.ppy[k]), r = 8
    ctx.beginPath()
    ctx.moveTo(x + Math.cos(ang) * r * 1.8, y + Math.sin(ang) * r * 1.8)
    ctx.lineTo(x + Math.cos(ang + 2.5) * r, y + Math.sin(ang + 2.5) * r)
    ctx.lineTo(x + Math.cos(ang - 2.5) * r, y + Math.sin(ang - 2.5) * r)
    ctx.closePath()
    ctx.fill()
  }

  if (cfg.showHud) drawHud(ctx, s, cfg)
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, label: string): void {
  ctx.fillStyle = '#ffffff22'
  ctx.fillRect(x, y, w, 6)
  ctx.fillStyle = '#ffffffcc'
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), 6)
  ctx.fillStyle = '#ffffffaa'
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(label, x + w + 6, y + 6)
}

function drawHud(ctx: CanvasRenderingContext2D, s: Ecosystem, _cfg: FlockVsHunterConfig): void {
  let aliveCount = 0
  for (let i = 0; i < s.n; i++) aliveCount += s.alive[i]
  const survivors = Math.round((aliveCount / s.n) * 100)
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`gen ${s.generation}`, 14, 24)
  ctx.font = '12px system-ui, sans-serif'
  ctx.fillText(`survivors ${survivors}%`, 14, 42)
  // flock elite gene bars
  const elite = s.flockGenomes[0]
  let y = 60
  for (const spec of FLOCK_SPEC) {
    const v = gene(elite, FLOCK_SPEC, spec.key)
    bar(ctx, 14, y, 60, (v - spec.min) / (spec.max - spec.min), spec.key)
    y += 12
  }
  // hunter elite gene bars
  const pElite = s.predGenomes[0]
  y += 6
  for (const spec of PRED_SPEC) {
    const v = gene(pElite, PRED_SPEC, spec.key)
    bar(ctx, 14, y, 60, (v - spec.min) / (spec.max - spec.min), spec.key)
    y += 12
  }
  ctx.restore()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/render.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/flock-vs-hunter/render.ts src/diversions/flock-vs-hunter/render.test.ts
git commit -m "feat(flock-vs-hunter): canvas render + HUD"
```

---

### Task 9: Diversion wiring (`index.ts`)

**Files:**
- Create: `src/diversions/flock-vs-hunter/index.ts`
- Test: `src/diversions/flock-vs-hunter/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// index.test.ts
import { describe, it, expect } from 'vitest'
import flockVsHunter from './index'
import { flockVsHunterSchema } from './schema'

function ctxStub() {
  return new Proxy({}, {
    get: (_t, p: string) => (p === 'canvas' ? { width: 800, height: 450 } : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
}

describe('flock-vs-hunter diversion', () => {
  it('has the required contract fields and kind 2d', () => {
    expect(flockVsHunter.id).toBe('flock-vs-hunter')
    expect(flockVsHunter.kind).toBe('2d')
    expect(flockVsHunter.schema).toBe(flockVsHunterSchema)
    expect(flockVsHunter.title.length).toBeGreaterThan(0)
    expect(flockVsHunter.description.length).toBeGreaterThan(0)
  })

  it('setup + a few frames run without throwing', () => {
    const cfg = flockVsHunterSchema.parse({ boidCount: 80, predatorCount: 2 })
    const size = { width: 800, height: 450 }
    const state = flockVsHunter.setup(ctxStub(), cfg, size)
    expect(() => { for (let i = 0; i < 5; i++) flockVsHunter.frame(state, ctxStub(), i / 60, 1 / 60) }).not.toThrow()
  })

  it('update returns false for structural changes (boidCount, seed)', () => {
    const cfg = flockVsHunterSchema.parse({})
    const state = flockVsHunter.setup(ctxStub(), cfg, { width: 800, height: 450 })
    expect(flockVsHunter.update?.(state, { ...cfg, boidCount: 300 }, { width: 800, height: 450 })).toBeFalsy()
    expect(flockVsHunter.update?.(state, { ...cfg, trailFade: 0.3 }, { width: 800, height: 450 })).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/flock-vs-hunter/index.test.ts`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Write minimal implementation**

```ts
// index.ts — framework wiring. Owns setup/frame/update/resize/teardown; delegates
// the sim to sim.ts and drawing to render.ts. Fixed-steps-per-frame (dt ignored).
import { defineDiversion, type Size } from '../../framework/types'
import { flockVsHunterSchema, type FlockVsHunterConfig } from './schema'
import { flockVsHunterPresets } from './presets'
import { createSim, stepSim, type Ecosystem, type SimConfig } from './sim'
import { drawScene } from './render'

interface State {
  sim: Ecosystem
  cfg: FlockVsHunterConfig
  size: Size
}

const toSimConfig = (c: FlockVsHunterConfig): SimConfig => ({
  boidCount: c.boidCount, predatorCount: c.predatorCount, seed: c.seed,
  roundLength: c.roundLength, flockMutationRate: c.flockMutationRate,
  predMutationRate: c.predMutationRate, flockElites: c.flockElites,
  predElites: c.predElites, immigrateEvery: c.immigrateEvery, seasons: c.seasons,
})

const flockVsHunter = defineDiversion({
  id: 'flock-vs-hunter',
  title: 'Flock vs Hunter',
  description: 'A shimmering flock and its predators co-evolve — the selfish herd tightens, the hunters learn to lead. An endless Red-Queen arms race.',
  kind: '2d',
  schema: flockVsHunterSchema,
  presets: flockVsHunterPresets,

  setup(_ctx, cfg, size): State {
    return { sim: createSim(toSimConfig(cfg)), cfg, size }
  },

  frame(state, ctx, _t, _dt) {
    const steps = Math.max(1, state.cfg.speed)
    for (let i = 0; i < steps; i++) stepSim(state.sim)
    drawScene(ctx as CanvasRenderingContext2D, state.sim, state.cfg, state.size)
  },

  resize(state, size) {
    state.size = size // world is fixed; render recomputes the cover-fit from size
  },

  update(state, cfg, size): boolean {
    // structural → false (re-setup rebuilds arrays/streams)
    if (cfg.boidCount !== state.sim.cfg.boidCount ||
        cfg.predatorCount !== state.sim.cfg.predatorCount ||
        cfg.seed !== state.sim.cfg.seed) return false
    // live: swap cfg (visual + evolutionary knobs apply at the next breed)
    state.cfg = cfg
    state.size = size
    Object.assign(state.sim.cfg, toSimConfig(cfg))
    return true
  },

  teardown(state) {
    // release the large SoA arrays for GC (nothing GPU in 2D)
    ;(state as unknown as { sim: null }).sim = null
  },
})

export default flockVsHunter
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/diversions/flock-vs-hunter/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `npx vitest run src/diversions/flock-vs-hunter && npx tsc --noEmit`
Expected: all flock-vs-hunter tests PASS; tsc clean. Also run the framework registry/smoke tests to confirm auto-discovery picked it up:
Run: `npx vitest run src/framework/registry.test.ts src/framework/diversionSmoke.test.ts`
Expected: PASS (the new diversion is auto-registered via the glob).

- [ ] **Step 6: Commit**

```bash
git add src/diversions/flock-vs-hunter/index.ts src/diversions/flock-vs-hunter/index.test.ts
git commit -m "feat(flock-vs-hunter): diversion wiring (#159)"
```

---

### Task 10: Chrome verify, docs, review, ship

**Files:**
- Modify: `README.md` (diversion list/count if it enumerates them)

- [ ] **Step 1: Start the dev server (background)**

Run: `npm run dev` (background). Confirm the listening port (pinned to **5180** per CLAUDE.md; Vite may bump if taken).

- [ ] **Step 2: Hand the user a clickable verify URL**

Surface the full URL on its own line, muted, targeting the new diversion's play route, e.g.:
`http://localhost:5180/diversion/d/flock-vs-hunter/play?mute=1`
(Confirm the exact route shape against how other diversions route — the config screen is the `/config` sibling.) Name the key things to look at: dense flocking reads as a body; predators visibly chase and lead; survivors % and gen counter tick; over a few minutes the gene bars drift (selfish-herd tightening, hunters' lead rising); no hard "blink" at generation turnover.

- [ ] **Step 3: Chrome MCP verification (not the built-in preview)**

Use the chrome-devtools MCP to load the URL, watch the console for errors, and screenshot at 0s / ~30s / ~2min. Verify visually: calm/beautiful motion (zen ethos), legible arms race, 60fps (no jank). Confirm determinism: reload the same full URL (with an explicit `seed`) and confirm the opening replays identically.

- [ ] **Step 4: Tuning checkpoint (ask before changing numeric balance)**

If the flock looks like a gas (not a body), or predators never catch, or the arms race is invisible: STOP and present a tuning proposal (gene ranges / counts) as A/B options — gameplay tuning is sacrosanct, do not unilaterally change literals. Mechanism bugs (a null ref, a missing wrap, a broken catch) are fixed directly.

- [ ] **Step 5: Update docs**

If `README.md` lists diversions or a count, add Flock vs Hunter. Keep the spec/plan as the record of "why."

- [ ] **Step 6: Code review (required phase)**

Dispatch the `diversion-reviewer` agent (project-aware: 5 UX invariants, schema-as-source-of-truth, URL-codec keystone) AND the `perf-analyzer` agent (per-frame allocations, frame budget — this change touches `frame()`/`stepSim`). Address findings. Re-run the full suite + tsc.

- [ ] **Step 7: Hand off for user verification, then FF-merge**

Run the full test suite (`npx vitest run`) + `npx tsc --noEmit` + `npm run build`. Present for user-verify-before-FF-merge. On approval: squash the branch to one commit, FF-merge to `main`, delete the branch both ends (per standing session rules), and close/annotate issue #159.

---

## Self-review notes (author)

- **Spec coverage:** §1 arch → Tasks 5–6/9; §2 determinism → Tasks 1–2/5–6 (fixed DT, sub-streams, hash order, gen-elite test); §3 framework/perf → Tasks 3/8/9 (hash, world→screen, update split); §4 tick/fitness → Tasks 4–6; §5 genome/GA/anti-stagnation → Tasks 1–2/6; §6 schema → Task 7; §7 render/HUD → Task 8; §9 tests → every task; §10 risks (tuning gate) → Task 10 step 4. All covered.
- **No placeholders:** every code step is complete and runnable (the one Aurora hex typo is flagged with its fix inline).
- **Type consistency:** `SimConfig`/`Ecosystem`/`Genome`/`Scored`/`GeneSpec` names are used identically across tasks; `gene()`, `stepSim`, `createSim`, `hashState`, `drawScene`, `flockAccel`, `predatorAim`, `SpatialHash.neighborsWithin` signatures match their definitions and call sites.
- **Deferred (backlog, noted in spec §10):** exposure-weighted flock fitness + predator proximity integral (optional robustness), dynamic round-end trigger. v1 ships the simple, always-dense versions.
```
