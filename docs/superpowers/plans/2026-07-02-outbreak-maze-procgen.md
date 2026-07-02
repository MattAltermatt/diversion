# Outbreak Maze Procgen + Flow-Field Navigation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Outbreak's building-island procgen with a legible recursive-division maze (one density knob: open plazas → 3-abreast warren), and give agents flow-field navigation so they route through it dramatically.

**Architecture:** Three layers. (1) `arena.ts` generates a maze via grid-aligned recursive division + braiding + plaza early-stop, indexed by a static `WallGrid` for O(1)-ish wall queries. (2) `navField.ts` holds two multi-source BFS distance fields (toward humans / toward zombies) on a 20px grid; agents blend LOS-gated direct-seek (open) with field-follow (occluded). (3) `render.ts` draws translucent walls so drama stays visible.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest. Struct-of-Arrays sim, `mulberry32` seeded RNG.

## Global Constraints

- World is `WORLD_W=1600 × WORLD_H=900`. Interior band `[ARENA_MX=280, 1320] × [ARENA_MY=80, 820]`; margins stay wall-free (spawn corridors).
- Arena RNG uses its **own stream**: `mulberry32((seed ^ 0x9e3779b9) >>> 0)`. Never shift agent spawns.
- `density ≤ 0.02` → `{ walls: [], grid }` (empty walls) — the wide-open escape hatch.
- Corridor width floor = **42px** (never seals; 3 agents abreast + wall-avoid clearance).
- Nav grid: `NAV_CELL=20` → 80×45 = 3600 cells. Field rebuild every `NAV_REBUILD=6` sim-steps, keyed off `stepCount`.
- Zero per-step heap allocation in hot loops (preallocate + refill in place), matching existing sim idioms.
- Tests: Vitest, co-located `*.test.ts`. Determinism (same seed → same output) is a keystone.
- Git identity already set on repo. Commit per task. No emojis in commit messages.

---

## File Structure

```text
arena.ts          Rect, WallGrid, Arena={walls,grid}; generateArena (recursive division +
                  braid + plaza + WallGrid build); insideWall/resolveWall/addWallAvoid
                  (grid-routed). resolveWall math unchanged.
arena.test.ts     determinism, margins-clear, min-gap≥42@d=1, flood-fill connectivity,
                  wall-count sanity, escape hatch, WallGrid parity vs brute-force.
navField.ts       NEW. NavGrid; createNavGrid; rebuildFields (2× multi-source BFS);
                  sampleField (descend/ascend 8-neighbor); losClear.
navField.test.ts  NEW. BFS distance correctness + INF unreachable; sample direction;
                  losClear across/around a wall; determinism.
sim.ts            Ecosystem += navGrid, stepCount; createSim builds navGrid; stepSim
                  cadence-rebuilds fields; Loop 1 faction branches LOS-gate seek vs field.
render.ts         translucent walls (alpha + faint outline).
schema.ts         arenaDensity help text → maze wording.
```

---

### Task 1: Recursive-division maze generation (`arena.ts`)

**Files:**
- Modify: `src/diversions/outbreak/arena.ts` (rewrite `generateArena` body; keep `Rect`, `insideWall`, `resolveWall`, `addWallAvoid` for now)
- Test: `src/diversions/outbreak/arena.test.ts` (extend)

**Interfaces:**
- Consumes: `mulberry32` from `../../framework/rng`; `ARENA_MX=280`, `ARENA_MY=80`.
- Produces: `generateArena(seed:number, density:number, worldW:number, worldH:number): Arena` where `Arena = { walls: Rect[] }` (grid added in Task 2). Walls are axis-aligned, thickness `wt`, doorway gaps `cw`, all inside the interior band.

