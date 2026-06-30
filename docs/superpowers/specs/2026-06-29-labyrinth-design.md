# Labyrinth (#149) — design spec

**Status:** approved 2026-06-29 · **Issue:** #149 · **kind:** `webgl` · **Family:** agent + trail field, obstacle-constrained · **emergent** cohort

A slime-mold colony that **solves a maze**. Canonical result: Nakagaki 2000 ("Maze-solving by an
amoeboid organism") / Tero 2010 (Tokyo rail network). Here, reframed as an endless screensaver: a
fresh maze each reload, the colony **grows from the start corner, explores the corridors, and
reaches the far corner** — then the true shortest path lights up, holds a beat, dissolves, and a new
maze generates. Reuses the all-GPU Physarum FBO host (#134); a **distinct diversion**, not a preset.

## Mechanism — A (pure exploration) + P1 (highlight on solve)

Locked at brainstorm:

- **A. Pure exploration.** Agents spawn at the **start** cell and navigate by the standard Physarum
  rule (sense 3 taps of their own pheromone trail, steer toward the strongest, random turn when
  trapped — Jones 2010), constrained by maze walls. **No engineered attractant** — the colony does
  not "know" where the end is; it floods the corridors and a tendril eventually reaches the exit.
  The show is the **growth front** creeping through the labyrinth.
- **Consequence:** with no attractant there is no flux concentrating the trail onto the true path
  (that needs food-sources at both ends → mechanism B/C, rejected). The trail floods corridors
  roughly **uniformly**, so the solution path will **not** self-highlight out of the trail.
- **P1. Highlight on solve.** Therefore the payoff is a **precomputed** path overlay: when the trail
  reaches the end cell, the known shortest path (BFS, computed at gen time) ramps in as a distinct
  bright glow over the explored trail, holds `holdAfterSolve` seconds, then dissolves and a fresh
  maze generates. Painting the known path is the *only* coherent reward under mechanism A.

## Architecture

- **Host:** WebGL2, `kind: 'webgl'`, adapted from `src/diversions/physarum/gl.ts` (RGBA32F agent
  texture `(x,y,heading,respawn-phase)`, R16F ping-pong trail FBO, sense→steer→advance→deposit→
  diffuse+decay, gradient-LUT display). Gated on `EXT_color_buffer_float`; `teardown(state)` frees
  all GL resources (host leak rule — `webgl2` context persists across gallery navigation).
- **The 4 changes to the host (what Physarum lacks):**
  1. **Wall mask texture** — the maze baked to an R8 mask at trail resolution. Each cell spans
     **≥ ~8 texels** so corridors have room for trail + 3-tap sensing.
  2. **MOVE_FRAG** — replace the torus wrap (`pos = fract(pos+1)`) with **wall-rejection**: if the
     candidate step lands in a wall texel, **do not advance**; apply a random/reverse turn so the
     agent stays in the corridor and retries next step. The outer border is walls → agents can't
     escape. **Respawn returns agents to the START cell** (keeps it "growing from start", and keeps
     a steady trickle of fresh explorers, per Sage Jenson's reinit).
  3. **DIFFUSE_FRAG** — skip neighbour taps that are walls → pheromone never blurs across a wall.
     Corridors stay crisp; wall texels hold zero trail.
  4. **DISPLAY_FRAG + solve detection** — composite: background → walls (high-contrast) → trail
     gradient in corridors → path-glow overlay (alpha ramps 0→1 once solved, driven by a uniform).
     Solve = periodic `readPixels` of the trail at the **end** cell (1×1, every ~30 frames to avoid
     a per-frame GPU sync stall) crossing a density threshold.
- **Per-frame** `gl.viewport(0,0,drawingBufferWidth,drawingBufferHeight)`.
- **Resize:** display samples the trail in normalized UV and fills the screen, so window/fullscreen
  resize survives without reallocation (same as Physarum — the maze keeps its setup-time grid).
- **Regenerate loop (screensaver-critical):** on solved + hold elapsed → derive a new sub-seed from
  the genesis seed + a regen counter, regenerate maze, re-rasterize wall/path masks, clear the
  trail, respawn agents at the new start. Entirely inside `frame` — no React involvement.

## Maze

- **Generation:** **recursive backtracker** (perfect maze — every cell reachable, exactly one path
  between any two cells; long winding corridors, dramatic). Deterministic via `mulberry32(subSeed)`.
- **Start / end:** **opposite corners** (top-left → bottom-right).
- **Solution:** BFS from start to end → the unique path (perfect maze). Rasterized to a path mask
  for the P1 highlight.
- **Grid sizing:** square cells; grid dims derive from the trail texture size and `mazeSize`
  (cells on the short axis). `mazeSize` is **capped** so each cell keeps ≥ ~8 texels — too fine and
  3-tap sensing breaks. Non-square canvas → more cells on the long axis (cells stay square).
- **Genesis seed:** per-reload fresh maze (mirrors Gray-Scott #35 / Physarum genesis).

## Schema (single source of truth)

```
── Maze ──
mazeSize    slider  cells on the short axis; bounded so cells keep ≥ ~8 texels
seed        number  genesis seed (same seed → same maze sequence)
── Behavior ──   (slime navigation — carried from Physarum)
sensorAngle slider  left/right sensor angle off heading
sensorDist  slider  how far ahead agents taste the trail (texels)
turnSpeed   slider  steer rate toward strongest trail (deg/step)
deposit     slider  trail laid per agent per step
decay       slider  fraction of trail lost per step (floor > 0)
diffuse     slider  trail spread into neighbours per step
── Simulation ──
agents      slider  agent count (structural — restarts the sim)
speed       slider  sim steps per frame (fractional; calm default)
── Solve ──
holdAfterSolve  slider  seconds to dwell on the lit path before regenerating
── Color ──
stops       colorList  trail-density gradient (background → densest)
wallColor   color      maze walls (high-contrast)
pathColor   color      solved-path glow
```

Defaults sit at the **calm / zen** end (slow `speed`, modest `agents`) per the screensaver ethos —
always beautiful while it explores. `ui:'slider'` only where min/max are defined (invariant #4);
`seed` is `ui:'number'` (open-ended).

### MUST (UX invariants + load-bearing seams)

1. **Walls always visible, high-contrast** (invariants #1, #5) — the labyrinth the slime navigates
   must read clearly at all times; the solve glow is the visual reward against it.
2. **`update?()` seam.** Colors / sensor params / `speed` / `decay` / `holdAfterSolve` → swap
   uniforms, **return true** (sim keeps evolving). `mazeSize` / `agents` / `seed` → **return false**
   → teardown + setup. Without this, every slider nudge would wipe the maze.
3. **Agents must not freeze** in corners — the random turn on wall-rejection must reliably unstick
   them. Verify (visual + a logic test on the rejection-turn).
4. **`readPixels` cadence** — float-FBO readback every ~30 frames (1×1 at the end cell), never
   per-frame (GPU sync stall).
5. **Capability gate** — `EXT_color_buffer_float`; graceful fallout, never a hard crash.

## Presets — two independent axes (declared `PresetGroup` data)

**Density** (maze complexity + agent count; structural → `update?()` returns false):

```
Open      coarse maze, fewer agents — big rooms, fast solve
Classic   default
Dense     fine maze, more agents — intricate, slower solve
```

**Color** (trail gradient + wall + path glow; live-swap → `update?()` returns true):

```
Bioluminescence  deep-blue → cyan → white trail · slate walls · gold path     (default)
Ember            black → orange → white trail · charcoal walls · cyan path
Spore            violet → magenta → pink trail · deep-plum walls · lime path
```

(Exact stops are 🎚️ tunables confirmed at Chrome-verify. High contrast — invariant #5.)

## Files

Mirror `src/diversions/physarum/`:

```
src/diversions/labyrinth/
  index.ts      diversion contract { id:'labyrinth', title:'Labyrinth', kind:'webgl', setup, frame, update, teardown, presets }
  schema.ts     Zod schema (single source of truth)
  presets.ts    Density + Color PresetGroup[]
  maze.ts       NEW pure logic — generateMaze / solvePath (BFS) / rasterizeWalls / rasterizePath
  agents.ts     seeded init at START cell; buildLUT (gradient → 256×RGBA LUT)
  gl.ts         adapted host — wall mask, wall-rejection MOVE, wall-aware DIFFUSE, composite DISPLAY, readPixels solve detect, regen
```

## Tests (Vitest, co-located)

- **`maze.test.ts`** (the new core): generation determinism (same seed → same grid), **full
  connectivity** (every cell reachable — flood-fill count == cell count), BFS path correctness
  (path is contiguous, starts at start, ends at end, only on corridors), rasterization sanity
  (border all walls, start/end cells open).
- **Wall-rejection logic** test (a candidate landing in a wall does not advance + applies a turn) —
  extracted to a pure helper if feasible.
- **Schema:** URL codec round-trip + per-field resilience (the keystone), control-selection-from-
  schema, preset-patch application (`matchPresets` flips to Custom on manual drift).
- **`gl.test.ts`:** `trailDims` cap; cell-texel budget bound for `mazeSize`.

## Out of scope → backlog

- Mechanism **B** (gentle end-attractant / chemotaxis) and **C** (faithful fill-then-retract) as
  alternate modes.
- Configurable start/end placement (beyond opposite corners); maze algorithm choice (Prim/Wilson).
- Emergent path concentration (would require food-source flux = mechanism B/C).
- Maze-cell "rooms" / braided (multiply-connected) mazes.
