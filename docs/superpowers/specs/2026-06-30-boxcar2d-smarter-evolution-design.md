# BoxCar2D — Smarter Evolution Path (design spec)

**Date:** 2026-06-30
**Status:** Approved design → ready for implementation plan
**Issue context:** follows #156 (truss genome). Related: #157 (rubble culling + size/weight rebalance).

## 1. Goal

A viewer watching BoxCar2D should **see a visibly working car by ~generation 10** — in the default *time* mode (goal 500 m), at least one car reliably reaching the goal (or covering most of it), with a clear upward trend across gens 1–10 rather than a flat crawl. Two user directives ride along:

- **"Everything should be evolvable."** Physics traits currently hardcoded identically on every car (suspension, node size/friction) must become genes.
- **"So many cars look the same, even after refreshing."** Raise on-screen variety *within* a run, and stop every page refresh from replaying the byte-identical run.

This is a **screensaver**, not a research optimizer. The target is a *legible learning arc* (junk → competent), **not** maximal optimality — converging by gen 2 would kill the very thing the piece exists to show.

## 2. Grounded diagnosis (measured, not assumed)

A headless measurement pass drove the real `setup`/`frame` over 12 generations across 3 seeds (42, 7, 1234), plus operator micro-experiments on the real `crossover`/`mutate`/`buildCar`. Findings that shaped this design:

```text
finding                                                              verdict
-------------------------------------------------------------------  -----------------
"roulette selection is weak / early landscape is flat"               REFUTED — the launch ramp gives
                                                                      every car ~20–30 m, so roulette
                                                                      has real spread; pressure healthy.
"uniform crossover shreds epistatic building blocks"                 CONFIRMED — strongest operator bug.
                                                                      31/40 crossovers of two decent
                                                                      parents → child worse than BOTH
                                                                      (e.g. 370 m + 254 m → 26 m).
"mutation 0.21 is destructive for exploitation"                      CONFIRMED — 40/40 mutated children
                                                                      of a 504 m elite came back worse.
                                                                      Can't fine-tune, only damage.
"it's effectively random restart"                                    HALF-WRONG — corr(gen,best)=
                                                                      0.85/0.64/0.50, elitism retains the
                                                                      champion verbatim. Shape is
                                                                      plateau → jackpot-jump, not blind.
"the random genome prior is bad"                                     REFUTED — ~1 in 120 random genomes
                                                                      already drives the full 500 m on
                                                                      bare terrain. Good cars ARE reachable.
*** MISSED DOMINANT CAUSE ***                                        🚨 rubbleDensity=1 is a HARD WALL.
                                                                      0/8 cars finish in 12 gens, all 3
                                                                      seeds (cap ~173–255 m). Same GA,
                                                                      rubble OFF → reaches 500 m by gen 7–8.
```

