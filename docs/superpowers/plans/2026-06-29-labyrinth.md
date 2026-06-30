# Labyrinth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `webgl` diversion `labyrinth` — a slime-mold colony that grows from a maze's start corner, explores the corridors, reaches the far corner, then lights up the shortest path before regenerating a fresh maze. Endless.

**Architecture:** Pure CPU maze generation (recursive backtracker) + BFS solve, rasterized to wall/path mask textures. The GPU sim is adapted from `src/diversions/physarum/gl.ts` (RGBA32F agents, R16F ping-pong trail) with four changes: a wall mask, wall-rejection movement (no torus wrap), wall-aware trail diffusion, and a composite display that draws walls + trail + a solve-triggered path glow. Solve is detected by a throttled `readPixels` at the end cell; on hold-expiry the diversion regenerates the maze in `frame` with no React involvement.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + WebGL2. Vitest co-located tests. Mechanism **A** (pure exploration) + **P1** (highlight on solve) per the spec.

**Reference reading before starting:** `src/diversions/physarum/{gl.ts,agents.ts,schema.ts,index.ts}` (the host being adapted) and `src/framework/types.ts` (the diversion contract). Spec: `docs/superpowers/specs/2026-06-29-labyrinth-design.md`.

---

## File Structure

```
src/diversions/labyrinth/
  maze.ts        Pure logic: Maze type, generateMaze (recursive backtracker), solvePath (BFS),
                 rasterizeWalls / rasterizePath. No GL, no React. The fully-testable core.
  maze.test.ts   Determinism, full connectivity, BFS path correctness, rasterization sanity.
  agents.ts      initAgents (spawn at start cell), buildLUT (gradient → 256×RGBA LUT). Pure.
  agents.test.ts Agents land inside the start cell; deterministic; LUT endpoints.
  schema.ts      Zod schema — single source of truth (maze/behavior/sim/solve/color fields).
  schema.test.ts Defaults present; ui:'slider' fields carry min/max.
  presets.ts     Density + Color PresetGroup[].
  presets.test.ts Patch key-sets consistent per group.
  gl.ts          Adapted host: wall mask, wall-rejection MOVE, wall-aware DIFFUSE, composite
                 DISPLAY, solve readback, regenerate. trailDims cap.
  gl.test.ts     trailDims cap; mazeGridFor cell-texel budget.
  index.ts       defineDiversion wiring (setup/frame/update/teardown/presets).
  index.test.ts  control-selection-from-schema; URL codec round-trip + resilience for the schema.
```

The folder is auto-discovered by `import.meta.glob('../diversions/*/index.ts')` — no registration step.

---

## Task 1: Maze generation (recursive backtracker)

**Files:**
- Create: `src/diversions/labyrinth/maze.ts`
- Test: `src/diversions/labyrinth/maze.test.ts`

The maze is a `cols × rows` grid. Each cell has 4 wall bits (N/E/S/W). Recursive backtracker carves a perfect maze: every cell reachable, exactly one path between any two cells. Deterministic via `mulberry32` (already in `src/framework/rng.ts`).

- [ ] **Step 1: Write failing tests**

```ts
// src/diversions/labyrinth/maze.test.ts
import { describe, it, expect } from 'vitest'
import { generateMaze } from './maze'

describe('generateMaze', () => {
  it('is deterministic for a given seed', () => {
    const a = generateMaze(42, 10, 8)
    const b = generateMaze(42, 10, 8)
    expect(a.cols).toBe(10); expect(a.rows).toBe(8)
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells))
  })

  it('differs across seeds', () => {
    const a = generateMaze(1, 12, 12)
    const b = generateMaze(2, 12, 12)
    expect(Array.from(a.cells)).not.toEqual(Array.from(b.cells))
  })

  it('is fully connected (every cell reachable from 0,0)', () => {
    const m = generateMaze(7, 15, 11)
    // flood fill across open passages; count must equal cols*rows
    const seen = new Uint8Array(m.cols * m.rows)
    const stack = [0]; seen[0] = 1; let count = 0
    const N = 1, E = 2, S = 4, W = 8
    while (stack.length) {
      const i = stack.pop()!; count++
      const x = i % m.cols, y = (i / m.cols) | 0, w = m.cells[i]
      if (!(w & N) && y > 0 && !seen[i - m.cols]) { seen[i - m.cols] = 1; stack.push(i - m.cols) }
      if (!(w & S) && y < m.rows - 1 && !seen[i + m.cols]) { seen[i + m.cols] = 1; stack.push(i + m.cols) }
      if (!(w & W) && x > 0 && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1) }
      if (!(w & E) && x < m.cols - 1 && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1) }
    }
    expect(count).toBe(m.cols * m.rows)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/maze.test.ts`
Expected: FAIL — `generateMaze` not exported.

- [ ] **Step 3: Implement generation**

```ts
// src/diversions/labyrinth/maze.ts
import { mulberry32 } from '../../framework/rng'

// Wall bits per cell. A set bit means a wall on that side is PRESENT.
export const N = 1, E = 2, S = 4, W = 8

export type Maze = {
  cols: number
  rows: number
  cells: Uint8Array // length cols*rows, each a bitmask of present walls (N|E|S|W)
}

const OPP = { [N]: S, [E]: W, [S]: N, [W]: E } as Record<number, number>
const DX = { [N]: 0, [E]: 1, [S]: 0, [W]: -1 } as Record<number, number>
const DY = { [N]: -1, [E]: 0, [S]: 1, [W]: 0 } as Record<number, number>

/** Recursive-backtracker perfect maze. Starts every cell fully walled, then
 *  carves a spanning tree by depth-first walking to a random unvisited neighbour
 *  and knocking down the shared wall. Deterministic in `seed`. */
export function generateMaze(seed: number, cols: number, rows: number): Maze {
  const rng = mulberry32(seed)
  const cells = new Uint8Array(cols * rows).fill(N | E | S | W)
  const visited = new Uint8Array(cols * rows)
  const stack: number[] = [0]
  visited[0] = 1
  while (stack.length) {
    const i = stack[stack.length - 1]
    const x = i % cols, y = (i / cols) | 0
    // collect unvisited neighbours
    const opts: number[] = []
    for (const dir of [N, E, S, W]) {
      const nx = x + DX[dir], ny = y + DY[dir]
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      if (!visited[ny * cols + nx]) opts.push(dir)
    }
    if (opts.length === 0) { stack.pop(); continue }
    const dir = opts[(rng() * opts.length) | 0]
    const ni = (y + DY[dir]) * cols + (x + DX[dir])
    cells[i] &= ~dir            // knock down our wall
    cells[ni] &= ~OPP[dir]      // and the neighbour's matching wall
    visited[ni] = 1
    stack.push(ni)
  }
  return { cols, rows, cells }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/maze.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/maze.ts src/diversions/labyrinth/maze.test.ts
git commit -m "feat(labyrinth): recursive-backtracker maze generation"
```