**Algorithm (recursive division, doorway variant):**
```ts
// derive from density d:
const cw = Math.max(42, Math.min(156, 156 + (42 - 156) * d)) // 156→42
const wt = 10 + 6 * d                                        // 10→16
const minRegion = 2 * cw + wt + 8
const pPlaza = 0.20 + (0.08 - 0.20) * d                      // 0.20→0.08
const PBRAID = 0.30
// recurse(region): if region can't split on either axis (< minRegion both) OR rng()<pPlaza → leaf (no wall).
//   else pick split axis = the longer side that is >= minRegion; choose split position grid-aligned
//   (snap to a multiple of ~cw, jittered) leaving both children >= cw in the split axis;
//   place a wall spanning the region across that axis at thickness wt, MINUS a doorway of width cw
//   whose start is inset >=1px from both wall ends; recurse into the two children.
// A wall becomes 1 or 2 Rects (the segments either side of the doorway).
// Braiding: while building, for each placed wall, with prob PBRAID punch a SECOND doorway
//   (split a segment again), recorded as an extra gap.
```
Keep `if (density <= 0.02) return { walls: [] }`.

- [ ] **Step 1: Write failing tests** in `arena.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateArena, insideWall, type Rect } from './arena'
const W = 1600, H = 900, MX = 280, MY = 80

describe('generateArena maze', () => {
  it('is deterministic per seed', () => {
    expect(generateArena(7, 0.6, W, H).walls).toEqual(generateArena(7, 0.6, W, H).walls)
  })
  it('empty at/below the escape-hatch density', () => {
    expect(generateArena(1, 0.0, W, H).walls).toHaveLength(0)
    expect(generateArena(1, 0.02, W, H).walls).toHaveLength(0)
  })
  it('keeps spawn-corridor margins wall-free', () => {
    for (const r of generateArena(3, 1, W, H).walls) {
      expect(r.x).toBeGreaterThanOrEqual(MX)
      expect(r.x + r.w).toBeLessThanOrEqual(W - MX)
      expect(r.y).toBeGreaterThanOrEqual(MY)
      expect(r.y + r.h).toBeLessThanOrEqual(H - MY)
    }
  })
  it('wall count grows with density', () => {
    const lo = generateArena(5, 0.1, W, H).walls.length
    const hi = generateArena(5, 1.0, W, H).walls.length
    expect(hi).toBeGreaterThan(lo)
    expect(hi).toBeLessThan(1200) // sanity ceiling
  })
  it('every interior sample point is reachable from the left spawn corridor (flood fill)', () => {
    const a = generateArena(9, 1, W, H)
    // coarse 20px grid flood from (300, 450); assert >95% of non-blocked cells reached
    const reached = floodReachRatio(a) // helper below
    expect(reached).toBeGreaterThan(0.95)
  })
})
// helper: rasterize walls onto a 20px grid, BFS from the interior-left, ratio reached/free.
function floodReachRatio(a: { walls: Rect[] }): number { /* implement in test */ }
```
- [ ] **Step 2: Run — expect FAIL.** `npx vitest run src/diversions/outbreak/arena.test.ts`
- [ ] **Step 3: Implement** the recursive-division `generateArena` per the algorithm above; keep own rng stream + escape hatch. Implement `floodReachRatio` helper in the test.
- [ ] **Step 4: Run — expect PASS.** If flood-fill <0.95, the bug is a doorway landing flush against a perpendicular wall — enforce the ≥1px doorway inset and re-check.
- [ ] **Step 5: Commit** `feat(outbreak): recursive-division maze procgen (one density knob open->warren)`

---

### Task 2: WallGrid spatial index (`arena.ts`)

**Files:**
- Modify: `src/diversions/outbreak/arena.ts`
- Test: `src/diversions/outbreak/arena.test.ts` (extend)

**Interfaces:**
- Produces: `interface WallGrid { size:number; cols:number; rows:number; buckets:number[][] }`; `Arena = { walls: Rect[]; grid: WallGrid }`. `generateArena` returns the grid built over the full world (`size≈120`, `cols=ceil(W/120)`, `rows=ceil(H/120)`), each bucket listing indices of walls overlapping that cell. `insideWall(a,x,y)` and `addWallAvoid(a,x,y,r,w,out)` iterate only the relevant bucket(s); `resolveWall` unchanged.
- Consumes: everything from Task 1.

