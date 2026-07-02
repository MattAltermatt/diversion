# BoxCar2D — cars that start slow and evolve to the terrain

**Date:** 2026-07-02
**Issue:** #231 (evolution ceiling) + selection-differential fix
**Status:** design approved, ready for implementation plan

## 🎯 Goal

A watcher should see BoxCar2D cars **start as slow flailing junk and visibly get faster
generation over generation, evolving to the terrain** — instead of plateauing early. The
live symptom that triggered this: at gen 29 the best car crossed 500 m in 80.1 s (~6.25 m/s)
and had been stuck 80–89 s for many generations.

## 🔬 Diagnosis (measured, not assumed)

Three dueling Opus analysts (evolution-dynamics, car-embodiment/physics, adversarial
empiricist) examined the system. The empiricist ran the GA **headless** for 30 gens × 3 seeds
× 3 configs and the data overturned the initial single-cause hypotheses:

- **There is no hard 80 s gene-ceiling floor.** Baseline evolution already descends
  80 s → 50–64 s on its own and keeps falling. The user's gen-29 / 80.1 s is an
  **unlucky-seed local optimum** (one measured seed sat in a 66–70 s basin for 18 gens).
- **Grip is the wrong lever — REFUTED.** Grip evolves *down* to 0.33 of its range; fast cars
  run low grip. The observed wheel-spin is a symptom of *stuck* cars, not a call for more grip.
- **The real power levers are `torque`, `wheelRadius`, `motorSpeed`** — these saturate *up*
  against their caps (torque hits 0.80 of range).

The plateau is **three real, complementary layers**:

| # | layer | evidence |
|---|-------|----------|
| 1 | Power-gene ceilings set the *asymptote* | random-search floor: 57 s (default ranges) → 16 s (raised). `torque`/`wheelRadius`/`motorSpeed` bind; `grip` does not. |
| 2 | Weak roulette selection → elitism does *all* the ratcheting → slow descent | finisher fitness = `680 − t`, so all finishers cram into ~594–628; best-vs-median pick-probability edge = **1.02×** (indistinguishable from uniform). |
| 3 | Small-population local optima | seed 123 stuck at 66–70 s for 18 gens. What "looks stuck" live. |

Measured configs (gen-30 best finish time):

| config | gen-30 best | character |
|--------|-------------|-----------|
| baseline (today) | 50–64 s | descends, low asymptote |
| raised (birth+clamp both up) | 24 s (best 12 s) | fast, but kills the slow start |
| **SPLIT (low birth, high ceiling)** | **36–54 s & falling** | ⭐ start slow → evolve up → keep climbing |

Cars already start slow *at birth* (first finisher appears gen 4–5 at ~85 s in the data —
the existing flailing-junk opening). The break is that they cannot climb *past* birth ranges.

## 🛠️ Design

Three changes. Keystone invariant throughout: **determinism** — every genome/GA op stays a
pure function of injected `rng` so "same seed = same run" (share-links) holds.

### Change 1 — Split the evolution ceiling from the birth range (MECHANISM + TUNING)

Today `mutate()` clamps every gene to `DEFAULT_RANGES` — the *same* table `randomGenome`
draws from (`genome.ts:219–221`), so birth range == hard evolutionary wall.

- Keep the current `DEFAULT_RANGES` as the **birth** table (rename to `BIRTH_RANGES`;
  `randomGenome` keeps using it). The slow start already works — do **not** lower birth.
- Add a separate **`EVOLVE_RANGES`** used **only** by `mutate()`'s clamp, with raised
  ceilings on the three genes that actually bind. All other genes' evolve bounds == birth
  bounds (no power direction → no reason to climb). `grip` unchanged (evolves down anyway).

