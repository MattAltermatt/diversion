# Outbreak — Maze Procgen + Flow-Field Navigation

**Date:** 2026-07-02
**Status:** Approved (brainstorm + 3 dueling-agent synthesis)
**Branch:** `feature/outbreak`
**Supersedes:** the `#235` building-island procgen in `arena.ts`

## Goal

Turn Outbreak's arena from a scatter of building "islands" into a **legible maze** —
dead ends, restricting pathways, funnels, chokepoints — controlled by the existing
single `arenaDensity` knob sweeping continuously from **near-open (≈2 walls, vast
plazas)** to a **tight warren (corridors just wide enough for ~3 agents abreast)**.

The maze must be *entertaining to watch* (this is a no-camera, whole-arena zen
screensaver), which means the drama has to be **visible** and the mass-surge
spectacle preserved at the open end of the slider.

## The load-bearing insight

Agents today navigate by **pure steering + short-range wall-avoidance, no
pathfinding** (`sim.ts` Loop 1). A maze with dead ends and corners would pin
steering-only agents against walls — they smear instead of routing around, dead
ends trap *everyone*, and the 14s settle timer reseeds before anything resolves.
**A maze is therefore not a tuning change — it requires real navigation.**

The keystone that makes this safe: navigation is **line-of-sight-gated**. In an
open arena (low density → no walls) every LOS is clear, so every agent direct-seeks
exactly as it does today — the sim is **bit-identical to the current beloved feel**.
Walls are the *only* thing that flips an agent into route-following. The density
slider is thus a smooth dial from "today's surge" → "structured maze", not a rewrite.

## Design — three layers

### ① Layout: grid-aligned recursive division + WallGrid (`arena.ts`)

Replace `generateArena`'s body with **recursive division (doorway variant)**:

1. Start with the empty interior rectangle `[ARENA_MX, W-ARENA_MX] × [ARENA_MY, H-ARENA_MY]`.
2. Recursively lay one thin dividing wall (thickness `wt`) across the longer axis of
   each sub-region, leaving a **doorway gap** of width `cw`.
3. Recurse into the two halves. **Stop** when a region can't fit two `cw`-wide
   children plus a wall (`minRegion = 2*cw + wt + 8`), or on a random **plaza
   early-stop** (`pPlaza`) that leaves a big open leaf.
4. **Braid**: after the tree is built, punch a *second* doorway in each wall with
   probability `pBraid ≈ 0.30` — adds loops so the horde can flank / split and the
   crowd never fully herds into corners.

Keep the existing `seed ^ 0x9e3779b9` **own rng stream** (wall gen must never shift
agent spawns) and the `density ≤ 0.02 → { walls: [] }` wide-open escape hatch.

**One knob → openness.** Everything derives from corridor/doorway width `cw`:

```
cw        = clamp( lerp(156, 42, d), 42, 156 )   // wide streets → 3-abreast warren
wt        = lerp(10, 16, d)                       // wall thickness (mostly a look knob)
minRegion = 2*cw + wt + 8                          // split-feasibility → recursion depth
pPlaza    = lerp(0.20, 0.08, d)                    // early-stop → plazas
pBraid    = 0.30                                    // loop fraction (coupled to density for now)
```

```text
density   corridor width   ~walls   look
-------   --------------   ------   ------------------------------------------
0.02      —                0        wide-open field (escape hatch, unchanged)
0.05      ~156px           2–6      "2 walls", vast plazas
0.35      ~92px            ~65      avenues + a few rooms  ← watchable default
0.70      ~60px            ~200     rooms + alleys, real maze
1.00      ~42px (3-wide)   ~450     tight warren, dead ends everywhere
```

- `cw` floored at **42** (SEP_R=7 → 3 agents ≈ 14px + 14px wall-avoid clearance each
  side) so a corridor never seals — the current "min inset keeps streets open"
  invariant made an explicit hard clamp.
- **Connectivity is free by construction** (recursion = spanning tree; braids only
  add doors; plaza early-stop keeps the parent door). No flood-fill repair pass.