**Implications that drive the design:**
1. The literal reason no working car appears by gen 10 under the default config is **rubble**, not the GA. → Default `rubbleDensity` → 0 (decided by user).
2. The real GA bugs are **crossover** (#1) and **mutation** (#2). Selection is fine. → Fix variation operators; do **not** touch selection.
3. The champion is already retained across generations (deterministic ∞-lifespan track). There is **no cross-generation amnesia** to cure. → A hall-of-fame / MAP-Elites archive solves a problem this piece does not have; **dropped**.

## 3. Design

Five components. Each is independently testable; together they deliver the goal with **zero balance-number changes beyond the (user-approved) rubble default** — annealing reinterprets the existing `mutationRate` rather than changing its default, and subassembly crossover removes the jackpot-dependence that made population 8 feel thin (so `population` stays 8).

### 3.1 Subassembly-aware crossover — `genome.ts`

**Problem fixed:** uniform per-gene `crossover` (the confirmed #1 bug). The truss is brutally epistatic — toggling one node's `present` re-runs the Delaunay triangulation and rewires the entire structure — so picking each scalar gene independently routinely combines incompatible halves.

**New algorithm** (replaces `crossover` in `genome.ts:130-153`). Deterministic, `repair`-compatible, no new rng semantics beyond a fixed call order:

```text
crossover(a, b, rng):
  // Pass 1 — whole-NODE inheritance. Each node slot's ENTIRE record
  // (present,x,y,mass,radius,friction) comes from one parent — never split.
  nodeSrc[i] = rng() < 0.5 ? 'A' : 'B'         for i in 0..MAX_NODES-1
  nodes[i]   = (nodeSrc[i]=='A' ? a : b).nodes[i]    // whole record copy

  // Pass 2 — struts follow an endpoint. A pair (i,j) inherits its
  // stiffness/damping from the LOWER endpoint's node source (reuses nodeSrc,
  // zero extra rng), so a strut's tuning stays coherent with a node it joins.
  pairs[pairIndex(i,j)] = (nodeSrc[min(i,j)]=='A' ? a : b).pairs[pairIndex(i,j)]

  // Pass 3 — wheel SUBASSEMBLY. "The wheel mounted on node i" travels with
  // node i's source parent, so a tuned mount (motor + grip + suspension)
  // survives as ONE unit instead of being reassembled from random slots.
  wheels = []
  for i in 0..MAX_NODES-1 where nodes[i].present:
    src = nodeSrc[i]=='A' ? a : b
    w   = src.wheels.find(w => w.present && w.node === i)
    if w and wheels.length < MAX_WHEELS: wheels.push({ ...w, node: i })

  // Pass 4 — fill remaining wheel slots by a plain per-slot coin flip over the
  // raw parent wheel arrays (keeps wheel-count diversity; gives repair() raw
  // material). repair() then enforces validity (≥3 nodes, ≥1 wheel, 1 wheel/node).
  j = 0
  while wheels.length < MAX_WHEELS:
    wheels.push(rng() < 0.5 ? a.wheels[j] : b.wheels[j]); j++

  return repair({ nodes, pairs, wheels })
```

`repair()` is **unchanged** — it already collapses wheels onto valid nodes and enforces the floors. The total rng-call *count* differs from the old function; nothing downstream depends on call count, only on the shared `mulberry32` stream advancing deterministically (fine for an unreleased genome — see §4).

### 3.2 Annealed mutation — `index.ts` + `genome.ts`

**Problem fixed:** flat `mutationRate` 0.21 applied every generation (confirmed #2 bug). It re-randomizes ~1-in-5 genes even at gen 10, so gains never lock in.

**Mechanism:** the rate decays wide → tight over the first generations, computed exogenously from `(generation, rng)` — **no genome-shape cost** (rejected ES-style self-adaptive sigma genes: they need 50–200+ gens to pay off, fighting the gen-10 deadline).

```text
ANNEAL_GENS           = 8           // internal const (index.ts)
MUTATION_FLOOR_FRAC   = 0.25        // internal const
peak  = cfg.mutationRate                         // the EXISTING 0.21 default, now "gen-1 peak"
floor = peak * MUTATION_FLOOR_FRAC
rate(gen) = lerp(peak, floor, min(1, (gen - 1) / ANNEAL_GENS))
```

`index.ts` computes `rate(generation)` and passes it into `breedGeneration` → `mutate` (it currently passes `cfg.mutationRate` flat at `index.ts:203-207`). Gen-1 stays at 0.21 (chaotic "flailing wrecks" opening beat preserved); by gen ~8 it's ~0.0525 (gentle fine-tuning). **`mutationRate`'s default value does not change** — only its *meaning* shifts to "gen-1 peak," reflected in the slider help text (not a balance change; no sign-off needed).

### 3.3 Widen the genome — "everything evolvable, within sane bounds" — `genome.ts` + `car.ts`

Six constants hardcoded identically on every car in `car.ts:22-34, 91` become genes. **Rule:** for any damping/stability parameter, only widen toward the safe direction (overdamped), never below the pinned anti-jitter floor — those constants were deliberately set to kill wobble/buzz/bounce, and the comments say so.

```text
constant (car.ts)       scope    was (fixed)     becomes gene range    why this band
----------------------  -------  --------------  --------------------  ---------------------------------
node.radius             node     0.10            0.06 .. 0.16          stays < typical node spacing so
                                                                        Delaunay geometry stays sane.
                                                                        render.ts:193 draws a fixed 3.5px
                                                                        dot — zero render blast radius.
node.friction           node     0.5             0.10 .. 1.00          no oscillation risk either end;
                                                                        safe to fully open.
wheel.suspensionHertz   wheel    WHEEL_HERTZ=4   2.5 .. 6              conservative sub-range of truss
                                                                        HERTZ (2..10); wheel buzz reads
                                                                        worse than a stiff strut → narrow.
wheel.suspensionDamping wheel    WHEEL_DAMPING=1 0.85 .. 1.00          FLOOR kept above the historically
                                                                        bouncy 0.7; ceiling at critical.
                                                                        Overdamped = sluggish, never wobbly.
wheel.suspensionAxis    wheel    (0,1) vertical  -0.52 .. 0.52 rad     ±30° rake. axisX=sin θ, axisY=cos θ
                                                                        (auto unit vector; createWheelJoint
                                                                        takes a raw axis). Visible "raked
                                                                        fork" silhouette; beyond ~30° loses
                                                                        vertical compliance → looks broken.
wheel.suspensionTravel  wheel    WHEEL_TRAVEL=.06 0.03 .. 0.14         non-zero floor (zero travel shoves
                                                                        shock into the truss → buzz); modest
                                                                        ceiling (too much risks the wheel
                                                                        sliding off its free node anchor).
```

**Explicitly NOT widened:** the truss-member `HERTZ_MIN/MAX` (2..10) and `DAMP_MIN/MAX` (0.3..1.0) in `car.ts:24-27`. The HERTZ ceiling is pinned to the 60 Hz-substep buzz threshold (a *numerical-stepping* argument, not "feels bouncy") — widening it needs a dedicated buzz test, not worth it when the six genes above already buy a large variety win (those were previously 100% uniform across the whole population). Revisit only if Chrome-verify shows the population still looks too uniform.

**Mechanics:** `NodeGene` gains `radius`, `friction`; `WheelGene` gains `suspensionHertz`, `suspensionDamping`, `suspensionAxis`, `suspensionTravel`. `GenomeRanges` + `DEFAULT_RANGES` gain matching min/max fields. These follow the existing **absolute-valued wheel-field convention** (`radius`/`grip`/`mass`/`motorSpeed`/`torque` are already `lerp`'d from ranges at birth) — so `randomGenome` gets one more `lerp` per field, `crossover` carries them for **free** (Pass-1/Pass-3 copy whole records), and `mutate` gets one more `jit` per field. `repair()` needs **no change** (none of the new fields has a validity constraint). Genome grows from 118 → 156 scalar genes (~32%: node 4→6 fields × 7 = 42; pair 2 × 21 = 42; wheel 8→12 fields × 6 = 72); no determinism impact (same per-field independent `rng()` draws in a fixed order).

`car.ts:buildCar` swaps the six now-dead module constants for the genome fields, computing `axisX = Math.sin(w.suspensionAxis)`, `axisY = Math.cos(w.suspensionAxis)`.

**Diversity payoff:** two new fields are *visually* distinct (`suspensionAxis` → raked vs vertical stance; `radius` → chunky vs spindly nodes), so the viewer registers variety immediately — directly addressing "cars look the same *within a run*."

### 3.4 Random seed on fresh load — framework (`PlayScreen.tsx`, `ConfigScreen.tsx`, schema meta)

**Problem fixed:** a bare load (`/d/boxcar2d/play`, no query params) decodes `schema.parse({})` → `seed = 42` → the deterministic run replays **byte-identical every refresh**. This is the cross-refresh half of "cars look the same."

**Design (opt-in, generic, share-link-safe):**
- A schema field may carry `.meta({ randomizeOnFreshLoad: true })`. BoxCar2D's `seed` field opts in.
- In `PlayScreen` / `ConfigScreen`, **when the URL query is empty** (fresh load, not a share-link) and the schema has a `randomizeOnFreshLoad` field, overwrite that field's decoded default with a fresh random integer. This is the **one** place non-determinism is correct: it picks the seed that then drives a fully deterministic run.
- **Share-link integrity:** the Copy-Link href must encode the **active config** (`encodeConfig(schema, config)`), not the raw (possibly-empty) `search` string — otherwise copying a fresh-load link would yield an empty URL that re-randomizes for the recipient instead of reproducing. `PlayScreen.tsx:53` currently builds the href from `search`; switch it to encode the live config. A share-link therefore always carries the explicit rolled seed and reproduces exactly. (This also makes Copy-Link robust in general, independent of seed handling.)

**Why opt-in per field, not global:** keeps the change surgical and leaves other diversions' refresh behavior untouched unless they opt in. The URL codec functions themselves are **not** modified (the keystone stays as-is); only the route-level decode-then-override and the copy-link href change.

### 3.5 Rubble default → 0 — `schema.ts` (DECIDED)

`rubbleDensity` default `1 → 0`. Unblocks the gen-10 goal (measured: rubble-off finishes by gen 7–8 with even *today's* broken operators). Rubble remains a `0..8` slider for anyone wanting the challenge. The rubble's size/weight rebalance (so it *slows* rather than *walls* a car) is tracked in **#157** for a later pass, together with the cull-while-visible fix.

## 4. Determinism & testing

Determinism from the seed must hold (share-links). All breeding stays pure of `Math.random`/`Date`; the only new non-determinism is the deliberate fresh-load seed roll (§3.4), which is *outside* the sim and produces a seed that is then fully deterministic.

- **Genome is unreleased** (`wip-diversion-versioning`): free to change shape and break the rng-stream layout — no migration needed.
- The `firstGenFitness` / `thirdGenFitness` determinism keystone snapshot in `index.test.ts` **will shift numerically** (operators changed) — expected; regenerate the fixture and keep the *reproducibility* assertion (same seed → same fitnesses), which is the real invariant.
- New/updated co-located tests:
  - `genome.test.ts` — subassembly crossover: whole-node coherence (a node's x/y/mass/radius/friction all from one parent), wheel-subassembly coherence (wheel travels with its mount node), new-gene round-trip + range bounds, mutate determinism.
  - `index.test.ts` — annealed-rate monotonic non-increase across gens; keystone reproducibility.
  - framework — fresh-load seed override fires only on empty query; copy-link href encodes the active config (incl. the rolled seed) so a copied fresh-load link reproduces.

## 5. Out of scope / deliberately dropped

- **Tournament selection** — roulette was empirically exonerated; adding it is surface area solving a non-problem.
- **Hall-of-fame / MAP-Elites archive** — the champion is already retained verbatim each generation on the deterministic ∞ track; there is no amnesia to cure. (If a future *finite*-lifespan-track focus or an explicit diversity goal arrives, revisit.)
- **`population` 8→12 and `mutationRate` default change** — not needed; the operator fixes remove the jackpot-dependence that motivated them. Revisit only if Chrome-verify shows the gen-10 bar isn't met. (Both are 🎚️ balance numbers → would need explicit sign-off.)
- **Rubble size/weight rebalance + cull-while-visible fix** — tracked in **#157**.
- **Truss HERTZ/DAMP ceiling widening** — needs a dedicated 60 Hz-substep buzz test first.

## 6. Files touched

```text
genome.ts        NodeGene +radius/+friction; WheelGene +suspension{Hertz,Damping,Axis,Travel};
                 GenomeRanges + DEFAULT_RANGES + matching min/max; randomGenome/mutate draw new
                 fields; crossover REWRITTEN (subassembly algorithm §3.1).
car.ts           buildCar reads the six new genome fields instead of NODE_RADIUS/NODE_FRICTION/
                 WHEEL_HERTZ/WHEEL_DAMPING/WHEEL_TRAVEL; axis from suspensionAxis. Truss
                 HERTZ/DAMP bounds UNCHANGED.
index.ts         annealed rate(generation) computed before breedGeneration; new consts
                 ANNEAL_GENS=8, MUTATION_FLOOR_FRAC=0.25.
schema.ts        rubbleDensity default 1→0; seed field .meta({ randomizeOnFreshLoad: true });
                 mutationRate help text reframed as "gen-1 peak".
PlayScreen.tsx   fresh-load seed override on empty query; copy-link href encodes active config.
ConfigScreen.tsx fresh-load seed override on empty query (consistent with Play).
fieldMeta.ts     (if needed) surface the randomizeOnFreshLoad meta flag.
*.test.ts        coverage per §4.
```

`render.ts`, `presets.ts`, `physics.ts`, `ga.ts` need no changes — `ga.ts`'s `roulettePick`/`breedGeneration` stay (selection exonerated); render's node dot is already a fixed decorative size; `createWheelJoint` already accepts an arbitrary axis vector.

## 7. Verification plan

1. Unit/integration green (vitest): operator coherence, annealing, determinism keystone, fresh-load seed, copy-link reproduction.
2. **Headless re-measure** (reuse the probe pattern): confirm a working car (≥300 m, ideally a 500 m finish) appears by ~gen 10 across ≥3 seeds with rubble off — and that the curve is a *climb*, not a single late jackpot.
3. **Chrome verify** (port 5180, `?mute=1` if applicable): watch gens 1–10 — junk → competent arc legible; visible body-plan variety (raked stances, varied node sizes); no reintroduced jitter/wobble/buzz at the new gene-range extremes (spot-check a population pushed toward `suspensionDamping≈0.85` + `suspensionHertz≈6`); fresh refresh yields a *different* run; a copied link reproduces the *same* run.
4. Code-review phase (fresh `diversion-reviewer` + `perf-analyzer`) before FF-merge.