Starting numbers (measured-derived, moderated so 1 m wheels don't look absurd; all
live-tunable, subject to the user's tuning call):

| gene | birth (unchanged) | evolve ceiling (new) | today's ceiling |
|------|-------------------|----------------------|-----------------|
| `torque` | 50 – 180 | up to ~500 | 180 |
| `motorSpeed` | 6 – 30 | up to ~60 | 30 |
| `wheelRadius` | 0.15 – 0.65 | up to ~0.85 | 0.65 |
| `grip` | 0.3 – 1.5 | (unchanged) | 1.5 |

Wiring: `breedGeneration`/`mutate` already thread a `ranges` arg — pass `EVOLVE_RANGES` at
the mutation callsite while `randomGenome` uses `BIRTH_RANGES`. The `crossover` op is
range-free and untouched.

**Note on mutation step:** `jit()` moves ±25% of `(hi−lo)`. With a wider evolve clamp the
absolute step grows. The empiricist's SPLIT run used the wide clamp and still descended
cleanly (36–54 s and falling), so a step reshape is **optional polish**, not required — but
if late-stage fine-tuning looks jumpy in Chrome, decouple the step from the clamp width
(fixed absolute or tied to the birth-range width).

### Change 2 — Rank-based selection replacing raw-fitness roulette (MECHANISM)

`roulettePick` (`ga.ts:7–15`) weights by raw fitness, so the `+goalDistance` (500) baseline
drowns the time signal → 1.02× edge → the GA is a random walk with elitism once everyone
finishes.

- Replace with **linear rank selection**: weight by sorted rank, not raw value. `ranked` is
  already sorted in `breedGeneration` (`ga.ts:22`). Standard linear-ranking weight with
  slope `s ≈ 1.7` (best ≈ 1.7× the mean pick pressure, worst ≈ 0.3×), scale-invariant → immune
  to the additive baseline, so a faster finisher is reliably preferred by a fixed factor no
  matter how small the absolute time gap. Also helps escape local optima (layer 3).
- Still exactly one `rng()` draw per pick over the sorted order → deterministic; same seed →
  same (new) run.
- **Test impact:** GA snapshot expectations (e.g. `firstGenFitness`/`thirdGenFitness` in
  `index.ts` tests, `ga.test.ts`) shift and must be re-baselined — expected for a behavior
  change. The codec / "same-seed = same run" keystone tests do **not** touch selection and
  stay green.

The `s` slope is a mild tunable (selection-pressure knob); ship a fixed ~1.7 as mechanism,
consider exposing later only if wanted.

### Change 3 — Velocity / position sanity clamp in the sim (MECHANISM)

With raised `motorSpeed`/`torque` ceilings, rare degenerate genomes "explode" (measured
`bestDist ≈ 6.5e244 m`). Harmless in time mode (they never finish sanely) but would poison a
**distance-mode** run's fitness and roulette totals.

- In the headless step/track path (`simulateCar` / the per-step progress read in
  `car.ts`/`index.ts`), treat a car whose speed or |position| exceeds a sane physical bound
  as failed (cull / cap its tracked distance) rather than letting an astronomical distance
  enter fitness. Deterministic threshold, no rng.

### Optional (TUNING — user's call, not blocking)

- **Population default 8 → ~16** (`schema.ts:5`) to reduce small-population local-optima
  stalls (layer 3).
- Mutation-step reshape (see Change 1 note) if Chrome shows jumpy fine-tuning.

## 🗃️ Deferred → backlog (out of scope)

**Rigid-chassis / non-colliding interior nodes.** Physically the biggest single win — today
every chassis node is its own ground-contact circle stealing 40–60% of the weight off the
driven wheels, capping the traction ceiling (climb angle ~22° vs ~43° if all weight rode the
wheels). But it changes the spring-truss aesthetic and is a heavy lift, and the measured
SPLIT + rank-selection combo hits the goal without it. File as a follow-up.

## 🧪 Testing

- **Determinism keystone (must stay green):** same seed → identical genome sequence through
  `crossover`/`mutate`/`repair`; codec round-trip unaffected. Add a test asserting
  `mutate` can now produce a gene value **above the birth ceiling** (proves the split) while
  `randomGenome` never does.
- **Rank selection:** unit-test that `roulettePick`'s replacement gives a monotonic,
  scale-invariant preference (a +500-shifted fitness vector yields the same pick
  distribution as the unshifted one) and is deterministic under a fixed rng.
- **Sanity clamp:** a genome engineered to explode is culled, not rewarded (deterministic
  repro, mirrors `rubble-cull.test.ts` style).
- **Re-baseline** shifted GA snapshot expectations.
- **Verify in Chrome with a SEEDED URL** (a seedless direct load resumes the saved run and
  ignores URL config — see the run-persistence seam). Watch: gen-1 flailing junk → visible
  descent over generations → cars faster than the old 80 s wall.

## Success criteria

1. Gen-1 cars are still slow flailing junk (first finisher ~gen 4–5, ~80–85 s).
2. Best time descends visibly generation over generation and pushes well past 80 s toward
   the 30–50 s range (and lower with more gens), instead of freezing.
3. Determinism / share-link tests stay green.
