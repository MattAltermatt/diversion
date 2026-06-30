# BoxCar2D — Evolvable Spring-Truss Cars (#156)

**Status:** design locked 2026-06-30
**Supersedes:** the fixed 8-vertex radial chassis from #153
**Issue:** [#156](../../../README.md) — additional car / genome types

## 🎯 Goal

Replace the current fixed-shape car (8 radial chassis magnitudes + global motor + ≤2 wheels) with a **free-form spring-truss** whose every part evolves. A car is an arbitrary connected frame of nodes joined by spring members, with 1–6 independently-driven wheels. Nothing is truly rigid; nothing radiates from a center; the silhouette is whatever evolution finds (`/_\-/`, `<|>`, lopsided junk, …).

This is a **full replacement** of the genome, not a selectable `carType`. Fitness, modes (distance/time), terrain, rubble, GA scaffolding (elitism + roulette), and the URL-codec / share-link contract are all **unchanged** — the URL stores config + seed, never the evolved population, so determinism holds across the rewrite.

## 🧬 The genome

Fixed-length with toggles (so the existing uniform per-gene crossover keeps working — issue's explicit guidance). Every value below is a gene, all rng-derived from the seed.

```
const MAX_NODES = 7      // 3–7 active
const MAX_WHEELS = 6     // 1–6 active
const N_PAIRS = 21       // C(7,2) node-pair slots

NodeGene   { present: boolean; x: number; y: number; mass: number }   // ×7
PairGene   { stiffness: number; damping: number }                     // ×21, indexed by (i<j) pair
WheelGene  { present: boolean; node: number; radius: number; grip: number;
             mass: number; powered: boolean; motorSpeed: number /*signed*/; torque: number } // ×6

Genome { nodes: NodeGene[7]; pairs: PairGene[21]; wheels: WheelGene[6] }
```

- **Node count** = number of `present` node slots; random in **3–7** at birth, drifts via toggle mutation.
- **Wheel count** = number of `present` wheel slots; random in **1–6**, always ≥1.
- `motorSpeed` is **signed** — negative = the wheel spins backward. `powered:false` ⇒ free-rolling caster (motor disabled regardless of speed).
- **No edge-present gene.** Which pairs are actual members is *derived* (below). The `PairGene` table is consulted only for pairs that turn out to be members; storing it per-slot keeps the genome fixed-length.

### Gene ranges (tunable constants in `genome.ts`, mirroring today's `DEFAULT_RANGES`)

```
nodeX            [-1.2, 1.2] m        node positions inside a ~2.4×1.6 m box
nodeY            [-0.8, 0.8] m
nodeMass         [0.5, 3.0]           density of the node's collision disc
stiffness        [0, 1]   → hertz     mapped 0→~0.8 Hz (floppy) … 1→~15 Hz (near-rigid)
damping          [0, 1]   → dampingRatio  ~0.1 … ~1.0
wheelRadius      [0.15, 0.65] m
wheelGrip        [0.3, 1.5]           friction
wheelMass        [0.5, 2.0]           density
motorSpeed       [-30, 30] rad/s      signed
motorTorque      [5, 120]
nodeRadius       0.10 m  (constant)   collision disc radius for every node
```

## 🔺 Structure — members derived by Delaunay triangulation

The active nodes are Delaunay-triangulated; the resulting edges **are** the members. Properties:

- Always **connected**, always **rigid** (all triangles — "always a triangle to connect them"), never self-crossing.
- Move/toggle a node and the frame re-knits with no repair logic and no invalid cars.
- Each edge `(i,j)` reads its `stiffness`/`damping` from `pairs[pairIndex(i,j)]`.

**New file `triangulate.ts`** — pure deterministic 2D Delaunay (Bowyer–Watson, no deps; ≤7 points so trivially fast). Unit-tested. **Degeneracy fallback:** if the active nodes are collinear (no triangle emerges), connect them as a sorted chain so the frame is still one connected piece. Collinearity is measure-zero in continuous space but seeds are fixed, so the fallback must exist.

## ⚙️ Physics — skeletal (option A)

- **Node** → small circle body (`nodeRadius`, density from `mass`), collides with terrain. `groupIndex = CAR_GROUP` so a car's own parts never self-collide.
- **Member** → distance joint between its two node bodies, `length` = their initial separation, `enableSpring` with `hertz`/`dampingRatio` from the pair genes. High stiffness ⇒ high hertz ⇒ effectively rigid. **No collision shape** — members are joints only (the skeletal look; far cheaper than capsule struts).
- **Wheel** → circle body joined to its mount node body via a wheel joint (suspension axis y, the existing `createWheelJoint` spring params), `enableMotor = powered`, `motorSpeed = motorSpeed` (signed), `maxMotorTorque = torque`.
- **New physics helper `createDistanceJoint`** in `physics.ts` (wraps the box2d distance-joint API; sibling to `createWheelJoint`).

`CarBodies` becomes:
```
{ nodes: { body: BodyId; gene: NodeGene }[];
  members: { a: number; b: number; stiffness: number }[];   // indices into nodes
  wheels: { body: BodyId; radius: number }[] }
```
The old `chassis` single-body and `verts` polygon are gone.

## 🏁 Simulation & fitness (mostly unchanged)

- No single chassis body now → track the **centroid** (mean of node body positions) for progress / stall / max-X. `simulateCar` and the live `index.ts` loop both switch from `car.chassis` position to centroid.
- Spawn: nodes placed at `spawn + (gene.x, gene.y)`; wheels at their mount node.
- Fitness, distance/time modes, time-cap, progress-cull: **untouched**.

## 🔁 GA (`ga.ts`, `genome.ts`)

- **Crossover** — uniform per gene/slot, exactly as today (fixed length preserved).
- **Mutation** — jitter continuous genes by a fraction of their range; flip `present` toggles for nodes & wheels; jitter signed `motorSpeed` (can cross zero → flips spin direction naturally).
- **Repair guards** (post-crossover & post-mutation): clamp active nodes to ≥3, active wheels to ≥1; ensure every active wheel's `node` points at an active node (re-point to a present node otherwise).
- All draws from the passed `rng` → deterministic.

## 🖥️ Config / schema changes (`schema.ts`)

- **Remove** the two global `motorTorque` / `motorSpeed` sliders (motor is now per-wheel evolved). Old share-links carrying those keys decode-degrade harmlessly (per-field resilience); update `urlKeys.test.ts` / codec tests for the removed leaves.
- Gene ranges live as tunable **constants**, not user sliders (keeps the form uncluttered; honors "everything evolves").
- Everything else in the schema (population, elites, mutation rate, track lifespan, mode, goal/time, terrain, rubble, roughness, progress cull, speed, palette, seed) is **unchanged**.
- *(Backlog candidate: a single "Motor power" macro slider that scales all evolved torques — deferred.)*

## 🎨 Rendering (`render.ts`)

Skeletal, matching the brainstorm mockups:
- **Members:** stiff (above a threshold) → straight bar in chassis color; springy → drawn as a coil (zigzag polyline) in an accent tint. Stiffness drives the look so the suspension reads visually.
- **Nodes:** small filled dots.
- **Wheels:** spoked circles as today (spokes convey spin/direction).
- Palette reused; add one accent color for springs (or derive from chassis).

## ✅ Testing (anti-regression)

- `triangulate.test.ts` — known point sets → expected triangle edge sets; collinear fallback → chain; determinism (same points → same edges).
- `genome.test.ts` — node/wheel counts land in 3–7 / 1–6; crossover stays fixed-length; mutation respects ranges and guards (≥3 nodes, ≥1 wheel, wheel→present-node); signed motorSpeed can go negative; **determinism** (same seed → identical genome).
- `car.test.ts` — buildCar creates one body per active node, one joint per Delaunay edge, one body per active wheel; centroid helper.
- `ga.test.ts` — population evolves; elitism preserves champion; deterministic run.
- Codec tests updated for removed motor leaves; round-trip + resilience still green.

## 🚫 Out of scope

- Articulated/multi-body *beyond* the spring truss (e.g. powered hinges as a separate joint type) — the spring network already gives articulation.
- Solid colliding struts (option B) — rejected for cost.
- `carType` selector / keeping the old genome — rejected (full replace).
- Motor-power macro slider — backlog.

## 📂 Touch list

```
new:     triangulate.ts (+test)
rewrite: genome.ts (+test), car.ts (+test), render.ts
edit:    physics.ts (createDistanceJoint), ga.ts (+test), schema.ts,
         index.ts (centroid tracking), urlKeys/codec tests
keep:    terrain.ts, rubble.ts, presets.ts, palette.ts,
         fitness.ts (pure — fed centroid-derived distance, unchanged)
```
