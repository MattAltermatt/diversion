# BoxCar2D Evolve-Uncapped Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let BoxCar2D cars start as slow flailing junk and visibly evolve faster generation over generation, escaping the ~80s plateau.

**Architecture:** Three targeted changes to the existing GA, each keeping the determinism keystone (pure functions of injected `rng`): (1) split the mutation clamp's ceiling from the birth range so genes can climb past gen-1; (2) replace raw-fitness roulette with scale-invariant rank selection so a faster finisher is actually preferred; (3) a sanity clamp so raised ceilings can't produce astronomical-distance "exploding" cars that poison distance-mode fitness.

**Tech Stack:** TypeScript, Vitest (co-located `*.test.ts`), phaser-box2d (Box2D v3), mulberry32 seeded RNG.

## Global Constraints

- **Determinism keystone:** same seed → identical run. `crossover`/`mutate`/`repair` and all selection stay pure functions of the injected `rng`; never add wall-clock/`Math.random`. (share-links depend on this.)
- **Tuning values are the user's call:** the ceiling magnitudes below (`torqueMax 500`, `motorSpeedMax 60`, `wheelRMax 0.85`) are user-approved starting points and are live-tunable; do not invent additional numeric-balance changes (population, mutation rate, gravity) — those stay as-is.
- **Anti-jitter suspension bands are load-bearing** (`suspHertz`/`suspDamping`/`suspTravel` floors/caps in `DEFAULT_RANGES`) — do NOT widen them.
- **Grip is unchanged** — the data shows it evolves *down*; only `torque`, `motorSpeed`, `wheelRadius` get raised ceilings.
- Tests run with: `npx vitest run src/diversions/boxcar2d`

---

### Task 1: Split the evolution ceiling from the birth range

Today `mutate()` clamps every gene to `DEFAULT_RANGES` — the same table `randomGenome` draws from — so no gene can ever exceed its gen-1 birth value. Keep `DEFAULT_RANGES` as the birth table (unchanged) and add a separate `EVOLVE_RANGES` (raised ceilings on the three binding genes) used only by the live GA's mutation clamp.

**Files:**
- Modify: `src/diversions/boxcar2d/genome.ts` (add `EVOLVE_RANGES` after `DEFAULT_RANGES`, ~line 96)
- Modify: `src/diversions/boxcar2d/index.ts:322` (pass `EVOLVE_RANGES` to `breedGeneration`)
- Test: `src/diversions/boxcar2d/genome.test.ts`

**Interfaces:**
- Produces: `export const EVOLVE_RANGES: GenomeRanges` — identical to `DEFAULT_RANGES` except `torqueMax: 500`, `motorSpeedMax: 60`, `wheelRMax: 0.85`.

- [ ] **Step 1: Write the failing test**

Add to `src/diversions/boxcar2d/genome.test.ts` (import `EVOLVE_RANGES` and `mutate` — `mutate` is already imported):

```ts
import { EVOLVE_RANGES } from './genome' // add to the existing genome import block

describe('EVOLVE_RANGES (split ceiling)', () => {
  it('lets mutation push torque/motorSpeed/wheelRadius above the birth ceiling', () => {
    // Seed a genome at the birth ceiling, then mutate hard under EVOLVE_RANGES many times.
    let g = randomGenome(mulberry32(7))
    for (const w of g.wheels) { w.torque = DEFAULT_RANGES.torqueMax; w.motorSpeed = DEFAULT_RANGES.motorSpeedMax; w.radius = DEFAULT_RANGES.wheelRMax }
    let sawAboveBirth = false
    const rng = mulberry32(99)
    for (let i = 0; i < 200 && !sawAboveBirth; i++) {
      g = mutate(g, 1, rng, EVOLVE_RANGES) // rate 1 = every gene jitters
      sawAboveBirth = g.wheels.some(w =>
        w.torque > DEFAULT_RANGES.torqueMax ||
        w.motorSpeed > DEFAULT_RANGES.motorSpeedMax ||
        w.radius > DEFAULT_RANGES.wheelRMax)
    }
    expect(sawAboveBirth).toBe(true)
  })

  it('birth genomes never exceed the birth ceiling (randomGenome stays tame)', () => {
    for (let s = 1; s <= 40; s++) {
      for (const w of randomGenome(mulberry32(s)).wheels) {
        expect(w.torque).toBeLessThanOrEqual(DEFAULT_RANGES.torqueMax)
        expect(w.motorSpeed).toBeLessThanOrEqual(DEFAULT_RANGES.motorSpeedMax)
        expect(w.radius).toBeLessThanOrEqual(DEFAULT_RANGES.wheelRMax)
      }
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/genome.test.ts`
Expected: FAIL — `EVOLVE_RANGES` is not exported (import error), or the "above birth" assertion is false.