---

## Task 2: Solve path (BFS) + rasterization

**Files:**
- Modify: `src/diversions/labyrinth/maze.ts`
- Modify: `src/diversions/labyrinth/maze.test.ts`

BFS from start corner (0,0) to end corner (cols-1, rows-1) yields the unique path in a perfect maze. Then rasterize walls + path to byte masks at a target texel resolution for the GPU. `cellPx` texels per cell; a wall is the thin border between cells (1 texel here, set by `wallPx`).

- [ ] **Step 1: Write failing tests**

```ts
// append to maze.test.ts
import { solvePath, rasterizeWalls, rasterizePath, mazeGridFor } from './maze'

describe('solvePath', () => {
  it('returns a contiguous path from start to end on corridors only', () => {
    const m = generateMaze(7, 12, 9)
    const path = solvePath(m)
    expect(path[0]).toBe(0)
    expect(path[path.length - 1]).toBe(m.cols * m.rows - 1)
    // each consecutive pair is an open, adjacent step
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k]
      const ax = a % m.cols, ay = (a / m.cols) | 0
      const bx = b % m.cols, by = (b / m.cols) | 0
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1) // adjacent
    }
  })
})

describe('rasterize', () => {
  it('walls mask has a fully-walled border and open start/end cell centres', () => {
    const m = generateMaze(3, 8, 8)
    const { cellPx } = mazeGridFor(8, 8, 8) // cols, rows, cellPx
    const w = m.cols * cellPx, h = m.rows * cellPx
    const walls = rasterizeWalls(m, cellPx) // Uint8Array length w*h, 255=wall 0=open
    expect(walls.length).toBe(w * h)
    // border row/col all wall
    for (let x = 0; x < w; x++) expect(walls[x]).toBe(255)         // top row
    // centre of start cell (0,0) is open
    const c = (cellPx / 2) | 0
    expect(walls[c * w + c]).toBe(0)
  })

  it('path mask marks only path cells', () => {
    const m = generateMaze(3, 8, 8)
    const { cellPx } = mazeGridFor(8, 8, 8)
    const path = solvePath(m)
    const pm = rasterizePath(m, path, cellPx)
    const c = (cellPx / 2) | 0, w = m.cols * cellPx
    // start cell centre is on the path
    expect(pm[c * w + c]).toBe(255)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/maze.test.ts`
Expected: FAIL — `solvePath`/`rasterizeWalls`/`rasterizePath`/`mazeGridFor` not exported.

- [ ] **Step 3: Implement solve + rasterize**

```ts
// append to maze.ts

/** BFS shortest path start (0,0) → end (cols-1,rows-1), as a list of cell indices.
 *  In a perfect maze this is the unique path. */
export function solvePath(m: Maze): number[] {
  const { cols, rows, cells } = m
  const start = 0, end = cols * rows - 1
  const prev = new Int32Array(cols * rows).fill(-1)
  const seen = new Uint8Array(cols * rows)
  const q = [start]; seen[start] = 1
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    if (i === end) break
    const x = i % cols, y = (i / cols) | 0, w = cells[i]
    const tryDir = (open: boolean, ni: number) => {
      if (open && ni >= 0 && ni < cols * rows && !seen[ni]) { seen[ni] = 1; prev[ni] = i; q.push(ni) }
    }
    tryDir(!(w & N) && y > 0, i - cols)
    tryDir(!(w & S) && y < rows - 1, i + cols)
    tryDir(!(w & W) && x > 0, i - 1)
    tryDir(!(w & E) && x < cols - 1, i + 1)
  }
  const path: number[] = []
  for (let i = end; i !== -1; i = prev[i]) path.push(i)
  return path.reverse()
}

export type Grid = { cols: number; rows: number; cellPx: number }

/** Choose grid dims + texels-per-cell to fill a `texW×texH` field with `shortCells`
 *  cells on the short axis, keeping cells square and ≥ MIN_CELL_PX texels (so 3-tap
 *  sensing has room). Returns the chosen cols/rows/cellPx. */
const MIN_CELL_PX = 8
export function mazeGridFor(shortCells: number, texW: number, texH: number): Grid {
  const short = Math.min(texW, texH)
  let cellPx = Math.max(MIN_CELL_PX, Math.floor(short / shortCells))
  const cols = Math.max(2, Math.floor(texW / cellPx))
  const rows = Math.max(2, Math.floor(texH / cellPx))
  return { cols, rows, cellPx }
}

/** Rasterize present walls to a w×h byte mask (255=wall, 0=open). Each cell is a
 *  cellPx×cellPx block; a present wall paints the 1-texel border on that side.
 *  The grid's outer border is always wall (cells start fully walled at the edge). */
export function rasterizeWalls(m: Maze, cellPx: number): Uint8Array {
  const w = m.cols * cellPx, h = m.rows * cellPx
  const out = new Uint8Array(w * h) // 0 = open
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 255 }
  for (let cy = 0; cy < m.rows; cy++) {
    for (let cx = 0; cx < m.cols; cx++) {
      const wbits = m.cells[cy * m.cols + cx]
      const x0 = cx * cellPx, y0 = cy * cellPx
      if (wbits & N) for (let i = 0; i < cellPx; i++) set(x0 + i, y0)
      if (wbits & S) for (let i = 0; i < cellPx; i++) set(x0 + i, y0 + cellPx - 1)
      if (wbits & W) for (let i = 0; i < cellPx; i++) set(x0, y0 + i)
      if (wbits & E) for (let i = 0; i < cellPx; i++) set(x0 + cellPx - 1, y0 + i)
    }
  }
  return out
}

/** Rasterize the path cells to a w×h byte mask (255 on path-cell interiors, 0 else). */
export function rasterizePath(m: Maze, path: number[], cellPx: number): Uint8Array {
  const w = m.cols * cellPx, h = m.rows * cellPx
  const out = new Uint8Array(w * h)
  for (const i of path) {
    const cx = i % m.cols, cy = (i / m.cols) | 0
    const x0 = cx * cellPx, y0 = cy * cellPx
    for (let y = 1; y < cellPx - 1; y++)
      for (let x = 1; x < cellPx - 1; x++)
        out[(y0 + y) * w + (x0 + x)] = 255
  }
  return out
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/maze.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/maze.ts src/diversions/labyrinth/maze.test.ts
git commit -m "feat(labyrinth): BFS solve path + wall/path rasterization"
```