- [ ] **Step 1: Write failing test** — WallGrid must give identical results to brute force:
```ts
it('WallGrid insideWall matches brute force', () => {
  const a = generateArena(11, 0.8, W, H)
  const brute = (x:number,y:number) => a.walls.find(r => x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h) ?? null
  const rng = mulberry32(42)
  for (let k=0;k<2000;k++){ const x=rng()*W, y=rng()*H
    const g = insideWall(a,x,y); const b = brute(x,y)
    expect(!!g).toBe(!!b)
    if (g&&b) expect(g).toEqual(b)
  }
})
it('addWallAvoid matches brute force within radius', () => { /* compare accumulated out[] vs looping all walls */ })
```
- [ ] **Step 2: Run — expect FAIL** (WallGrid/`grid` not defined).
- [ ] **Step 3: Implement** `WallGrid` build in `generateArena` (also build an empty grid in the escape-hatch return), route `insideWall` + `addWallAvoid` through buckets (union the 3×3 block for `addWallAvoid` since radius 14 < 120; dedupe via a seen-set or accept double-count-free by iterating unique bucket indices).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `perf(outbreak): static WallGrid index for insideWall/addWallAvoid`

---

### Task 3: Nav fields + BFS + LOS (`navField.ts`)

**Files:**
- Create: `src/diversions/outbreak/navField.ts`
- Test: `src/diversions/outbreak/navField.test.ts`

**Interfaces:**
- Consumes: `Arena`, `insideWall` from `./arena`.
- Produces:
```ts
export const NAV_CELL = 20
export interface NavGrid {
  cols: number; rows: number; cell: number
  blocked: Uint8Array          // 1 = wall
  humanDist: Int32Array        // BFS distance to nearest civilian/fighter (INF = unreachable)
  zombieDist: Int32Array       // BFS distance to nearest zombie
  queue: Int32Array            // preallocated BFS ring
}
export function createNavGrid(arena: Arena, worldW: number, worldH: number): NavGrid
// e is the Ecosystem (px,py,faction,alive,n); CIVILIAN/FIGHTER/ZOMBIE consts imported by caller
export function rebuildFields(nav: NavGrid, e: {
  n:number; px:Float32Array; py:Float32Array; faction:Uint8Array; alive:Uint8Array
}): void
// writes a unit direction into out toward lower (descend=true) / higher (descend=false)
// walkable neighbour of (x,y); returns false if the cell has no usable gradient.
export function sampleField(nav: NavGrid, dist: Int32Array, x: number, y: number, descend: boolean, out: Float32Array): boolean
export function losClear(arena: Arena, ax: number, ay: number, bx: number, by: number): boolean
```
- `createNavGrid`: `blocked[i] = insideWall(arena, cellCenterX, cellCenterY) ? 1 : 0`. Static — caller rebuilds only when the arena changes.
- `rebuildFields`: reset both dist arrays to `INF` (a large sentinel, e.g. `0x3fffffff`); seed queue with every source agent's cell (dist 0); 4-connected BFS skipping blocked cells; do this once per field (humans → humanDist, zombies → zombieDist).
- `sampleField`: read the current cell; if blocked or INF → return false; scan 8 neighbours (diagonals only if both orthogonals open), pick the min (descend) / max-but-finite (ascend) distance strictly better than current; write normalized direction to that neighbour's center into `out`; false if none better.
- `losClear`: step the segment at ~10px increments; if any sampled point `insideWall` → false; else true.

