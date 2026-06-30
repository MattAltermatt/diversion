# BoxCar2D — diversion design (issue #153)

**Status:** approved (brainstorm Q&A, user-decided) · **Date:** 2026-06-30
**Family:** evolutionary physics / genetic algorithm · **kind:** `2d` (rigid-body physics) · **complexity:** hard

A clean-room remake of **[BoxCar2D](http://boxcar2d.com/)** as an ambient diversion: a population of
random 2D cars — a star-convex polygon chassis with motorized wheels — is dropped one at a time onto a
procedurally-generated hilly track. Each car drives until it stalls/flips/times out; **fitness =
distance travelled**. A genetic algorithm (elitism + roulette selection + uniform crossover +
mutation) breeds the next generation, and over many generations the cars visibly evolve from flailing
wrecks into competent hill-climbers. The irresistible "watch dumb things get smart" appeal as a
self-running, deterministic, shareable screensaver.

> Credit: original BoxCar2D by Rafael Matsunaga (boxcar2d.com), itself inspired by Qubit's "HTML5
> Genetic Cars". Clean-room reimplementation; credit in `description` + a source comment.

---

## 1. The load-bearing decision: physics engine

**Engine: `phaser-box2d` (Box2D v3.0, used STANDALONE — without Phaser).**

Decided by the user after a 3-agent feasibility duel (planck.js v2.4 / phaser-box2d v3 / box2d-wasm v2.4),
each grounded in the *actual* framework contract + the user's own `asteroid-miner` integration. All three
scored 5/5 feasible; the choice is a DX/quality tradeoff, not a gamble.

**Why phaser-box2d:**
- **Box2D v3** — newest "soft-step" (TGS-Soft) solver: better joint/contact stability, which matters
  during the chaotic early generations of flailing cars (less jitter/explosion).
- **Purpose-built `CreateWheelJoint`** (motor + suspension spring in one) = the canonical BoxCar2D
  wheel. (Matter.js — tried in `asteroid-miner` and abandoned — fakes wheels with soft springs that
  wobble; this is exactly the failure being avoided.)
- **Battle-tested in the user's own repo.** `asteroid-miner/src/physics.ts` already runs the full
  world/body/step/joint lifecycle standalone — we copy ~80% of that seam. Proven Phaser-free
  (zero Phaser imports; runs in Node tests), pure JS (no WASM/async), no `Math.random` (deterministic).

**Integration facts (verified against the real codebase):**
- The diversion `setup(ctx, config, size): State` is **synchronous** (`framework/types.ts`); phaser-box2d
  imports + initializes synchronously, so there's no async-vs-sync-contract fight (the thing that would
  have made box2d-wasm awkward). `ctx` for `kind:'2d'` is a DPR-scaled `CanvasRenderingContext2D` — we
  draw everything ourselves; the engine only simulates.
- **Import path wrinkle:** the package has a broken `main` / no `exports` map — import the explicit
  deep path `phaser-box2d/dist/PhaserBox2D.js` (exactly as `asteroid-miner` does). Confirmed to work
  under Vite with no `optimizeDeps` config.
- **Untyped JS** — wrap the loose API behind a thin typed seam module (`physics.ts`), aliasing opaque
  handles (`type WorldId = ...`, etc.), so `any` never leaks into the diversion. ~copyable from
  `asteroid-miner`. Watch the documented `instanceof b2Vec2` trap (a plain `{x,y}` silently builds a
  degenerate shape) — the typed seam guards it.
- **API style:** Box2D v3 is a flat C-handle API (`CreateWorld() → worldId`, `b2Body_GetPosition(id)`,
  `WorldStep({ worldId, deltaTime })`), not the OO v2.4 style.

**Backlog (not now):** none re: engine; `box2d-wasm` (best cross-machine determinism) and `planck.js`
(first-party types) were the runners-up if v3 ever disappoints.

---

## 2. Determinism (the URL-codec keystone)

The project's keystone is the URL codec: a `seed` in the URL must reproduce the run. Design:

- **All randomness flows through `framework/rng.ts` (`mulberry32(seed)`)** — track generation, all
  genomes, crossover parent selection, and mutation. Box2D contributes **zero** randomness (no internal
  RNG).
- **Fixed timestep.** rAF `dt` (clamped ≤50 ms by `useAnimationLoop`) feeds an accumulator;
  physics steps in fixed `1/60 s` slices. Each car simulates a **fixed step budget** (e.g. max sim-seconds
  → fixed step count) so its fitness is independent of render speed/frame rate.
- **Speed = render fast-forward only.** The `speed` knob runs N fixed steps per frame; it changes how
  fast you *watch*, never the simulation outcome → determinism preserved.