- **Doorway guard:** inset every doorway ≥1 unit from its wall's ends so a gap never
  lands flush against a perpendicular wall (which would make an effectively-blocked
  door). Grid-align splits so doorways line up into clean through-corridors.
- **Spawn corridors stay clear:** generate strictly inside the interior band; add
  **no** interior-perimeter wall, so fighters (x<220) and the horde (x>1380) pour
  straight in. World-bounds bounce (loop 2) handles the outer edge.

**WallGrid (mandatory perf dependency, ~30 lines in `arena.ts`).**
A maze has ~450 walls at max density vs today's ~12. `insideWall` and `addWallAvoid`
each loop **all** walls **per agent per step** — O(agents×walls×steps) melts at the
ceiling (~5.8M closest-point tests/frame). Fix: build a **static uniform WallGrid**
(~120px cells, ~13×9 over the full world) in `generateArena` mapping each cell → the
wall indices overlapping it.
- `Arena` becomes `{ walls: Rect[]; grid: WallGrid }`.
- `insideWall` queries the single cell of `(x,y)`; `addWallAvoid` (radius 14 < cell)
  queries the 3×3 block. O(walls) → O(~2–8 near the agent).
- Signatures of `insideWall`/`resolveWall`/`addWallAvoid` are unchanged (they already
  take `Arena`). **Zero collision-model rewrite; nothing changes in `sim.ts` for this.**