- [ ] **Step 1: Write failing tests** in `navField.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createNavGrid, rebuildFields, sampleField, losClear, NAV_CELL, type NavGrid } from './navField'
import { generateArena } from './arena'
const W=1600,H=900
const eco = (pts:[number,number,number][]) => ({ // [x,y,faction]
  n: pts.length,
  px: Float32Array.from(pts.map(p=>p[0])), py: Float32Array.from(pts.map(p=>p[1])),
  faction: Uint8Array.from(pts.map(p=>p[2])), alive: Uint8Array.from(pts.map(()=>1)),
})
const CIV=0, ZOM=2

it('humanDist is 0 at a human cell and grows with distance in open arena', () => {
  const a = generateArena(1, 0, W, H) // empty
  const nav = createNavGrid(a, W, H)
  rebuildFields(nav, eco([[300,450,CIV]]))
  const cell = (x:number,y:number)=> Math.floor(y/NAV_CELL)*nav.cols + Math.floor(x/NAV_CELL)
  expect(nav.humanDist[cell(300,450)]).toBe(0)
  expect(nav.humanDist[cell(500,450)]).toBeGreaterThan(nav.humanDist[cell(360,450)])
})
it('sampleField descend points toward the human', () => {
  const a = generateArena(1, 0, W, H); const nav = createNavGrid(a, W, H)
  rebuildFields(nav, eco([[300,450,CIV]]))
  const out = new Float32Array(2)
  expect(sampleField(nav, nav.humanDist, 600, 450, true, out)).toBe(true)
  expect(out[0]).toBeLessThan(0) // move -x toward the human at 300
})
it('unreachable region stays INF (a walled pocket)', () => {
  // build/verify a config where a cell is enclosed; assert humanDist == sentinel there
})
it('losClear is false through a wall, true around open space', () => {
  const a = generateArena(9, 1, W, H)
  // pick two points on opposite sides of a known wall rect → false; two open points → true
})
```
- [ ] **Step 2: Run — expect FAIL** (module missing).
- [ ] **Step 3: Implement** `navField.ts` per interfaces (preallocated arrays, sentinel INF, ring-buffer BFS, zero per-call alloc except the arrays created in `createNavGrid`).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** `feat(outbreak): flow-field nav module (2x multi-source BFS + LOS)`

---

### Task 4: Wire navigation into the sim (`sim.ts`)

**Files:**
- Modify: `src/diversions/outbreak/sim.ts`
- Test: `src/diversions/outbreak/sim.test.ts` (extend)

**Interfaces:**
- Consumes: `createNavGrid`, `rebuildFields`, `sampleField`, `losClear` from `./navField`.
- Produces: `Ecosystem` gains `navGrid: NavGrid` and `stepCount: number`. Behavior: `createSim` builds `navGrid = createNavGrid(arena, WORLD_W, WORLD_H)`. `stepSim` at top: `if (e.stepCount % NAV_REBUILD === 0) rebuildFields(e.navGrid, e); e.stepCount++`. In Loop 1, wherever a faction currently `addSeek`s a moving target (zombie→prey/fighter, civilian→safe-fighter *and* flee, fighter→zombie), keep the direct `addSeek` **only when `losClear(arena, self, target)`**; otherwise substitute a field contribution at the same weight:
  - zombie chasing: `sampleField(navGrid, humanDist, x, y, /*descend*/true, tmp)` → `acc += tmp * targetW`.
  - civilian fleeing (occluded from the zombie): `sampleField(navGrid, zombieDist, x, y, /*ascend*/false, tmp)` → `acc += tmp * W_CIV_FLEE`.
  - fighter advancing (occluded): `sampleField(navGrid, humanDist? no — toward zombies)`. **Fighters descend `zombieDist`** to advance. Use it only for the advance leg; keep kite/hold thresholds on the true distance to the nearest zombie as today.
  - If `sampleField` returns false, fall back to the existing direct-seek / `nearestHumanGlobal`.
- `NAV_REBUILD = 6` const in `sim.ts`.