- **Determinism is same-build.** phaser-box2d (pure-JS doubles) is reproducible for a given deployed
  bundle — which is all the seed-link keystone needs (everyone hits the same GH-Pages build). Pin the
  package version; document that a major engine bump can shift trajectories. (No cross-CPU guarantee,
  but that's irrelevant for a screensaver.)
- **Headless determinism test** (the keystone analog): a Vitest builds a world from `mulberry32(seed)`,
  steps N times twice, asserts identical final positions / fitness. phaser-box2d needs no canvas/DOM,
  so it runs in the existing jsdom test env.

---

## 3. Simulation structure

**Presentation: SOLO RUNS to start (B).** One car at a time runs the track; watch it, record its
fitness, next car. Clearer fitness, simpler to get right, and a quiet zen charm (one little car
trying its best). The iconic **simultaneous shared-track pack (A) is a backlog upgrade** — it reuses
the entire solo foundation and only adds simultaneous rendering + non-colliding collision filtering
(shared negative `groupIndex`).

**Terrain lifecycle: FIXED for the whole run.** One track per seed, held constant across *all*
generations (and obviously all cars within a generation — required for fair fitness). You watch the
lineage master the *same* hills gen over gen — that constancy is what makes "they're getting better"
legible. A new seed (auto every M generations, or manual reseed) = a fresh track. Faithful to the
original (fixed track per evolution session).

- **Track:** a seed-driven polyline (rolling hills), built as static terrain. Implementation: prefer
  per-segment edge shapes for the ground (avoids the b2Vec2-array buffer dance of a chain shape).

---

## 4. Genome (the GA unit + render source)

**Fixed-length genome (~17 genes)** so crossover is trivial (no variable-length splicing):

```text
Chassis — star-convex polygon, always valid (no self-intersection):
  • 8 vertices at evenly-spaced angles (0°,45°,…,315°)
  • per vertex: 1 evolved MAGNITUDE (distance from center)      → 8 genes
  • 1 evolved chassis DENSITY (mass)                            → 1 gene

Wheels — 2 slots (yields the classic 1- and 2-wheel cars):
  • per slot: PRESENT? (bool) · mount VERTEX (0–7) · RADIUS · DENSITY  → 8 genes

Motor — GLOBAL, FIXED (not evolved), exposed as a tunable knob:
  • maxTorque, motorSpeed, drive direction = forward
  • Rationale: evolving motor power is degenerate ("more power always wins" →
    every car pins to max). Fixing it makes evolution optimize SHAPE + WHEELS.
```

- **Crossover:** uniform per-gene (or single-point) between two parents.
- **Mutation:** jitter each gene with probability `mutationRate`; bools flip.
- Gene numeric **ranges** (magnitude min/max, radius range, density range) are 🎚️ tunable — sane
  defaults set at build, tuned in Chrome. Structure (which genes exist, fixed length) is the
  load-bearing seam and is locked here.

**Backlog richness:** variable wheel count (3+), evolved motor, asymmetric/evolved chassis angles.

---

## 5. Evolution loop

```text
PER CAR (solo, on the fixed track):
  Runs until ONE of:
    • stalled  — no forward progress for ~3 s (stuck / flipped / high-centered)
    • timeout  — hard cap ~20 sim-seconds
    • reaches the end of the track
  FITNESS = furthest horizontal distance reached (max x).

PER GENERATION (after all N cars have run):
  • ELITISM: top E cars copied UNCHANGED into the next gen → never lose the
    champion (prevents regression; makes "gen 40 > gen 1" reliably visible).
  • Remainder: ROULETTE-WHEEL selection (fitness-proportional) picks 2 parents
    → uniform per-gene crossover → per-gene mutation (prob = mutationRate).
  • Repeat forever. Track regenerates every M generations (or manual reseed).
```

Faithful BoxCar2D / HTML5-genetic-cars recipe. Tunable 🎚️ (sane defaults, tune in Chrome): `N`
(population), `E` (elite), `mutationRate`, per-car `timeout`, `M` (track lifespan).

---

## 6. Presentation & UX

**Visual style — crisp modern vector:**
- Chassis: filled polygon (palette color) + subtle outline.
- Wheels: filled circles **with a hub spoke/radius line** so rotation is visible (a plain circle hides
  spinning — UX invariant #1 readability).
- Terrain: solid ground fill below the hill line, strong contrast vs sky.
- Background: soft vertical sky gradient.
- **Record flag:** a thin vertical marker + small flag at the best-distance line; the current car
  visibly races toward beating it (the "beat the record" tension that keeps solo mode alive).

**Camera:** smooth lerp follow of the current car (continuous follow ⇒ lerp, not fixed tween),
framed to show car + a bit of upcoming terrain. No jitter.

**HUD (discoverable, high-contrast, toggle via `showHud`):** Generation # · Car `i / N` · current
Distance · Best (record). Small, fixed corner, persistent — not buried, not in the way.

**Zen / speed:** `speed` knob = physics steps per frame (visual fast-forward) so evolution is
perceptible at a calm pace. Default to the calm end per the gallery's zen ethos, but fast enough to
see a few generations in a sitting.

**Presets (two independent framework-native groups):**
- **Palette:** Dusk / Blueprint / Meadow (chassis · wheel · terrain · sky)
- **Terrain feel:** Gentle / Rolling / Rugged (roughness)

Honors all five UX invariants: readable (spinning wheels + HUD), discoverable (toggle + presets),
help text where effects aren't obvious, sliders only where bounded, high contrast.

---

## 7. Schema (single source of truth — drives form + URL codec + Config type)

One Zod schema, each field `.meta({ ui, label, help, min, max, step, options })`. Sketch (final
field set + ranges settled in implementation; numbers are 🎚️ tunable):

```text
seed            number  (URL-reproducible run; the keystone)
population N    number  slider [bounded]   — cars per generation
eliteCount E    number  slider [bounded]   — champions carried over
mutationRate    number  slider 0..1
carTimeout      number  slider [bounded]   — max sim-seconds per car
trackLifespan M number  slider [bounded]   — generations before new track
roughness       number  slider [bounded]   — terrain hilliness
speed           number  slider [bounded]   — steps/frame (visual fast-forward)
showHud         boolean toggle
motorTorque     number  slider [bounded]   🎚️ — global drive (tuning-gated)
motorSpeed      number  slider [bounded]   🎚️ — global wheel rad/s (tuning-gated)
color (group)   { chassis, wheel, terrain, sky } palette
```

Presets patch these via `PresetGroup<Config>` (palette group, terrain-feel group).

---

## 8. Architecture / file layout

Auto-discovered via `import.meta.glob('../diversions/*/index.ts')` — a new folder registers itself.

```text
src/diversions/boxcar2d/
  index.ts        defineDiversion: id/title/description/kind:'2d'/schema/setup/frame/update/teardown
  physics.ts      typed seam over phaser-box2d (world/body/wheel-joint/step/destroy) — ~from asteroid-miner
  genome.ts       genome type, random genome, crossover, mutation (pure, rng-driven)
  ga.ts           generation lifecycle: run-a-car, fitness, selection, breed (pure where possible)
  terrain.ts      seed-driven polyline hills → static terrain bodies
  render.ts       draw chassis/wheels(+spoke)/terrain/sky/flag/HUD to the 2D ctx
  schema.ts       Zod schema (single source of truth) + Config type
  palette.ts      preset palettes
  presets.ts      PresetGroup declarations (palette, terrain-feel)
  *.test.ts       co-located unit tests
```

**Lifecycle discipline (load-bearing for a long-running screensaver):**
- `setup` builds the world + terrain + first generation, synchronously.
- `frame` runs the fixed-step accumulator, advances the current car / generation state machine, renders.
- `update` live-applies visual/tunable config (palette, speed, showHud, motor) without a rebuild;
  returns false for structural changes (seed, population) so the host re-runs `setup`.
- `teardown` **must destroy every Box2D body + the world** (and reset phaser-box2d's global
  `SetWorldScale` state) — gallery navigation + reseeds rebuild worlds repeatedly; leaks → eventual
  OOM over hours. Mirror `asteroid-miner`'s world-map teardown discipline.

---

## 9. Testing (anti-regression must-haves)

- **Determinism keystone:** same seed → identical fitness/positions across two headless runs.
- **Codec round-trip + per-field resilience** (inherited framework guarantee; ensure new fields encode).
- **Genome purity:** crossover/mutation are deterministic given an rng; produce valid fixed-length genomes.
- **GA correctness:** elitism preserves the champion; selection is fitness-weighted.
- **Schema/control selection** from schema (framework sweep tests pick it up).
- **Teardown leak check:** a heapsnapshot over ~50 generations during Chrome verify (manual gate).

Visual quality (does it look like cars learning to drive? wheels visibly spin? camera calm?) verifies
in **Chrome** (chrome-devtools MCP), port **5180**.

---

## 10. Tuning gate reminder

Per project convention, **gameplay-tuning numbers are sacrosanct** — `motorTorque`, `motorSpeed`,
`mutationRate`, gene ranges, gravity, fitness weighting etc. get sane defaults now; any *balance*
change during verify needs an explicit ask. Mechanism fixes (missing teardown, wrong joint, NaN
guard, camera lerp) ship without asking.

---

## Backlog (filed for later, out of scope now)

- **Shared-track pack (A)** — whole population races simultaneously, non-colliding group, leader camera.
- **Champion ghost (B)** — translucent replay of the best run racing alongside the current car.
- Variable wheel count (3+), evolved motor, asymmetric chassis angles.
- Lineage/ancestry HUD; fitness-over-generations sparkline.