---

## Task 3: Agents (spawn at start) + LUT

**Files:**
- Create: `src/diversions/labyrinth/agents.ts`
- Test: `src/diversions/labyrinth/agents.test.ts`

Mirror `physarum/agents.ts` but spawn every agent **inside the start cell** (cell 0,0 in UV space), heading random. `buildLUT` is identical to Physarum's (gradient → 256×RGBA byte LUT).

- [ ] **Step 1: Write failing tests**

```ts
// src/diversions/labyrinth/agents.test.ts
import { describe, it, expect } from 'vitest'
import { texDimFor, initAgentsAtStart, buildLUT } from './agents'

describe('initAgentsAtStart', () => {
  it('places all agents inside the start cell UV box', () => {
    const cellFracX = 1 / 10, cellFracY = 1 / 8 // a 10×8 maze
    const data = initAgentsAtStart(7, 5000, cellFracX, cellFracY)
    const dim = texDimFor(5000)
    for (let i = 0; i < 5000; i++) {
      const x = data[i * 4 + 0], y = data[i * 4 + 1]
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(cellFracX)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(cellFracY)
    }
    expect(data.length).toBe(dim * dim * 4)
  })
  it('is deterministic', () => {
    const a = initAgentsAtStart(1, 1000, 0.1, 0.1)
    const b = initAgentsAtStart(1, 1000, 0.1, 0.1)
    expect(Array.from(a)).toEqual(Array.from(b))
  })
})

describe('buildLUT', () => {
  it('maps the first stop to index 0 and last stop to index 255', () => {
    const lut = buildLUT(['#000000', '#ffffff'])
    expect(lut[0]).toBe(0)               // R at t=0
    expect(lut[255 * 4 + 0]).toBe(255)   // R at t=1
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/agents.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/diversions/labyrinth/agents.ts
import { mulberry32 } from '../../framework/rng'
import { sampleGradientRGBA } from '../../framework/gradient'

/** Smallest pow2 dim with dim² ≥ count (min 16). Identical to physarum. */
export function texDimFor(count: number): number {
  let d = 16
  while (d * d < count) d *= 2
  return d
}

/** Seeded agent init with every agent inside the start cell (UV box
 *  [0,cellFracX]×[0,cellFracY]). Per texel: (x, y, heading, respawnPhase). */
export function initAgentsAtStart(
  seed: number, count: number, cellFracX: number, cellFracY: number,
): Float32Array {
  const dim = texDimFor(count)
  const rng = mulberry32(seed)
  const out = new Float32Array(dim * dim * 4)
  for (let i = 0; i < dim * dim; i++) {
    out[i * 4 + 0] = rng() * cellFracX
    out[i * 4 + 1] = rng() * cellFracY
    out[i * 4 + 2] = rng() * Math.PI * 2
    out[i * 4 + 3] = rng() // staggered respawn phase
  }
  return out
}

/** Bake the gradient into a 256×RGBA byte LUT. Identical to physarum. */
export function buildLUT(stops: string[]): Uint8Array {
  const s8 = stops.map((s) => (s.length === 7 ? s + 'ff' : s))
  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const c = sampleGradientRGBA(s8, i / 255)
    lut[i * 4 + 0] = Math.round(c.r)
    lut[i * 4 + 1] = Math.round(c.g)
    lut[i * 4 + 2] = Math.round(c.b)
    lut[i * 4 + 3] = 255
  }
  return lut
}
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/agents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/agents.ts src/diversions/labyrinth/agents.test.ts
git commit -m "feat(labyrinth): start-cell agent seeding + gradient LUT"
```

---

## Task 4: Schema (single source of truth)

**Files:**
- Create: `src/diversions/labyrinth/schema.ts`
- Test: `src/diversions/labyrinth/schema.test.ts`

Fields per spec. Colors: `stops` (colorList, 6-hex opaque palette — no alpha, per the colorlist-hex-alpha gotcha), `wallColor` + `pathColor` as single `color` fields.

- [ ] **Step 1: Write failing test**

```ts
// src/diversions/labyrinth/schema.test.ts
import { describe, it, expect } from 'vitest'
import { labyrinthSchema } from './schema'

describe('labyrinthSchema', () => {
  it('parses defaults', () => {
    const cfg = labyrinthSchema.parse({})
    expect(cfg.mazeSize).toBeGreaterThan(0)
    expect(cfg.agents).toBeGreaterThan(0)
    expect(cfg.stops.length).toBeGreaterThanOrEqual(2)
    expect(cfg.wallColor).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(cfg.pathColor).toMatch(/^#[0-9a-fA-F]{6}$/)
  })
  it('every slider field carries min & max in meta', () => {
    const shape = labyrinthSchema.shape as Record<string, { meta(): any }>
    for (const [, field] of Object.entries(shape)) {
      const m = field.meta?.()
      if (m?.ui === 'slider') { expect(m.min).toBeDefined(); expect(m.max).toBeDefined() }
    }
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema**

```ts
// src/diversions/labyrinth/schema.ts
import { z } from 'zod'