- **Tunneling is safe:** max per-step travel = 140 × 1.5 lunge × DT ≈ 3.5px (sub-steps
  each advance DT, so `speed>1` doesn't increase per-step travel); `wt ≥ 10` clears it.

### ② Navigation: two-field LOS-gated flow (`navField.ts` new + `sim.ts` hooks)

Two **multi-source BFS distance fields** on a coarse nav-grid:

```text
field         BFS sources                consumers            motion
-----------   ------------------------   ------------------   --------------
HUMAN_FIELD   all civilians + fighters   zombies              descend (chase)
ZOMBIE_FIELD  all zombies                civilians            ascend  (flee)
                                         fighters             descend (advance)
```

The zombie field is the keystone: civilians **ascend** it to flee down real corridors,
fighters **descend** the *same* field to advance — one BFS drives both human
behaviors. No separate "away-from-horde" field; no field for recruiting.

- **Grid:** 20px cells → 80×45 = 3600 cells. Any gap wider than 20px is guaranteed to
  contain ≥1 free cell center, so a 42px corridor can never be falsely sealed; walls
  (≫20px) can never fail to block. Blocked mask = `insideWall(center)`, built **once**
  on setup / arena rebuild (static).
- **Cadence:** rebuild both fields every **6 sim-steps** (~10Hz), keyed off a
  `stepCount` (not frame count) so slow-mo / fast-forward stay correct. At ~90px/s an
  agent moves <1 cell between rebuilds. Cost ≈ 100k ops/sec — negligible.
- **BFS:** 4-connected (uniform integer cost). Preallocated ring-buffer queue
  `Int32Array(3600)`; two `Int32Array(3600)` distance grids + one `Uint8Array(3600)`
  blocked mask, refilled in place (zero per-step alloc). Unvisited = INF.
- **Moving targets:** re-seed both BFS from scratch each rebuild (mark every source
  agent's cell = 0, sweep). No incremental maintenance, no stale goals.

**Blend rule (per agent, one more weighted contribution into `acc[]`):**
- **Target in line-of-sight** (segment agent→target crosses no wall): **direct-seek**
  — current `addSeek`, current weights, lunge intact.
- **Target occluded**: **field-follow** — steer toward the 8-neighbor with lowest
  (descend) / highest (ascend) distance, at the same weight as the seek it replaces.
  Diagonal allowed only if both its orthogonal cells are open (no corner-cut);
  wall-avoid mops up the rest.
- LOS tests gated to targets within `ZOMBIE_PERCEPT` (150px); beyond that always
  field-follow (caps LOS cost).
- Separation / cohesion / clump / kite / flee-jitter **untouched** → flocking feel and
  murmuration survive. Civilian `addFlee` local panic-jitter stays *and* gains
  field-ascend routing: jitter when a zombie is visible, route when occluded/cornered.
- **Unreachable fallback:** a zombie with no reachable human (INF everywhere) falls
  back to the existing `nearestHumanGlobal` direct-seek; the settle timer handles the
  degenerate isolated-pocket case.

**Perf:** added per-agent work ≈ one 8-neighbor sample + one range-gated
segment-vs-AABB LOS test (~2–8 walls via WallGrid). Worst case ≈ 2.7M ops/sec,
dwarfed by existing neighbor queries. Comfortably 60fps at ~1600 agents.

### ③ Watchability (`render.ts`)

- **Translucent walls** — draw footprints at reduced alpha (~0.5) + a faint outline,
  so a bite/last-stand behind a corner stays legible under the whole-arena view.
  Non-negotiable; ~one-liner in `render.ts`.
- **Default density stays moderate (~0.35)** so the two-waves-crash spectacle is
  preserved on most reseeds; the tight warren lives at the top of the slider (as the
  user asked), not forced every reseed. *(default value = tuning — confirm at verify.)*
- **Agent size** — 3px specks read poorly against structure; likely wants a bump/glow.
  🎚️ *Tuning — flag at Chrome-verify, do not change numerically without an explicit ask.*

## Balance (#239) — out of scope, tracked

The maze is **net pro-horde** (de-globalizes runaway fighter recruitment via corridor
travel time; zombies route to corner fleeing civs). It won't *fully* fix #239 — the
deeper cause is instant every-civilian-in-radius recruit vs 1.2s infection. The clean
mechanism fix is a **symmetric recruit-delay timer**, kept as a **separate balance
pass** (`#239`), not bundled here. Any numeric rebalance stays an explicit user ask.

## Files

```text
arena.ts        rewrite generateArena → recursive division; add WallGrid; route
                insideWall + addWallAvoid through the grid; Arena = {walls, grid}.
                resolveWall unchanged.
arena.test.ts   flood-fill connectivity from spawn corridor; min-gap ≥42 at d=1;
                margins wall-free; determinism (same seed→same walls); wall-count
                sanity at low/mid/high d.
navField.ts     NEW — blocked mask + 2 distance grids + multi-source BFS +
                descend/ascend 8-neighbor sample + losClear(arena,ax,ay,bx,by).
navField.test.ts NEW — BFS correctness (distance monotonic from source, INF for
                unreachable); descend/ascend picks; losClear across a wall; determinism.
sim.ts          add navGrid + stepCount to Ecosystem; cadence-gated field rebuild at
                top of stepSim; LOS-gated field contribution in Loop 1's three faction
                branches; unreachable fallback to nearestHumanGlobal.
render.ts       translucent walls (alpha + outline).
schema.ts       arenaDensity help text → "procgen maze" wording. Slider unchanged.
index.ts        update() already re-setups on arenaDensity/seed change → static mask
                rebuild comes for free. Verify no extra wiring needed.
```

## Non-goals / YAGNI

- No per-agent A* (flow field is the right tool for a crowd chasing few moving goals).
- No wall-follow steering (that's the smear we're removing).
- No third flee field, no recruit field.
- No incremental field maintenance (full re-seed each rebuild is cheap).
- No collision-model or render-pipeline rewrite.
- No #239 numeric rebalance in this work.

## Verification

- Unit: `arena.test.ts` + `navField.test.ts` green; full suite green.
- Chrome (SEEDED url — a seedless direct load resumes/ignores params): sweep
  `arenaDensity` 0.05 / 0.35 / 0.70 / 1.0 and confirm: (a) legible maze not noise,
  (b) chases wind through corridors + lunge on straightaways, (c) dead-ends trap prey
  while hunters funnel in, (d) walls translucent enough to see kills behind corners,
  (e) 60fps at high count, (f) low-density still reads as today's open surge.
- Code-review phase (fresh `diversion-reviewer` + `perf-analyzer`) before FF-merge.