- [ ] **Step 3: Add `EVOLVE_RANGES` to `genome.ts`**

Immediately after the `DEFAULT_RANGES` object (after ~line 96):

```ts
// 🎚️ Evolution ceilings: the mutation clamp table. Identical to the birth table
// EXCEPT the three genes measured to bind a fast car (torque / motorSpeed / wheel
// radius) get raised ceilings — so a car BORN tame can still EVOLVE far more
// powerful. randomGenome keeps drawing from DEFAULT_RANGES (slow, junky gen-1);
// only mutate()'s clamp uses this in the live GA. grip is untouched (it evolves
// DOWN — measured), and the anti-jitter suspension bands are untouched.
export const EVOLVE_RANGES: GenomeRanges = {
  ...DEFAULT_RANGES,
  torqueMax: 500,
  motorSpeedMax: 60,
  wheelRMax: 0.85,
}
```

- [ ] **Step 4: Wire the live GA to breed with `EVOLVE_RANGES`**

In `src/diversions/boxcar2d/index.ts`: add `EVOLVE_RANGES` to the genome import on line 21, then change line 322 from `ranges: DEFAULT_RANGES,` to `ranges: EVOLVE_RANGES,`.

```ts
// line 21:
import { randomGenome, DEFAULT_RANGES, EVOLVE_RANGES, type Genome } from './genome'
// line ~322 inside breedGeneration opts:
        ranges: EVOLVE_RANGES,
```