// Trail-density ramp. Default Bioluminescence (deep-blue → cyan → white).
const BIOLUM = ['#020814', '#0a3b66', '#1bd6ff', '#eaffff']

export const labyrinthSchema = z.object({
  // ── Maze ──
  mazeSize: z.number().int().min(6).max(40).default(16)
    .meta({ section: 'Maze', ui: 'slider', min: 6, max: 40, step: 1, label: 'Maze size',
            help: 'Cells across the short edge. Higher = finer, more intricate labyrinth and a '
                + 'longer solve. Changing this generates a new maze.' }),
  seed: z.number().int().default(1)
    .meta({ section: 'Maze', ui: 'number', step: 1, label: 'Seed',
            help: 'Any integer. The same seed always grows the same sequence of mazes.' }),
  // ── Behavior ──
  sensorAngle: z.number().min(5).max(60).default(22.5)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 60, step: 0.5, label: 'Sensor angle',
            help: 'Angle of the left/right sensors off an agent’s heading. Wider = bushier '
                + 'exploration; narrower = straighter probing.' }),
  sensorDist: z.number().min(1).max(20).default(7)
    .meta({ section: 'Behavior', ui: 'slider', min: 1, max: 20, step: 0.5, label: 'Sensor distance',
            help: 'How far ahead (trail texels) agents taste the pheromone.' }),
  turnSpeed: z.number().min(5).max(90).default(40)
    .meta({ section: 'Behavior', ui: 'slider', min: 5, max: 90, step: 1, label: 'Turn speed',
            help: 'How sharply agents steer toward the strongest trail (degrees/step). Higher = '
                + 'twitchier; helps agents round tight corners.' }),
  deposit: z.number().min(0.1).max(5).default(1)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.1, max: 5, step: 0.1, label: 'Deposit',
            help: 'Trail laid by each agent per step. Higher = bolder, brighter corridors.' }),
  decay: z.number().min(0.005).max(0.3).default(0.04)
    .meta({ section: 'Behavior', ui: 'slider', min: 0.005, max: 0.3, step: 0.005, label: 'Decay',
            help: 'Fraction of the trail lost each step. Lower = persistent, slowly-built '
                + 'corridors; higher = restless, fading exploration.' }),
  diffuse: z.number().min(0).max(1).default(0.6)
    .meta({ section: 'Behavior', ui: 'slider', min: 0, max: 1, step: 0.05, label: 'Diffuse',
            help: 'How much the trail spreads into neighbours each step (within walls). '
                + '0 = sharp, wiry; 1 = soft, smoky.' }),
  // ── Simulation ──
  agents: z.number().int().min(20000).max(800000).default(200000)
    .meta({ section: 'Simulation', ui: 'slider', min: 20000, max: 800000, step: 20000,
            label: 'Agents',
            help: 'Number of slime agents exploring. More = faster, denser flooding. '
                + 'Changing this restarts the run.' }),
  speed: z.number().min(0.1).max(3).default(1)
    .meta({ section: 'Simulation', ui: 'slider', min: 0.1, max: 3, step: 0.05, label: 'Speed',
            help: 'Simulation steps per frame. Below 1 runs a step every few frames for a calm '
                + 'drift; above 1 explores faster.' }),
  // ── Solve ──
  holdAfterSolve: z.number().min(1).max(15).default(4)
    .meta({ section: 'Solve', ui: 'slider', min: 1, max: 15, step: 0.5, label: 'Hold after solve',
            help: 'Seconds the lit shortest path lingers before a fresh maze generates.' }),
  // ── Color ──
  stops: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(8).default(BIOLUM)
    .meta({ section: 'Color', ui: 'colorList', min: 2, max: 8, label: 'Trail colors',
            help: 'Trail density maps along these colors — lowest is the corridor background, '
                + 'highest is where the slime is thickest.' }),
  wallColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#1b2433')
    .meta({ section: 'Color', ui: 'color', label: 'Wall color',
            help: 'The maze walls. Keep it high-contrast against the trail.' }),
  pathColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#ffd34d')
    .meta({ section: 'Color', ui: 'color', label: 'Solved-path glow',
            help: 'The shortest path lights up in this color when the maze is solved.' }),
})

export type LabyrinthConfig = z.infer<typeof labyrinthSchema>
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/schema.ts src/diversions/labyrinth/schema.test.ts
git commit -m "feat(labyrinth): config schema (single source of truth)"
```

---

## Task 5: Presets (Density + Color axes)

**Files:**
- Create: `src/diversions/labyrinth/presets.ts`
- Test: `src/diversions/labyrinth/presets.test.ts`

Mirror `physarum/presets.ts`. Two independent groups. Color patches `stops` + `wallColor` + `pathColor` together (top-level fields — patched whole). Density patches `mazeSize` + `agents`.

- [ ] **Step 1: Write failing test**

```ts
// src/diversions/labyrinth/presets.test.ts
import { describe, it, expect } from 'vitest'
import { densityPresets, colorPresets } from './presets'
import { labyrinthSchema } from './schema'

