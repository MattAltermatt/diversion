# Flock vs Hunter — design spec (#159)

**Status:** approved for implementation · **Date:** 2026-06-30 · **Size:** M
**Branch:** `feature/flock-vs-hunter`

A co-evolution diversion: a shimmering flock of boids and a handful of predators,
**both sides evolving simultaneously** by a small float-gene genetic algorithm. Same
Red-Queen arms-race payoff as the Pursuit-Evasion Arena (#158), but with a handful
of legible genes per side instead of neural nets — evolution is cheap, fast, and you
can *watch* the herd behavior change between generations. The prettiest piece of the
co-evolution slate (#158–#164); reuses the BoxCar2D GA machinery.

This spec is the synthesis of three competing design agents (continuous-evolution,
discrete-generation, and an adversarial determinism/perf/framework-fit review).

---

## 1. The chosen architecture (the load-bearing decision)

**Discrete generations with _persistent bodies_.** Fixed-length rounds give a legible
"Generation N / survivors %" beat *and* clean single-round fitness attribution — while
positions/velocities carry across the generation boundary so the flock **never blinks**
(the zen screensaver invariant).

Why this over the alternatives:

- **vs. continuous / rolling evolution:** rolling respawn has no legible generation
  beat, and — fatally — scores genomes over wildly variable short lifetimes (a boid that
  spawns in a lull and dies unthreatened scores as a "great survivor"), which drifts the
  population to a bland local optimum where the visible arms race *flatlines*. Full-round
  scoring avoids this entirely.
- **vs. discrete-with-crossfade-over-reset:** resetting positions every round reads as a
  page-reload glitch; a crossfade over a teleport is just "a dissolve between two
  glitches." Persisting bodies dissolves the objection at the source — and is *simpler*
  and *more deterministic* than a crossfade (gen N's fitness is a clean function of
  exactly one round of fixed-step sim).

### Generation turnover, precisely

At a round boundary:
1. Score each genome over the round just completed (§4).
2. `breedGeneration` both populations (flock, predators) → next-gen genome pools (§5).
3. **Survivors keep their body** (x/y/vx/vy untouched); their genome slot is overwritten
   in place with the bred child.
4. **Dead slots** (boids caught during the round) respawn by fading in at the flock
   centroid with the flock's average velocity — so they *melt into* the murmuration
   rather than popping in isolated. Only the caught fraction ever re-appears; the bulk of
   the flock is spatially continuous across the boundary.
5. An optional **gene-lerp morph** (`morphSeconds`, ~0.8s default): during the morph
   window a boid steers from a genome lerped old→new (`smootherstep`), so behavior eases
   in instead of snapping. Free for elites (prev ≈ new). Purely cosmetic — read from
   genomes, never draws RNG, never touched by fitness → cannot perturb determinism.

The **mid-round catch model** follows the issue author's intent ("prey respawn *next
gen*"): a caught boid is **removed for the rest of the round** (it is dead), making
`survivors %` a real, monotonically-meaningful scoreboard and the thinning-under-pressure
visible. The flock refills at the generation boundary (step 4). Round length is short
(~22s) and catch rate bounded, so the flock stays dense enough to read as a body.

### Stance isolation (keeps a future A/B cheap)

The entire deterministic core (`genome`, `ga`, `spatialHash`, `steering`, `fitness`,
`render`, `schema`) is **stance-agnostic**. The only stance-specific logic is the
**round scheduler** (when a genome's score is final + how the transition looks), which
lives in one place (`sim.ts`'s `endRound`/`installGeneration`). A rolling-evolution
variant later would swap only that logic — the other ~900 lines are shared.

---

## 2. Determinism blueprint (the keystone)

**Invariant:** the sim's entire state sequence is a pure function of `(seed, config)`.
A share-link URL replays the arms race identically — per-tick predator lunges and
40-generations-deep gene bars alike.

### Fixed timestep is MANDATORY

`dt` from the animation loop is **real wall-clock elapsed, clamped to 50ms**
(`useAnimationLoop.ts`) — *not* fixed. Any physics scaled by `dt` diverges run-to-run
and screen-to-screen, forking the *evolutionary trajectory* (GA fitness comes from
positions). Copy BoxCar2D's proven stance exactly:

```ts
frame(state, ctx, _t, _dt) {          // _dt deliberately UNUSED for the sim
  const steps = Math.max(1, state.cfg.speed)   // integer, config-only
  for (let i = 0; i < steps; i++) stepSim(state) // each tick = 1/60 s of constant DT
  renderScene(ctx, state)
}
```

- `stepSim` integrates with a compile-time constant `const DT = 1 / 60`. **Never** the
  loop `dt`.
- **No `dt` accumulator either** — an `acc += dt; while (acc >= DT)` loop makes the
  step-count-per-frame fps-dependent, desyncing the determinism test. Fixed-steps-per-
  frame keeps the sim clock a pure function of frame count.
- The `speed` slider (1–4) is a **sim-rate** knob (more ticks/frame), never a time knob;
  the same total tick count yields identical state (BoxCar2D's guarantee).
- `frame`'s `t` arg is render-only (e.g. HUD shimmer), never a sim input.

### Named RNG sub-streams

Derive three named streams from the seed via XOR salts (flow-field's pattern), stored on
`state`:

```ts
const rngSpawn = mulberry32((seed ^ 0x1a2b3c4d) >>> 0)  // initial positions + gen-0 genomes + dead-slot respawn
const rngEvo   = mulberry32((seed ^ 0x9e3779b9) >>> 0)  // roulette + crossover + mutate + immigration, ALL gens
const rngTick  = mulberry32((seed ^ 0x517cc1b7) >>> 0)  // reserved for optional per-tick jitter only
```

Stream separation means a later per-tick draw can't shift the GA's reproducibility, and
spawn-draw-count changes can't shift evolution. Per-tick seeded draws are safe *because
the state gating them is itself deterministic*; the only real danger is a **non-seeded**
source. Steering is deterministic from positions (no RNG in the hot loop by default).

### Nondeterminism trap rules

- `Math.random()` / `Date.now()` / `performance.now()` — **banned** in sim/genome/ga.
  Sim time = `tickCount * DT`. (The framework's fresh-load randomize picking a *new seed*
  on a bare URL is the sole allowed `Math.random`, and that seed then flows in.)
- **Never iterate a `Set`/`Map`** to drive sim math. Boids live in fixed `Float32Array`s
  indexed `0..N-1`; iterate by index.
- **Spatial-hash order:** refill buckets by iterating boids `0..N` in order → bucket
  contents are ascending-index by construction; gather + sum neighbor forces in that fixed
  order (float non-associativity is fine when order is deterministic).
- **Tie-breaks** (e.g. "nearest straggler"): break by lowest boid index.
- **Fixed virtual world** (§3) — the viewport `w/h` are NOT URL-encoded, so a
  size-dependent sim would fork per screen. Simulate in constant world units.

### Determinism test (mirrors BoxCar2D)

Expose `state.gen1Elite?` / `state.gen3Elite?` (flock + predator elite genomes captured
at generation boundaries). Test: `setup(seed, cfg)`, run K fixed steps, snapshot a hash
of all positions/velocities/genomes; repeat; `expect(a).toEqual(b)` — bit-identical.
Plus a framework-level codec round-trip so the URL carrying `seed` survives.

---

## 3. Framework-fit & performance

**`kind: '2d'`** — unambiguous. Dense 2D flocking with soft alpha trails and ~245
sprites; no per-pixel field or fragment work to justify WebGL. `'2d'` gets DPR scaling
for free (draw in CSS px).

### Fixed virtual world

Simulate in constant `WORLD_W = 1600, WORLD_H = 900` world units; boids **wrap
toroidally** (no walls to pile against — vital for an unattended screensaver). Render maps
world→canvas with a **cover-fit** transform computed from CSS size, cached, recomputed
only in `resize`. This severs the sim from viewport size (determinism) and keeps density
constant across a phone and a 4K monitor — only the crop/scale changes.

### Spatial hash — zero per-frame allocation

Boid↔boid neighbor queries are the only thing needing the hash (predators are few → brute-
forced against boids: `4 × 240 ≈ 1000` checks/tick, trivial; fear is the same). Intrusive
linked list over preallocated typed arrays, rebuilt each tick — **never** `new Map()`:

```ts
head: Int32Array   // length = cellCount, filled -1 each tick (head boid index per cell)
next: Int32Array   // length = N, next[i] = next boid index in i's cell
```

Cell size = the perception radius (~64 world px) → ~25×15 = 375 cells. Rebuild:
`head.fill(-1)`; for `i` in `0..N-1`: `c = cellOf(x,y); next[i] = head[c]; head[c] = i`.
Query = walk the 3×3 cell block following `next` chains (~12 candidates at calm density).
Per-boid neighbor cap (`MAX_NEIGHBORS = 24`, first-24-in-scan-order, deterministic) bounds
a transient dense clump.

### Data layout & render

- **SoA `Float32Array`s:** `posX,posY,velX,velY`, `flockGenes` (N×6), per-boid fitness
  accumulator, `alive: Uint8Array`. Predators the same at their count. Accumulate steering
  into scalar locals — **no** temp object/array per boid; **no** `.map/.filter/.forEach`
  closures in `stepSim` (the repo's perf-analyzer flags per-frame allocation/GC).
- **Trails = whole-canvas alpha fade** (flow-field idiom): one translucent
  `fillRect(0,0,w,h)` in the bg color per frame, then draw each boid as a small triangle/
  dot. **No** per-boid position-history arrays. A `trailFade` slider drives the rect alpha.
- Don't read `canvas.width`/`offsetWidth` in `frame` (layout thrash); use the cached
  transform.

**Target counts (calm ethos):** default **240 boids, 4 predators, speed 1** — dense,
pretty, comfortably 60fps. Ranges give room (80–400 boids, 1–8 predators).

### setup / frame / update / resize / teardown

- **`setup(ctx, cfg, size)`** → build the three RNG streams from `cfg.seed`; allocate SoA
  + hash arrays for `cfg.boidCount`/`cfg.predatorCount`; gen-0 genomes + world-space
  positions from `rngSpawn`; cache the world→screen transform; paint bg once.
- **`frame`** → fixed-steps loop (§2) + `renderScene`.
- **`resize(state, size, ctx)`** → recompute + cache the fit transform only; repaint bg so
  the resized backing store doesn't flash. Sim untouched (world is fixed).
- **`update(state, cfg, size)`** → **live (return true):** `trailFade`, colors/palette,
  `speed`, `showHud`, `morphSeconds`, and the evolutionary knobs (mutation rates, elite
  counts, gene bounds, round length, immigration) — mutate `state.cfg`; they take effect at
  the next breed, no realloc. **Structural (return false → re-setup):** `seed`,
  `boidCount`, `predatorCount` (resize arrays / reseed streams).
- **`teardown`** → null large arrays for GC hygiene (nothing GPU in 2D).

---

## 4. Sim tick & fitness

One `stepSim(state)`:

1. **Rebuild spatial hash** (boids only).
2. **Flock steering** — per alive boid, over neighbors within perception radius:
   - `separation` = Σ `normalize(p−q)/dist²` over close neighbors × `separationW`
   - `alignment` = `normalize(avgNeighborVel − vel)` × `alignmentW`
   - `cohesion`  = `normalize(avgNeighborPos − pos)` × `cohesionW`
   - `fear`      = Σ over predators within `fearRadius`: `normalize(p−pred)·(1 − d/fearRadius)`
     × `fearW` (inverse falloff — far predators barely tug; `fearW` range runs high so it
     can dominate → real scatter)
   - `accel = sep+ali+coh+fear`, clamp to `maxForce`; `vel += accel·DT`; clamp `|vel|` to
     `maxSpeed`; `pos += vel·DT`; toroidal wrap.
3. **Predator hunt** — per predator:
   - **target:** if `fixation` high and current target alive, keep it; else re-pick nearest
     (probabilistically re-target with prob `1 − fixation`). Tie-break by lowest index.
   - **aim** = `target.pos + target.vel · leadFactor · estTimeToReach` (lead the target).
   - steer toward aim; if `dist < lungeThreshold`, **lunge**: speed cap =
     `maxSpeed · staminaBurst` for a lunge window (~0.8s), then a fatigue cooldown clamps to
     `maxSpeed·0.7` (stamina is a spend-and-recover resource — no permanent rockets; gives
     the flock a real escape window).
4. **Catch resolution** — for each predator, boids within `catchRadius` (~boid size): mark
   the boid **dead** (removed for the round), `predator.kills++`.
5. **Fitness accrual + `tickCount++`.**

**Fitness (read at breed time):**
- **Flock boid** = `survivalTime / roundLength` (fraction of the round alive; a full
  survivor = 1.0). Optionally weight by *exposure* (ticks spent within a predator's
  `fearRadius`) so surviving *danger* beats idling safely — a cheap noise-reducer.
- **Predator** = `kills` this round. `roulettePick`'s `EPS` floor already keeps a
  zero-kill predator from vanishing; a small proximity integral
  (`Σ 1/(1+nearestPreyDist)`) can be added if 3–4 predators tie too often (a tiny-population
  robustness measure).

---

## 5. Genome & GA

No topology, no epistasis → **plain uniform per-gene crossover is correct and sufficient**
(BoxCar2D's subassembly/Delaunay/`repair` machinery exists only for its truss and is
unnecessary here). Reuse `roulettePick` + `breedGeneration` (`Scored { genome, fitness }`
is already generic) with `Genome = Float32Array`.

```ts
interface GeneSpec { key: string; min: number; max: number }

const FLOCK_SPEC: GeneSpec[] = [
  { key: 'separationW', min: 0,  max: 3   },
  { key: 'alignmentW',  min: 0,  max: 3   },
  { key: 'cohesionW',   min: 0,  max: 3   },
  { key: 'fearW',       min: 0,  max: 6   },   // can dominate → visible balling/scatter
  { key: 'fearRadius',  min: 20, max: 200 },   // world units
  { key: 'maxSpeed',    min: 40, max: 160 },   // world units / second
]
const PRED_SPEC: GeneSpec[] = [
  { key: 'lungeThreshold', min: 20, max: 160 },
  { key: 'leadFactor',     min: 0,  max: 1.5 },  // aim ahead along target velocity
  { key: 'fixation',       min: 0,  max: 1   },  // commit vs re-pick nearest
  { key: 'maxSpeed',       min: 50, max: 200 },  // ≥ flock ceiling so catches are possible
  { key: 'staminaBurst',   min: 1,  max: 2.5 },  // lunge multiplier, stamina-limited
]

type Genome = Float32Array   // length = spec.length
randomGenome(spec, rng)      // g[i] = lerp(min,max, rng())  — FIXED order
crossover(a, b, rng)         // c[i] = rng() < 0.5 ? a[i] : b[i]  — one draw/gene, fixed order
mutate(g, rate, rng, spec)   // rng()<rate ? clamp(g[i] + (rng()*2−1)*(max−min)*0.25, min,max) : g[i]
```

No `repair` (clamping in `mutate` keeps genes in range). **Two independent populations**,
two `breedGeneration` calls (flock then predator, fixed order on `rngEvo`), two specs.

**Informed priors (optional, à la BoxCar2D `skewHi/skewLo`):** skew gen-0 flock
`cohesionW/separationW` toward the middle so the opening looks flock-like (not a gas), and
gen-0 predator `leadFactor` low so early hunters visibly *improve* their intercepts.
Mutation still roams the full range → "everything evolvable" holds.

**Anti-stagnation (keeps an all-night run alive):**
1. **Mutation annealing** — reuse BoxCar2D's `annealedRate(peak, gen)`: mutation rates are
   gen-1 peaks cooling to ~25% over ~8 gens (wide early search, fine-tuning later).
2. **Immigration** (`immigrateEvery`, default 6): every N gens, replace the weakest ~10% of
   each population with `randomGenome` — the primary anti-convergence guard (a co-evolving
   GA can otherwise settle to a static fixed point by 3am). Deterministic (seeded), so the
   URL still replays exactly.
3. **Deterministic "seasons"** — a very slow sine on the predators' effective `maxSpeed`
   cap (±10% over ~3 min, derived from `tickCount`, *not* RNG/config) periodically tips
   advantage between hunter and hunted so the trend arrows keep reversing. Exogenous +
   deterministic (echoes BoxCar2D's anneal-by-counter).

Red-Queen coupling does most of the work by construction: every prey improvement degrades
predator fitness, re-applying selection — a stable equilibrium is unlikely, and any
flock monoculture is self-punishing (predators specialize to beat it).

---

## 6. Schema (calm defaults, unique flat leaf keys)

Single Zod schema = form + URL codec + `Config` type. Defaults sit at the calm end. Flat
leaf keys are globally unique (`flockMutationRate`/`predMutationRate`,
`flockElites`/`predElites`) so the URL codec never falls to a dotted-path key
(`urlKeys.test.ts` guard). All sliders have bounds (invariant 4); every field has `help`
(invariants 2/3); predator is bold against near-black (invariant 5).

Fields (section · ui · range · default):

- **Ecosystem:** `boidCount` (slider 80–400, **240**, structural), `predatorCount`
  (slider 1–8, **4**, structural)
- **Evolution:** `roundLength` s (slider 12–45, **22**), `morphSeconds` (slider 0–2.5,
  **0.8**), `flockMutationRate` (slider 0–1, **0.12**), `predMutationRate` (0–1, **0.15**),
  `flockElites` (0–20, **6**), `predElites` (0–4, **1**), `immigrateEvery`
  (0–20, **6**, 0 = off), `seasons` (toggle, **on**). Selection is roulette
  (`breedGeneration` reused verbatim — no extra knob).
- **Look:** `trailFade` (slider 0–0.6, **0.12**), `flockColors` (colorList 1–6 cool/soft,
  speed-tinted), `predatorColor` (color, **#ff3b30**), `background` (color, **#05070d**),
  `showHud` (toggle, **on**)
- **Motion:** `speed` (slider 1–4, **1** — visual fast-forward; never changes outcome)
- **Advanced:** `seed` (number, randomize-on-fresh-load)

**Preset groups** (declared data — `PresetGroup[]`, two independent axes):
- **Dynamics:** `Calm Murmuration` (default) · `Predator Pressure` (more/faster hunters) ·
  `Skittish Flock` (high fear, few hunters)
- **Palette:** `Ice & Ember` (default) · `Ink` (mono + white hunter) · `Aurora`
  (green-cyan flock / magenta hunter). Each patches `flockColors`+`predatorColor`+
  `background` (top-level spread → supply the group whole).

---

## 7. Render & HUD (legibility, invariant #1)

- **Boids:** small triangles oriented to velocity, tinted across `flockColors` by current
  speed. Predators: bold `predatorColor`, slightly larger. Soft trails from the alpha fade.
- **HUD (`showHud`, top-left, small):**
  - **Generation N** + a thin round-progress ring filling over `roundLength`; a soft pulse
    at rollover (synced to the morph) — the beat you can count.
  - **survivors %** — live fraction of the flock not yet caught this round (the headline
    arms-race number).
  - **Gene bars** — flock (`Sep Ali Coh Fear FearR Spd`) and hunter
    (`Lunge Lead Fix Spd Burst`), each normalized to its spec range, drawn with a **faint
    ghost** of last generation's value so the eye reads the *delta* (Lead creeps up as
    hunters learn to aim ahead; FearR/Sep climb as the flock balls tighter in response).
  - **Survival sparkline** (last ~24 gens) — the money graph: a healthy arms race makes it
    *oscillate*; a converged/static run makes it *flatline* (an at-a-glance health read).

The arms race is also legible without the HUD: selfish-herd = a tight ball with predators
skimming the edge; flash-expansion = sudden blooms when a predator lunges. The HUD
annotates what the motion already shows.

---

## 8. Module breakdown

Under `src/diversions/flock-vs-hunter/`:

```text
genome.ts       GeneSpec, FLOCK_SPEC/PRED_SPEC, randomGenome/crossover/mutate, decode helper
ga.ts           roulettePick + breedGeneration (generic Scored<Float32Array>) + annealedRate
spatialHash.ts  Int32Array head/next intrusive grid: rebuild + 3×3 neighbor query
steering.ts     pure per-tick flock + predator steering (writes vel, integrates pos)
sim.ts          Ecosystem state, stepSim, the round scheduler (endRound/installGeneration),
                fitness accrual, anti-stagnation (immigration/anneal/seasons)  ← stance-specific glue lives here
render.ts       alpha-fade trails + boid/predator sprites + HUD (bars, ghosts, sparkline)
schema.ts       the single Zod schema
presets.ts      PresetGroup[] — Dynamics + Palette
index.ts        defineDiversion wiring (setup/frame/update/resize/teardown/presets)
+ *.test.ts     co-located anti-regression suites
```

`sim.ts` holds the scheduler deliberately, isolated from `index.ts`, so the round-boundary
+ determinism logic is unit-testable without a canvas.

---

## 9. Test plan (anti-regression must-haves)

- **`sim.test.ts` — determinism keystone (non-negotiable):** same `(seed, config)` → run
  600 fixed ticks twice → identical hash of positions+velocities+genomes; repeat at 3600
  ticks (exercises many catches + several generation boundaries + immigration). Plus the
  **population invariant** (survivors persist across a boundary; dead slots refill to
  exactly `boidCount`) and **round-boundary timing** (breed fires at `roundLength*60`
  steps, off-by-one guarded).
- **`spatialHash.test.ts`:** `neighborsWithin(x,y,r)` == brute-force O(n²) set for seeded
  random point clouds (guards the perf structure against silently dropping neighbors).
- **`ga.test.ts`:** same `(scored, rng)` → identical bred pool; elite slice copied verbatim
  (unmutated); output length == input length; empty/singleton pool doesn't throw.
- **`genome.test.ts`:** `randomGenome` genes ∈ range; `mutate` clamps to range at rate=1;
  `crossover` child gene ∈ {a[i], b[i]}; all deterministic for a fixed rng.
- **codec / urlKeys:** leans on the framework's existing `urlKeys.test.ts` +
  round-trip/resilience guards — the schema just needs globally-unique leaf names (it does).

---

## 10. Honest risks & mitigations

- **Selfish-herd emergence may read as subtle weight drift rather than dramatic balling.**
  `fearW` range runs high (0–6, dominant) so when it wins the flock *visibly* balls;
  flash-expansion is emergent from separation spiking when a predator enters. If Chrome
  verify shows it's too subtle, the fix is a **tuning pass on ranges** (asked, not
  unilateral — gameplay-tuning is sacrosanct), not an architecture change.
- **Tiny predator population = noisy/slow selection.** Continuous proximity fitness +
  `predElites` + slightly-hotter `predMutationRate` + immigration keep it rankable; a few
  apex predators evolving slower than the flock happens to read as *realistic*.
- **Rounds could feel metronomic over hours.** Anneal + immigration + seasons keep the
  *content* fresh even with a regular beat; the sparkline is the built-in monitor. (A
  dynamic round-end trigger — end on survival-threshold OR time-cap — is a noted backlog
  polish, deferred to keep v1's density constant and its determinism simple.)
- **Determinism is harder than a lockstep GA** because catches are data-dependent. Fixed
  timestep + forked sub-streams + fixed-index arrays (no order-dependent containers) make
  it fully reproducible; the pinned-hash test is the guard. BoxCar2D already proves an
  event-driven GA can be URL-reproducible.
```