(Leave `DEFAULT_RANGES` imported — the initial population at line 453 still births from it via `randomGenome`'s default.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/diversions/boxcar2d/genome.test.ts`
Expected: PASS (both new tests + all existing).

- [ ] **Step 6: Commit**

```bash
git add src/diversions/boxcar2d/genome.ts src/diversions/boxcar2d/genome.test.ts src/diversions/boxcar2d/index.ts
git commit -m "feat(boxcar2d): split evolution ceiling from birth range (#231)"
```

---

### Task 2: Rank-based selection replacing raw-fitness roulette

`roulettePick` weights by raw fitness. Once all cars finish, fitness = `goalDistance + (timeCap − timeSec)` crams every finisher into a tiny band (measured best-vs-worst pick edge = 1.02×), so selection is ~uniform and only elitism ratchets. Replace with **linear rank selection**: weight by sorted rank, scale-invariant → immune to the additive baseline.

**Files:**
- Modify: `src/diversions/boxcar2d/ga.ts` (replace `roulettePick` with `rankPick`; update `breedGeneration`)
- Test: `src/diversions/boxcar2d/ga.test.ts`
- Re-baseline: any GA snapshot in `src/diversions/boxcar2d/index.test.ts` that the new selection order shifts.

**Interfaces:**
- Produces: `export function rankPick(ranked: Scored[], rng: () => number): Genome` — `ranked` MUST be pre-sorted best-first (descending fitness). Uses linear-ranking weights with slope `s = 1.7` (best ≈ 1.7×, worst ≈ 0.3× mean pressure). One `rng()` draw per call.
- `breedGeneration` signature unchanged; internally calls `rankPick(ranked, rng)` on its already-sorted `ranked` array.

- [ ] **Step 1: Write the failing test**

Replace the `roulettePick` describe block in `src/diversions/boxcar2d/ga.test.ts` with (and update the import from `roulettePick` to `rankPick`):

```ts
import { breedGeneration, rankPick, type Scored } from './ga' // was roulettePick

describe('rankPick', () => {
  const ranked = (fitnesses: number[]): Scored[] =>
    fitnesses
      .map((f, i) => ({ genome: randomGenome(mulberry32(500 + i)), fitness: f }))
      .sort((a, b) => b.fitness - a.fitness)

  it('returns a genome from the pool', () => {
    const g = rankPick(ranked([1, 2, 3, 4]), mulberry32(3))
    expect(ranked([1, 2, 3, 4]).map(s => s.genome)).toContainEqual(g)
  })

  it('is scale-invariant: adding a constant to every fitness does not change the pick distribution', () => {
    const base = [10, 20, 30, 40, 50]
    const shifted = base.map(f => f + 500) // the +goalDistance baseline that broke roulette
    const count = (fs: number[], seed: number) => {
      const pool = ranked(fs)
      const tally = new Map<unknown, number>()
      for (let i = 0; i < 400; i++) {
        const g = rankPick(pool, mulberry32(seed + i))
        tally.set(g, (tally.get(g) ?? 0) + 1)
      }
      // return counts keyed by rank (pool is sorted best-first, identical genome order for both)
      return pool.map(s => tally.get(s.genome) ?? 0)
    }
    expect(count(base, 1)).toEqual(count(shifted, 1)) // same rank order → identical picks
  })

  it('prefers the better-ranked genome (best picked more often than worst)', () => {
    const pool = ranked([1, 2, 3, 4, 5])
    let bestPicks = 0, worstPicks = 0
    for (let i = 0; i < 1000; i++) {
      const g = rankPick(pool, mulberry32(i))
      if (g === pool[0].genome) bestPicks++
      if (g === pool[pool.length - 1].genome) worstPicks++
    }
    expect(bestPicks).toBeGreaterThan(worstPicks * 2) // ~1.7/0.3 ≈ 5.7× in the limit
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/ga.test.ts`
Expected: FAIL — `rankPick` is not exported.

- [ ] **Step 3: Implement `rankPick` and switch `breedGeneration`**

In `src/diversions/boxcar2d/ga.ts`, replace `roulettePick` with `rankPick` and update the two callsites:

```ts
import { type Genome, crossover, mutate, type GenomeRanges } from './genome'

export interface Scored { genome: Genome; fitness: number }

// Linear-ranking selection. `ranked` MUST be sorted best-first. Weight by RANK,
// not raw fitness, so selection is scale-invariant: it cannot be washed out by the
// `+goalDistance` additive baseline that crushes every finisher into a ~1.02× band
// under raw-fitness roulette. Slope s=1.7 → best ≈ 1.7×, worst ≈ 0.3× mean pressure.
// One rng() draw per pick → deterministic (share-link keystone holds).
const RANK_SLOPE = 1.7 // 1 = uniform, 2 = maximal linear pressure

export function rankPick(ranked: Scored[], rng: () => number): Genome {
  const n = ranked.length
  if (n === 1) return ranked[0].genome
  // weight(rank i, 0=best) = 2 − s + 2(s−1)·(n−1−i)/(n−1); sums to n.
  const weight = (i: number) => 2 - RANK_SLOPE + 2 * (RANK_SLOPE - 1) * ((n - 1 - i) / (n - 1))
  const total = n // Σ weights == n by construction
  let r = rng() * total
  for (let i = 0; i < n; i++) {
    r -= weight(i)
    if (r <= 0) return ranked[i].genome
  }
  return ranked[n - 1].genome
}

export function breedGeneration(
  scored: Scored[],
  opts: { eliteCount: number; mutationRate: number; ranges: GenomeRanges },
  rng: () => number,
): Genome[] {
  const ranked = [...scored].sort((a, b) => b.fitness - a.fitness)
  const size = ranked.length
  const elite = Math.min(opts.eliteCount, size)
  const next: Genome[] = ranked.slice(0, elite).map(s => s.genome)
  while (next.length < size) {
    const a = rankPick(ranked, rng)
    const b = rankPick(ranked, rng)
    next.push(mutate(crossover(a, b, rng), opts.mutationRate, rng, opts.ranges))
  }
  return next
}
```

Delete the old `roulettePick` function and its `EPS` constant if now unused.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/diversions/boxcar2d/ga.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-baseline shifted GA snapshots**

Run the whole diversion suite: `npx vitest run src/diversions/boxcar2d`
Any failure whose expected value is a hardcoded fitness/genome snapshot (e.g. `firstGenFitness`/`thirdGenFitness`-style assertions in `index.test.ts`) is the *expected* behavior shift from the new selection order — NOT a regression. For each, confirm the diff is only in evolved-fitness numbers (not a thrown error / NaN / structural change), then update the expected value to the new deterministic output. The codec / "same-seed = same run" keystone tests must stay green untouched; if one of those fails, STOP — that's a real determinism break.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/boxcar2d/ga.ts src/diversions/boxcar2d/ga.test.ts src/diversions/boxcar2d/index.test.ts
git commit -m "feat(boxcar2d): rank-based selection (scale-invariant, fixes flat roulette)"
```

---

### Task 3: Sanity clamp against exploding cars

With raised `motorSpeed`/`torque` ceilings, rare degenerate genomes fling to astronomical distance (measured `bestDist ≈ 6.5e244 m`). Harmless in time mode (never finishes sanely) but poisons a distance-mode run's fitness + selection totals. Add a deterministic bound: a car whose centroid x is non-finite or absurdly far past spawn is treated as failed / not recorded.

**Files:**
- Modify: `src/diversions/boxcar2d/car.ts` (add `SANE_DIST_CAP` + `isExploded` helper; guard `simulateCar`)
- Modify: `src/diversions/boxcar2d/index.ts:361` (`stepCar` — cull an exploded car)
- Test: `src/diversions/boxcar2d/car.test.ts`

**Interfaces:**
- Produces: `export const SANE_DIST_CAP = 100_000` (meters past spawn — ~200× any real goal, so it never clips a legit run). `export function isExploded(px: number, spawnX: number): boolean` — `true` when `!Number.isFinite(px) || px - spawnX > SANE_DIST_CAP`.

- [ ] **Step 1: Write the failing test**

Add to `src/diversions/boxcar2d/car.test.ts` (import `isExploded`, `SANE_DIST_CAP`):

```ts
import { isExploded, SANE_DIST_CAP } from './car'

describe('isExploded (sanity clamp)', () => {
  it('flags non-finite and astronomically-far positions', () => {
    expect(isExploded(6.5e244, 0)).toBe(true)
    expect(isExploded(Infinity, 0)).toBe(true)
    expect(isExploded(NaN, 0)).toBe(true)
    expect(isExploded(SANE_DIST_CAP + 5 + 100, 100)).toBe(true)
  })
  it('passes normal in-range positions', () => {
    expect(isExploded(500, 100)).toBe(false)   // a 400 m run
    expect(isExploded(-3, 0)).toBe(false)       // small backward drift
    expect(isExploded(100 + SANE_DIST_CAP - 1, 100)).toBe(false) // just under the cap
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/diversions/boxcar2d/car.test.ts`
Expected: FAIL — `isExploded` / `SANE_DIST_CAP` not exported.

- [ ] **Step 3: Implement the helper and guard the headless sim**

In `src/diversions/boxcar2d/car.ts`, add near the top exports:

```ts
// A car that flings to astronomical distance (rare with raised motor ceilings —
// measured 6.5e244 m) would poison distance-mode fitness/selection. This cap is
// ~200× any real goal, so it never clips a legit run; it only catches blow-ups.
export const SANE_DIST_CAP = 100_000
export function isExploded(px: number, spawnX: number): boolean {
  return !Number.isFinite(px) || px - spawnX > SANE_DIST_CAP
}
```

Then in `simulateCar`, break out before recording an exploded position:

```ts
  for (let i = 0; i < cfg.maxSteps; i++) {
    stepWorld(world, 1)
    const px = carCentroid(car).x
    if (isExploded(px, cfg.spawnX)) break // do NOT let 6.5e244 become fitness
    if (px > maxX + cfg.progressEps) { maxX = px; stall = 0 }
    else if (++stall >= cfg.stallSteps) break
  }
```

- [ ] **Step 4: Guard the live step loop**

In `src/diversions/boxcar2d/index.ts`, add `isExploded` to the `car` import, and in `stepCar` right after `const x = carCentroid(state.current).x` (line 364):

```ts
  const x = carCentroid(state.current).x
  if (isExploded(x, state.spawnX)) { endCurrentCar(state, false); return } // cull blow-ups
  if (x > state.maxXThisCar) state.maxXThisCar = x
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/diversions/boxcar2d/car.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/boxcar2d/car.ts src/diversions/boxcar2d/car.test.ts src/diversions/boxcar2d/index.ts
git commit -m "feat(boxcar2d): sanity-clamp exploding cars past raised motor ceilings"
```

---

### Task 4: Full suite + typecheck gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all ~1786+ tests; only the intentionally re-baselined GA snapshots changed).

- [ ] **Step 2: Typecheck + build**

Run: `npm run build` (or the project's typecheck script — check `package.json`)
Expected: no TS errors.

- [ ] **Step 3: Commit any incidental fixes** (only if needed)

```bash
git add -A && git commit -m "test(boxcar2d): green suite after evolve-uncapped"
```

---

### Task 5: Chrome verify (manual, inline — not a subagent task)

**Files:** none.

- [ ] **Step 1: Start the dev server** on port 5180 (`npm run dev`), in the background.
- [ ] **Step 2: Open a SEEDED URL** (a seedless direct load resumes the saved run and ignores URL config — see the run-persistence gotcha). Use the boxcar2d play route with `?seed=42&population=12&mute=1` and let it run many generations.
- [ ] **Step 3: Verify the arc** in Chrome (chrome-devtools MCP, never the built-in preview):
  - Gen-1 cars are still slow flailing junk (first finisher ~gen 4–5).
  - Best time **descends visibly** generation over generation and pushes **past 80s** toward the 30–50s range (and lower with more gens) — not frozen.
  - Champions panel times keep improving rather than clustering.
- [ ] **Step 4: Hand the URL + findings to the user** for the user-verify-before-FF-merge gate.

---

## Self-Review

**Spec coverage:**
- Change 1 (split ceiling) → Task 1 ✓
- Change 2 (rank selection) → Task 2 ✓
- Change 3 (sanity clamp) → Task 3 ✓
- Determinism keystone → Global Constraints + Task 2 Step 5 guard ✓
- Testing (determinism, rank scale-invariance, sanity clamp, re-baseline, Chrome seeded) → Tasks 1–5 ✓
- Deferred body-plan → intentionally out of scope (spec §Deferred) ✓
- Optional population/mutation-step tuning → intentionally omitted (user's tuning call) ✓

**Placeholder scan:** none — every code step shows real code and exact commands.

**Type consistency:** `EVOLVE_RANGES: GenomeRanges` (Task 1) matches the `ranges` arg of `breedGeneration`/`mutate`. `rankPick(ranked: Scored[], rng)` (Task 2) matches its callsites in `breedGeneration`. `isExploded(px, spawnX): boolean` + `SANE_DIST_CAP` (Task 3) used identically in `simulateCar` and `stepCar`.