describe('presets', () => {
  it('every patch yields a schema-valid partial when merged onto defaults', () => {
    const base = labyrinthSchema.parse({})
    for (const p of [...densityPresets, ...colorPresets])
      expect(() => labyrinthSchema.parse({ ...base, ...p.patch })).not.toThrow()
  })
  it('color presets all patch the same keys', () => {
    const keys = colorPresets.map((p) => Object.keys(p.patch).sort().join(','))
    expect(new Set(keys).size).toBe(1)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/presets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/diversions/labyrinth/presets.ts
import type { LabyrinthConfig } from './schema'

type Preset = { name: string; patch: Partial<LabyrinthConfig> }

export const densityPresets: Preset[] = [
  { name: 'Open',    patch: { mazeSize: 9,  agents: 120000 } },
  { name: 'Classic', patch: { mazeSize: 16, agents: 200000 } },
  { name: 'Dense',   patch: { mazeSize: 28, agents: 400000 } },
]

export const colorPresets: Preset[] = [
  { name: 'Bioluminescence',
    patch: { stops: ['#020814', '#0a3b66', '#1bd6ff', '#eaffff'], wallColor: '#1b2433', pathColor: '#ffd34d' } },
  { name: 'Ember',
    patch: { stops: ['#0a0500', '#7a2a00', '#ff7a18', '#ffe9c2'], wallColor: '#241a12', pathColor: '#36e0ff' } },
  { name: 'Spore',
    patch: { stops: ['#0c0316', '#5a1a8a', '#d24bff', '#ffd6f4'], wallColor: '#1d1330', pathColor: '#b6ff3a' } },
]
```

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/presets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/presets.ts src/diversions/labyrinth/presets.test.ts
git commit -m "feat(labyrinth): Density + Color preset groups"
```

---

## Task 6: GL host — sim (wall mask, wall-rejection MOVE, wall-aware DIFFUSE)

**Files:**
- Create: `src/diversions/labyrinth/gl.ts`
- Test: `src/diversions/labyrinth/gl.test.ts`

Adapt `physarum/gl.ts`. Read it side-by-side. Keep the scaffolding (`compile`, `link`, `makeTex`, `fboFor`, `TRI_VERT`, `DEPOSIT_VERT`, `DEPOSIT_FRAG`, ping-pong structure, fractional `stepAcc`). Changes below. This task lands the **sim** (move/deposit/diffuse); display + solve come in Task 7.

The wall mask is an R8 texture (`gl.R8`/`gl.RED`/`gl.UNSIGNED_BYTE`, `gl.NEAREST`), uploaded from `rasterizeWalls`. Sample `.r` → 1.0 = wall.

- [ ] **Step 1: trailDims + grid test (the only unit-testable GL bit)**

```ts
// src/diversions/labyrinth/gl.test.ts
import { describe, it, expect } from 'vitest'
import { trailDims } from './gl'
import { mazeGridFor } from './maze'

describe('trailDims', () => {
  it('caps the long edge but leaves small fields intact', () => {
    expect(trailDims(1920, 1080)).toEqual({ tw: 1920, th: 1080 })
    const big = trailDims(6000, 3000)
    expect(Math.max(big.tw, big.th)).toBeLessThanOrEqual(2560)
  })
})
describe('mazeGridFor', () => {
  it('keeps cells at least 8 texels', () => {
    const g = mazeGridFor(40, 1000, 800)
    expect(g.cellPx).toBeGreaterThanOrEqual(8)
  })
})
```

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/gl.test.ts`
Expected: FAIL — `./gl` not found.

- [ ] **Step 3: Implement the sim half of gl.ts**

Copy `physarum/gl.ts` to `labyrinth/gl.ts`, keep the scaffolding, then apply these shader + struct changes:

**MOVE_FRAG** — add `u_walls` sampler + wall-rejection (replaces the torus wrap), and respawn to the start cell:

```glsl
// labyrinth MOVE_FRAG — additions over physarum's
uniform sampler2D u_walls;     // R8 mask, 1.0 = wall, sampled in [0,1] UV
uniform vec2  u_startCell;     // start-cell fractional size (1/cols, 1/rows)
// ... sense()/hash() unchanged ...
bool isWall(vec2 uv) { return texture(u_walls, uv).r > 0.5; }
void main() {
  ivec2 idx = ivec2(gl_FragCoord.xy);
  vec4 a = texelFetch(u_agents, idx, 0);
  vec2 pos = a.xy; float heading = a.z;
  float c = sense(pos, heading);
  float l = sense(pos, heading + u_sensorAngle);
  float r = sense(pos, heading - u_sensorAngle);
  float rnd = hash(gl_FragCoord.xy + vec2(u_frame, u_frame * 1.7));
  if (c > l && c > r) {}
  else if (c < l && c < r) heading += (rnd < 0.5 ? -1.0 : 1.0) * u_turnSpeed;
  else if (l > r) heading += u_turnSpeed;
  else if (r > l) heading -= u_turnSpeed;
  vec2 dir = vec2(cos(heading), sin(heading));
  vec2 npos = pos + dir * (u_step / u_trailSize);
  // Wall-rejection: if the step would enter a wall (or leave [0,1]), DON'T advance;
  // turn by a random amount so the agent tries a new heading next step. This keeps
  // agents inside corridors and unsticks them from corners (no torus wrap here).
  if (npos.x < 0.0 || npos.x > 1.0 || npos.y < 0.0 || npos.y > 1.0 || isWall(npos)) {
    heading += (rnd - 0.5) * 3.1415926;   // random turn up to ±90°
  } else {
    pos = npos;
  }
  // Respawn lifecycle → back to the START cell (keeps growth seeded from start).
  float prog = fract(a.w + u_respawn);
  if (prog < u_respawn) {
    pos = vec2(hash(gl_FragCoord.xy + vec2(u_frame, 31.0)) * u_startCell.x,
               hash(gl_FragCoord.xy + vec2(u_frame, 53.0)) * u_startCell.y);
  }
  heading = mod(heading, 6.2831853);
  fragColor = vec4(pos, heading, prog);
}
```

**DIFFUSE_FRAG** — wall-aware blur (skip wall taps; wall texels stay 0):

```glsl
// labyrinth DIFFUSE_FRAG
uniform sampler2D u_trail;
uniform sampler2D u_walls;
uniform vec2  u_texel;
uniform float u_diffuse;
uniform float u_decay;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  if (texture(u_walls, uv).r > 0.5) { fragColor = vec4(0.0); return; } // walls hold no trail
  float sum = 0.0; float wsum = 0.0;
  for (int dy = -1; dy <= 1; dy++)
    for (int dx = -1; dx <= 1; dx++) {
      vec2 t = uv + vec2(float(dx), float(dy)) * u_texel;
      if (texture(u_walls, t).r > 0.5) continue;   // don't blur across walls
      sum += texture(u_trail, t).r; wsum += 1.0;
    }
  float blurred = wsum > 0.0 ? sum / wsum : 0.0;
  float center = texture(u_trail, uv).r;
  float v = mix(center, blurred, u_diffuse) * (1.0 - u_decay);
  fragColor = vec4(v, 0.0, 0.0, 1.0);
}
```

**Struct / initGL changes:**
- Add `wallTex: WebGLTexture` to `LabyrinthGL`; create it with `makeTex(gl, texW, texH, gl.R8, gl.RED, gl.UNSIGNED_BYTE, gl.NEAREST, wallData)`.
- `initGL(gl, cfg, w, h, wallData, startCell)` — extra args for the wall mask + start-cell fractions.
- Agent seed uses `initAgentsAtStart(cfg.seed, cfg.agents, startCell.x, startCell.y)`.
- `move` uniforms: add `u_walls` (TEXTURE2), `u_startCell`. `diffuse` uniforms: add `u_walls` (TEXTURE1).
- Bind `wallTex` in both passes.
- `step()` body otherwise identical to physarum (move → deposit → diffuse+decay).
- `cfg.decay`/`cfg.diffuse`/`cfg.sensorAngle`/etc. field names match the new schema (`deposit` not `depositAmount`).

Export `trailDims` (copy physarum's, `TRAIL_MAX_SIDE = 2560`).

- [ ] **Step 4: Run, verify pass**

Run: `npx vitest run src/diversions/labyrinth/gl.test.ts`
Expected: PASS (trailDims + grid).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/gl.ts src/diversions/labyrinth/gl.test.ts
git commit -m "feat(labyrinth): GL sim — wall mask, wall-rejection move, wall-aware diffuse"
```

---

## Task 7: GL host — composite display + solve detection + regenerate

**Files:**
- Modify: `src/diversions/labyrinth/gl.ts`

Add the display pass (walls + trail + path glow), the throttled `readPixels` solve check, and the `regenerate` entry point. No new unit tests (visual; covered at Chrome-verify).

- [ ] **Step 1: Composite DISPLAY_FRAG**

```glsl
// labyrinth DISPLAY_FRAG
precision highp float;
uniform sampler2D u_trail;
uniform sampler2D u_walls;
uniform sampler2D u_path;
uniform sampler2D u_lut;
uniform vec2  u_texel;
uniform float u_exposure;
uniform vec3  u_wallColor;
uniform vec3  u_pathColor;
uniform float u_solveMix;   // 0→1 ramp of the path glow once solved
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy * u_texel;
  if (texture(u_walls, uv).r > 0.5) { fragColor = vec4(u_wallColor, 1.0); return; }
  float d = texture(u_trail, uv).r;
  float t = 1.0 - exp(-u_exposure * d);
  vec3 col = texture(u_lut, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  // Path glow: additive, gated by the path mask and the solve ramp.
  float pathHere = texture(u_path, uv).r;
  col += u_pathColor * pathHere * u_solveMix;
  fragColor = vec4(col, 1.0);
}
```

`u_texel` is mapped over the screen viewport (same as physarum) so the field stretches to fill. `u_solveMix` is driven from the diversion (0 while exploring; ramps to ~1.2 over ~0.5 s after solve so the path reads bright).

- [ ] **Step 2: Solve detection (throttled readPixels)**

```ts
// in gl.ts — add to LabyrinthGL: endUV {x,y}, solveCheckFrame counter.
// A 1×1 readPixels at the end cell every ~30 sim frames. R16F → read as RGBA/FLOAT
// into a Float32Array; channel 0 is the density.
const SOLVE_EVERY = 30
const SOLVE_THRESHOLD = 0.8  // trail density at end cell to count as reached (🎚️ tune at verify)
export function endReached(gl: WebGL2RenderingContext, res: LabyrinthGL): boolean {
  res.solveCheckFrame++
  if (res.solveCheckFrame % SOLVE_EVERY !== 0) return false
  const px = Math.min(res.trailW - 1, Math.max(0, Math.round(res.endUV.x * res.trailW)))
  const py = Math.min(res.trailH - 1, Math.max(0, Math.round(res.endUV.y * res.trailH)))
  gl.bindFramebuffer(gl.FRAMEBUFFER, res.trailFbo[res.cur.trail])
  const out = new Float32Array(4)
  gl.readPixels(px, py, 1, 1, gl.RGBA, gl.FLOAT, out)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return out[0] >= SOLVE_THRESHOLD
}
```

(Reading `gl.RGBA`/`gl.FLOAT` from an R16F attachment is the broadly-supported readback combo; only channel 0 is meaningful.)

- [ ] **Step 3: regenerate() — new maze, clear trail, reseed agents**

```ts
// in gl.ts. Caller passes freshly-rasterized wallData + new startCell/endUV +
// the new agent seed data. Re-uploads the wall texture, clears both trail FBOs,
// overwrites the agent texture, resets frame/stepAcc/solveCheckFrame.
export function regenerate(
  gl: WebGL2RenderingContext, res: LabyrinthGL,
  wallData: Uint8Array, agentData: Float32Array,
  startCell: { x: number; y: number }, endUV: { x: number; y: number },
): void {
  gl.bindTexture(gl.TEXTURE_2D, res.wallTex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, res.trailW, res.trailH, 0, gl.RED, gl.UNSIGNED_BYTE, wallData)
  gl.bindTexture(gl.TEXTURE_2D, res.agentTex[0])
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, res.agentDim, res.agentDim, 0, gl.RGBA, gl.FLOAT, agentData)
  for (const fb of res.trailFbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT) }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  res.cur = { agent: 0, trail: 0 }; res.frame = 0; res.stepAcc = 0; res.solveCheckFrame = 0
  res.startCell = startCell; res.endUV = endUV
  // path texture re-upload happens here too (res.pathTex ← rasterizePath result)
}
```

(The path texture is uploaded alongside walls — add `pathTex` to the struct + `regenerate` signature; omitted above for brevity but include it.)

- [ ] **Step 4: Wire path mask into the struct + initGL/dispose/uniforms**

Add `pathTex: WebGLTexture` (R8). Create in `initGL` from `pathData`. Bind in DISPLAY (TEXTURE2). `disposeGL` deletes `wallTex` + `pathTex`. `render()` gains `solveMix`, `wallColor`, `pathColor` (vec3, 0..1) uniforms.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/diversions/labyrinth/gl.ts
git commit -m "feat(labyrinth): composite display, solve readback, regenerate"
```

---

## Task 8: Diversion wiring (index.ts) + URL/control tests

**Files:**
- Create: `src/diversions/labyrinth/index.ts`
- Test: `src/diversions/labyrinth/index.test.ts`

`State` holds: `gl`, `res`, `cfg`, plus solve bookkeeping (`solved: boolean`, `solveTimer: number`, `solveMix: number`, `regenCount: number`). `frame` advances the sim, checks `endReached`, ramps `solveMix`, and on hold-expiry rebuilds a new maze (derive `subSeed = cfg.seed + regenCount`) and calls `regenerate`. Helper `buildMaze(cfg, trailW, trailH, subSeed)` returns `{ wallData, pathData, startCell, endUV, agentData }` (uses `mazeGridFor`, `generateMaze`, `solvePath`, `rasterizeWalls`, `rasterizePath`, `initAgentsAtStart`).

- [ ] **Step 1: Write failing test (control-from-schema + codec round-trip)**

```ts
// src/diversions/labyrinth/index.test.ts
import { describe, it, expect } from 'vitest'
import labyrinth from './index'
import { encodeConfig, decodeConfig } from '../../framework/urlCodec'

describe('labyrinth diversion', () => {
  it('declares the contract', () => {
    expect(labyrinth.id).toBe('labyrinth')
    expect(labyrinth.kind).toBe('webgl')
    expect(labyrinth.schema).toBeDefined()
  })
  it('config survives a URL encode→decode round-trip', () => {
    const cfg = labyrinth.schema.parse({})
    const params = encodeConfig(labyrinth.schema, cfg)
    const back = decodeConfig(labyrinth.schema, params)
    expect(back).toEqual(cfg)
  })
})
```

(Confirm the exact `urlCodec` export names against `src/framework/urlCodec.ts` and match the pattern used in another diversion's index/codec test before writing — adjust imports if they differ.)

- [ ] **Step 2: Run, verify it fails**

Run: `npx vitest run src/diversions/labyrinth/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement index.ts**

```ts
// src/diversions/labyrinth/index.ts
import { defineDiversion, type PresetGroup, type Size } from '../../framework/types'
import { labyrinthSchema, type LabyrinthConfig } from './schema'
import { initGL, render, step as simStep, endReached, regenerate, trailDims, uploadLUT, disposeGL, type LabyrinthGL } from './gl'
import { densityPresets, colorPresets } from './presets'
import { generateMaze, solvePath, rasterizeWalls, rasterizePath, mazeGridFor } from './maze'
import { initAgentsAtStart } from './agents'

type LabyrinthState = {
  gl: WebGL2RenderingContext
  res: LabyrinthGL
  cfg: LabyrinthConfig
  trailW: number; trailH: number
  solved: boolean; solveTimer: number; solveMix: number; regenCount: number
}

function buildMaze(cfg: LabyrinthConfig, trailW: number, trailH: number, subSeed: number) {
  const { cols, rows, cellPx } = mazeGridFor(cfg.mazeSize, trailW, trailH)
  const maze = generateMaze(subSeed, cols, rows)
  const path = solvePath(maze)
  const wallData = rasterizeWalls(maze, cellPx)   // (cols*cellPx)×(rows*cellPx)
  const pathData = rasterizePath(maze, path, cellPx)
  const startCell = { x: 1 / cols, y: 1 / rows }
  const endUV = { x: (cols - 0.5) / cols, y: (rows - 0.5) / rows }
  const agentData = initAgentsAtStart(subSeed, cfg.agents, startCell.x, startCell.y)
  // NOTE: wall/path rasters are sized cols*cellPx (≤ trailW); initGL/regenerate
  // upload them at the trail texture size — pad or set trail dims to the raster
  // size. Simplest: set trailW/H to the raster dims so masks line up 1:1.
  return { maze, path, wallData, pathData, startCell, endUV, agentData, rasterW: cols * cellPx, rasterH: rows * cellPx }
}

const hsl = '' // (no-op; colors handled in gl via hexToVec3 helper)

const presets: PresetGroup<LabyrinthConfig>[] = [
  { label: 'Density', options: densityPresets.map((p) => ({ name: p.name, patch: p.patch })) },
  { label: 'Color', options: colorPresets.map((p) => ({ name: p.name, patch: p.patch })) },
]

const labyrinth = defineDiversion<typeof labyrinthSchema, LabyrinthState, 'webgl'>({
  id: 'labyrinth',
  title: 'Labyrinth',
  description: 'A slime mold explores a maze, grows to the far corner, and lights the shortest path.',
  kind: 'webgl',
  schema: labyrinthSchema,

  setup(gl, cfg, size: Size) {
    const { tw, th } = trailDims(size.width, size.height)
    const built = buildMaze(cfg, tw, th, cfg.seed)
    const res = initGL(gl, cfg, built.rasterW, built.rasterH, built.wallData, built.pathData, built.startCell, built.endUV)
    return { gl, res, cfg, trailW: built.rasterW, trailH: built.rasterH,
             solved: false, solveTimer: 0, solveMix: 0, regenCount: 0 }
  },

  frame(state, gl, _t, dt) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    if (!state.solved) {
      render(gl, state.res, state.cfg, state.cfg.speed, state.solveMix)
      if (endReached(gl, state.res)) state.solved = true
    } else {
      // ramp the glow in over ~0.5s, then hold, then regenerate
      state.solveMix = Math.min(1.3, state.solveMix + dt / 0.5)
      state.solveTimer += dt
      render(gl, state.res, state.cfg, 0, state.solveMix) // freeze sim, keep displaying
      if (state.solveTimer >= state.cfg.holdAfterSolve) {
        state.regenCount++
        const sub = state.cfg.seed + state.regenCount * 1000
        const built = buildMaze(state.cfg, state.trailW, state.trailH, sub)
        regenerate(gl, state.res, built.wallData, built.pathData, built.agentData, built.startCell, built.endUV)
        state.solved = false; state.solveTimer = 0; state.solveMix = 0
      }
    }
  },

  update(state, cfg) {
    // structural → full re-setup
    if (cfg.mazeSize !== state.cfg.mazeSize || cfg.agents !== state.cfg.agents || cfg.seed !== state.cfg.seed) return false
    if (cfg.stops.join() !== state.cfg.stops.join()) uploadLUT(state.gl, state.res, cfg.stops)
    state.cfg = cfg
    return true
  },

  teardown(state) { disposeGL(state.gl, state.res) },

  presets,
})

export default labyrinth
```

Adjust `initGL`/`regenerate`/`render` signatures in `gl.ts` to match these call sites (wallColor/pathColor passed as hex → convert to vec3 in `render` via a small `hexToVec3` helper in gl.ts; `simStep` import can be dropped if unused). Remove the stray `hsl` line.

- [ ] **Step 4: Run, verify pass + typecheck**

Run: `npx vitest run src/diversions/labyrinth/index.test.ts && npx tsc --noEmit`
Expected: PASS + no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/labyrinth/index.ts src/diversions/labyrinth/index.test.ts
git commit -m "feat(labyrinth): diversion wiring — explore→solve→regenerate loop"
```

---

## Task 9: Full gate + Chrome verify

**Files:** none new (integration).

- [ ] **Step 1: Full test + quality gate**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green. Fix any failures before proceeding.

- [ ] **Step 2: Start dev server (background) on port 5180**

Run: `npm run dev` (background). Confirm the actual listening port.

- [ ] **Step 3: Chrome verify (chrome-devtools MCP, never built-in preview)**

Hand the URL: `http://localhost:5180/diversion/d/labyrinth/play?mute=1` (confirm route shape against the deployed `/d/<slug>/play` pattern; the dev gallery may use a hash route — verify in-app). Watch for:
  - the maze renders with high-contrast walls;
  - the slime grows visibly **from the start corner**, exploring corridors + dead-ends;
  - agents do **not** freeze in corners or leak through walls;
  - a tendril reaches the end → the shortest path **lights up** in `pathColor`, holds, then a **fresh maze** generates and it restarts;
  - the config screen shows all sliders + the two preset dropdowns; nudging a color live-updates without restarting; changing maze size / agents restarts cleanly.

Capture a screenshot mid-explore and one at the solve glow. Fix visual issues (🎚️ `SOLVE_THRESHOLD`, default `decay`/`speed`, contrast) — note any numeric balance changes for an explicit OK before locking.

- [ ] **Step 4: Commit any verify fixes**

```bash
git add -A && git commit -m "fix(labyrinth): verify-pass tuning"
```

---

## Task 10: Code review + docs + FF-merge

**Files:** `README.md` (diversion count), possibly `CLAUDE.md` gotchas.

- [ ] **Step 1: Dispatch the `diversion-reviewer` agent** (fresh, no implementation bias) against the branch diff. Address findings.
- [ ] **Step 2: Update `README.md`** — bump the diversion count + add Labyrinth to the list.
- [ ] **Step 3: Re-run the full gate** (`npx vitest run && npx tsc --noEmit && npm run lint && npm run build`).
- [ ] **Step 4: Squash the branch** to one commit (`git reset --soft main` + single commit) per the squash convention.
- [ ] **Step 5: Hand off for user-verify** before FF-merge (the one gate that survives plan approval). Surface what to look at + the live URL.

---

## Self-Review

**Spec coverage:** Maze gen (T1) · BFS solve + rasterize (T2) · start-cell agents (T3) · schema all fields (T4) · presets both axes (T5) · wall mask + wall-rejection + wall-aware diffuse (T6) · composite display + solve readback + regenerate (T7) · update seam + explore/solve/regen loop (T8) · gate + Chrome verify of all MUSTs incl. no-freeze + walls-visible (T9) · review + README + FF-merge (T10). All spec sections mapped.

**Placeholder scan:** Task 7 notes the `pathTex` is "omitted for brevity but include it" — that's an explicit instruction, not a gap; the struct/initGL/dispose wiring is spelled out in Step 4. Task 8's `buildMaze` returns raster dims so masks line up 1:1 with the trail texture (resolves the cell-vs-trail-size ambiguity flagged in the spec). No TBDs.

**Type consistency:** schema field names (`deposit`, `decay`, `diffuse`, `mazeSize`, `holdAfterSolve`, `stops`, `wallColor`, `pathColor`) are used identically in gl.ts uniforms and index.ts. `LabyrinthGL` struct fields (`wallTex`, `pathTex`, `endUV`, `startCell`, `solveCheckFrame`, `trailW/H`) are consistent across initGL/regenerate/endReached/render. `mazeGridFor` returns `{cols,rows,cellPx}` used the same way in gl.test and index.

**Note for executor:** confirm `urlCodec` export names and the play-route shape against the actual framework files before T8/T9 (called out inline). Color hex→vec3 conversion lives in gl.ts (`hexToVec3`); add it when wiring `render` uniforms.