- [ ] **Step 1: Write failing test** in `sim.test.ts`:
```ts
it('a zombie routes around a wall toward an occluded civilian', () => {
  // craft a tiny sim: 1 zombie left of a wall, 1 civilian right of it, LOS blocked.
  // step ~120 times; assert the zombie's x advances past the wall gap (didn't stall against it).
})
it('sim stays deterministic with nav (same seed → same civAlive after N steps)', () => {
  const cfg = {/* fixed */}; const a = createSim(cfg); const b = createSim(cfg)
  for (let k=0;k<300;k++){ stepSim(a); stepSim(b) }
  expect(a.civAlive).toBe(b.civAlive); expect(a.zombieAlive).toBe(b.zombieAlive)
})
it('open arena (density 0) leaves steering effectively unchanged (agents still converge)', () => {
  // density 0 → all LOS clear → behaves like pre-nav; assert horde reaches humans (conversions happen)
})
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the Ecosystem fields + cadence rebuild + LOS-gated field blend in the three faction branches. Reuse a scratch `Float32Array(2)` on the Ecosystem for `sampleField` out (no per-agent alloc).
- [ ] **Step 4: Run — expect PASS**, and run the whole outbreak suite: `npx vitest run src/diversions/outbreak`.
- [ ] **Step 5: Commit** `feat(outbreak): LOS-gated flow-field navigation in the sim`

---

### Task 5: Translucent walls + schema copy (`render.ts`, `schema.ts`)

**Files:**
- Modify: `src/diversions/outbreak/render.ts`, `src/diversions/outbreak/schema.ts`
- Test: `src/diversions/outbreak/schema.test.ts` (extend)

**Interfaces:**
- `render.ts`: draw each wall with `ctx.globalAlpha = 0.5` fill in `wallColor`, then a faint full-alpha 1px outline, restoring `globalAlpha = 1` after. No structural change.
- `schema.ts`: update `arenaDensity` `.meta({ help })` text to describe the maze (open plazas → tight warren). Keep the slider bounds.

- [ ] **Step 1: Write failing test** in `schema.test.ts`:
```ts
it('arenaDensity help describes the maze', () => {
  const help = String(schema.shape.arenaDensity.meta()?.help ?? '')
  expect(help.toLowerCase()).toMatch(/maze|plaza|warren|corridor/)
})
```
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the render alpha/outline + schema help text.
- [ ] **Step 4: Run — expect PASS** + full suite `npx vitest run`.
- [ ] **Step 5: Commit** `feat(outbreak): translucent walls + maze density help text`

---

### Task 6: Chrome verification (inline; lead-run)

**Files:** none (verification only).

- [ ] Start dev server: `npm run dev` (port 5180).
- [ ] Open **seeded** urls (a seedless direct load resumes/ignores params — memory `gotcha-verify-seeded-url-not-seedless`). Sweep `arenaDensity`: `0.05`, `0.35`, `0.70`, `1.0` at `?seed=7&mute=1`.
- [ ] Assert visually: (a) legible maze, not wall noise; (b) chases wind through corridors + lunge on straightaways; (c) a fleeing civ gets trapped in a dead end while zombies funnel in single-file; (d) translucent walls keep kills-behind-corners visible; (e) 60fps at high count; (f) density 0.05 still reads like today's open two-wave surge. If HMR shows black canvas after structural edits, hard reload (Cmd-Shift-R).
- [ ] Note any 🎚️ tuning wants (agent size, default density) — do NOT change numerics without an explicit user ask.

---

### Task 7: Code review + verification gate (before FF-merge)

- [ ] Dispatch `diversion-reviewer` (5 UX invariants, schema-as-truth, codec keystone) and `perf-analyzer` (per-frame allocs, BFS cost, WallGrid, frame budget) as fresh reviewers — no implementation bias.
- [ ] Address findings. Re-run `npx vitest run` (full suite green) + `npm run build`.
- [ ] Update README/gallery if outbreak's description references the arena; mark spec/roadmap.
- [ ] Hand off for user-verify before FF-merge to `main`.

---

## Self-Review

- **Spec coverage:** ① layout → Tasks 1–2; ② navigation → Tasks 3–4; ③ watchability → Task 5; #239 explicitly out of scope (noted, not a task); verification → Tasks 6–7. ✅ All spec sections mapped.
- **Placeholder scan:** test bodies marked with `/* implement in test */` are intentional per-task authoring points (flood-fill helper, walled-pocket fixture, wall-crossing point pair) — each names exactly what to build; no vague "add tests"/"handle edge cases". ✅
- **Type consistency:** `Arena={walls,grid}`, `WallGrid={size,cols,rows,buckets}`, `NavGrid` fields, and `sampleField(nav,dist,x,y,descend,out)` / `losClear(arena,ax,ay,bx,by)` signatures are used identically in Tasks 3–4. `NAV_CELL` exported from `navField`, `NAV_REBUILD` local to `sim.ts`. ✅
```
