# BoxCar2D Smarter Evolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BoxCar2D's GA reach a visibly working car by ~gen 10 by fixing its two confirmed variation-operator bugs, widening the genome so every physics trait evolves, randomizing the seed per fresh load, and removing the rubble wall from the default.

**Architecture:** Keep the generational GA + roulette selection (empirically exonerated). Replace uniform per-gene crossover with subassembly-aware crossover; anneal the mutation rate over generations; promote six hardcoded `car.ts` physics constants to genes within anti-jitter-safe bands; roll a random seed on a bare page load while keeping share-links reproducible; default `rubbleDensity` to 0.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4 + phaser-box2d; Vitest (co-located `*.test.ts`). Dev server port 5180. Verify in Chrome (chrome-devtools MCP).

**Spec:** `docs/superpowers/specs/2026-06-30-boxcar2d-smarter-evolution-design.md`

## Global Constraints

- **Determinism from seed must hold** (share-links): no `Math.random`/`Date` in breeding or the sim. The ONLY new non-determinism is the deliberate fresh-load seed roll (Task 5), which is outside the sim.
- **Genome is unreleased** — free to change shape / rng-stream layout; no migration.
- **Anti-jitter floors are load-bearing:** damping/stability gene ranges widen only toward the safe (overdamped) direction, never below the pinned floor. Truss `HERTZ_MIN/MAX` (2..10) and `DAMP_MIN/MAX` (0.3..1.0) are NOT widened.
- **No balance-number changes beyond `rubbleDensity` default 1→0** (the one user-approved tuning change). `mutationRate` and `population` defaults stay.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/boxcar2d-smarter-evolution` (already created).
- Tests co-located; run a single file with `npx vitest run src/diversions/boxcar2d/<file>.test.ts`.

---

### Task 1: Widen the genome + subassembly crossover (`genome.ts`)

The foundational task — locks the genome shape AND the determinism-sensitive crossover.

**Files:**
- Modify: `src/diversions/boxcar2d/genome.ts`
- Test: `src/diversions/boxcar2d/genome.test.ts`

**Interfaces:**
- Produces: `NodeGene { present, x, y, mass, radius, friction }`; `WheelGene { …, suspensionHertz, suspensionDamping, suspensionAxis, suspensionTravel }`; `GenomeRanges` + 12 new min/max fields; `crossover(a,b,rng)` rewritten (subassembly), same signature.

- [ ] **Step 1: Extend the gene interfaces, ranges, and birth/mutation.**
  In `genome.ts`:
  - `NodeGene`: add `radius: number; friction: number`.
  - `WheelGene`: add `suspensionHertz: number; suspensionDamping: number; suspensionAxis: number; suspensionTravel: number`.
  - `GenomeRanges`: add `nodeRadiusMin/Max, nodeFrictionMin/Max, suspHertzMin/Max, suspDampingMin/Max, suspAxisMin/Max, suspTravelMin/Max`.
  - `DEFAULT_RANGES`: `nodeRadiusMin:0.06, nodeRadiusMax:0.16, nodeFrictionMin:0.10, nodeFrictionMax:1.00, suspHertzMin:2.5, suspHertzMax:6, suspDampingMin:0.85, suspDampingMax:1.00, suspAxisMin:-0.52, suspAxisMax:0.52, suspTravelMin:0.03, suspTravelMax:0.14`.
  - `randomGenome`: draw each new node field `lerp(r.nodeRadiusMin,…,rng())` / `lerp(r.nodeFrictionMin,…,rng())`, and each new wheel field `lerp(…)`, in declaration order (after the existing fields).
  - `mutate`: add a `jit(n.radius, r.nodeRadiusMin, r.nodeRadiusMax)` etc. for each new field (nodes + wheels), in the same order.

- [ ] **Step 2: Rewrite `crossover` to subassembly-aware (replace `genome.ts:130-153`).**

```ts
export function crossover(a: Genome, b: Genome, rng: () => number): Genome {
  // Pass 1 — whole-NODE inheritance (each slot's entire record from ONE parent)
  const nodeSrcA = a.nodes.map(() => rng() < 0.5) // true → from a
  const nodes = a.nodes.map((n, i) => ({ ...(nodeSrcA[i] ? n : b.nodes[i]) }))
  // Pass 2 — a strut follows its LOWER-index endpoint's node source (reuses nodeSrcA)
  const pairs = a.pairs.map((p, i) => ({ ...p })) // placeholder, filled below
  for (let i = 0; i < MAX_NODES; i++)
    for (let j = i + 1; j < MAX_NODES; j++) {
      const src = nodeSrcA[i] ? a : b
      pairs[pairIndex(i, j)] = { ...src.pairs[pairIndex(i, j)] }
    }
  // Pass 3 — wheel SUBASSEMBLY: the wheel mounted on node i travels with node i's parent
  const wheels: WheelGene[] = []
  for (let i = 0; i < MAX_NODES && wheels.length < MAX_WHEELS; i++) {
    if (!nodes[i].present) continue
    const src = nodeSrcA[i] ? a : b
    const w = src.wheels.find(w => w.present && w.node === i)
    if (w) wheels.push({ ...w, node: i })
  }
  // Pass 4 — fill remaining slots by per-slot coin flip over raw parent arrays
  let j = 0
  while (wheels.length < MAX_WHEELS) {
    wheels.push({ ...(rng() < 0.5 ? a.wheels[j] : b.wheels[j]) }); j++
  }
  return repair({ nodes, pairs, wheels })
}
```

- [ ] **Step 3: Write/extend the failing tests in `genome.test.ts`.**

```ts
it('randomGenome draws the new physics genes in range', () => {
  for (let s = 1; s <= 30; s++) {
    const g = randomGenome(mulberry32(s))
    for (const n of g.nodes) {
      expect(n.radius).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeRadiusMin)
      expect(n.radius).toBeLessThanOrEqual(DEFAULT_RANGES.nodeRadiusMax)
      expect(n.friction).toBeGreaterThanOrEqual(DEFAULT_RANGES.nodeFrictionMin)
    }
    for (const w of g.wheels) {
      expect(w.suspensionDamping).toBeGreaterThanOrEqual(DEFAULT_RANGES.suspDampingMin) // anti-jitter floor
      expect(w.suspensionDamping).toBeLessThanOrEqual(DEFAULT_RANGES.suspDampingMax)
      expect(Math.abs(w.suspensionAxis)).toBeLessThanOrEqual(0.52)
    }
  }
})

it('subassembly crossover keeps a node record coherent (all fields from one parent)', () => {
  const a = randomGenome(mulberry32(1)), b = randomGenome(mulberry32(2))
  const child = crossover(a, b, mulberry32(3))
  child.nodes.forEach((n, i) => {
    const fromA = n.x === a.nodes[i].x && n.y === a.nodes[i].y && n.radius === a.nodes[i].radius
    const fromB = n.x === b.nodes[i].x && n.y === b.nodes[i].y && n.radius === b.nodes[i].radius
    expect(fromA || fromB).toBe(true) // never a mix of the two parents' coordinates
  })
})

it('subassembly crossover stays deterministic and valid', () => {
  const a = randomGenome(mulberry32(1)), b = randomGenome(mulberry32(2))
  expect(crossover(a, b, mulberry32(3))).toEqual(crossover(a, b, mulberry32(3)))
  const child = crossover(a, b, mulberry32(3))
  expect(child.nodes.filter(n => n.present).length).toBeGreaterThanOrEqual(MIN_NODES)
  expect(child.wheels.filter(w => w.present).length).toBeGreaterThanOrEqual(MIN_WHEELS)
})
```

  Update the existing `crossover` test (`genome.test.ts:64-74`) — the old assertion that `child.pairs[i].stiffness` ∈ {a,b} still holds (a pair is copied whole from one parent), so keep it.

- [ ] **Step 4: Run the genome tests.**
  Run: `npx vitest run src/diversions/boxcar2d/genome.test.ts`
  Expected: PASS (all, including the `mutate rate 0 is identity` and `rate 1 valid` tests with the new fields).

- [ ] **Step 5: Commit.**
```bash
git add src/diversions/boxcar2d/genome.ts src/diversions/boxcar2d/genome.test.ts
git commit -m "feat(boxcar2d): widen genome (6 physics genes) + subassembly crossover"
```

---

### Task 2: Wire new genes into the physics (`car.ts`)

**Files:**
- Modify: `src/diversions/boxcar2d/car.ts` (`buildCar`, drop the six now-dead constants)
- Test: `src/diversions/boxcar2d/car.test.ts`

**Interfaces:**
- Consumes: `NodeGene.radius/friction`, `WheelGene.suspension{Hertz,Damping,Axis,Travel}` from Task 1.

- [ ] **Step 1: Edit `buildCar`.**
  - Node body: `radius: o.n.radius` (was `NODE_RADIUS`), `friction: o.n.friction` (was `NODE_FRICTION`).
  - Wheel joint: `hertz: w.suspensionHertz`, `dampingRatio: w.suspensionDamping`, `lowerTranslation: -w.suspensionTravel`, `upperTranslation: w.suspensionTravel`, and axis `axisX: Math.sin(w.suspensionAxis), axisY: Math.cos(w.suspensionAxis)` (was `axisX:0, axisY:1`).
  - Delete the now-unused module consts `NODE_RADIUS, NODE_FRICTION, WHEEL_HERTZ, WHEEL_DAMPING, WHEEL_TRAVEL`. Keep `HERTZ_MIN/MAX, DAMP_MIN/MAX, NODE_FRICTION`? — NO: `NODE_FRICTION` goes; truss `HERTZ_MIN/MAX` + `DAMP_MIN/MAX` stay (used for the pair lerp). Keep `lerp`.

- [ ] **Step 2: Update the wheel-attachment regression test threshold.**
  `car.test.ts:61` asserts `nearest < 0.12` (≤ WHEEL_TRAVEL 0.06 + slack). Travel is now a gene up to 0.14, so change to `expect(nearest).toBeLessThan(0.14 + 0.06)` (max travel + slack), and add a comment that travel is now per-wheel evolvable.

- [ ] **Step 3: Run the car tests.**
  Run: `npx vitest run src/diversions/boxcar2d/car.test.ts`
  Expected: PASS — bodies build, centroid finite, wheels stay attached, simulateCar deterministic.

- [ ] **Step 4: Commit.**
```bash
git add src/diversions/boxcar2d/car.ts src/diversions/boxcar2d/car.test.ts
git commit -m "feat(boxcar2d): drive node size/friction + wheel suspension from genes"
```

---

### Task 3: Annealed mutation rate (`index.ts`)

**Files:**
- Modify: `src/diversions/boxcar2d/index.ts` (`endCurrentCar` breed call) + `schema.ts` help text
- Test: `src/diversions/boxcar2d/index.test.ts`

**Interfaces:**
- Consumes: `mutate(rate)` already takes a rate; `breedGeneration({ mutationRate })` already threads it.

- [ ] **Step 1: Add annealing constants + helper in `index.ts`** (near the other mechanism consts, ~line 43):
```ts
const ANNEAL_GENS = 8          // generations over which mutation cools to its floor
const MUTATION_FLOOR_FRAC = 0.25
/** Mutation rate for a generation: wide gen-1 peak (cfg.mutationRate) → tight floor. */
function annealedRate(peak: number, generation: number): number {
  const floor = peak * MUTATION_FLOOR_FRAC
  const t = Math.min(1, (generation - 1) / ANNEAL_GENS)
  return peak + (floor - peak) * t
}
```

- [ ] **Step 2: Use it at the breed call (`index.ts:203-207`).**
  Replace `mutationRate: state.cfg.mutationRate` with `mutationRate: annealedRate(state.cfg.mutationRate, state.generation)`.
  (At this point `state.generation` is the generation that just *finished* — its survivors breed the next; gen-1 peak is correct.)

- [ ] **Step 3: Reframe the slider help in `schema.ts`** (`mutationRate.meta().help`) to: `'Chance each gene drifts when breeding, at generation 1 — the rate then cools over the next several generations so good cars stop being shaken apart and start fine-tuning. Low = calm; high = wild early search.'`

- [ ] **Step 4: Add a failing test in `index.test.ts`.**
```ts
import { annealedRate } from './index' // export it
it('mutation rate anneals from peak (gen 1) toward a lower floor', () => {
  const peak = 0.21
  expect(annealedRate(peak, 1)).toBeCloseTo(peak, 6)        // gen-1 = peak
  expect(annealedRate(peak, 9)).toBeCloseTo(peak * 0.25, 6) // by gen 9 = floor
  expect(annealedRate(peak, 5)).toBeLessThan(peak)          // monotonically cooling
  expect(annealedRate(peak, 5)).toBeGreaterThan(peak * 0.25)
})
```
  Export `annealedRate` from `index.ts` (add `export` to the function).

- [ ] **Step 5: Run index tests.**
  Run: `npx vitest run src/diversions/boxcar2d/index.test.ts`
  Expected: PASS — including the determinism keystone (self-consistency, unaffected) and the new annealing test.

- [ ] **Step 6: Commit.**
```bash
git add src/diversions/boxcar2d/index.ts src/diversions/boxcar2d/schema.ts src/diversions/boxcar2d/index.test.ts
git commit -m "feat(boxcar2d): anneal mutation rate wide→tight over generations"
```

---

### Task 4: Rubble default → 0 (`schema.ts`)

**Files:**
- Modify: `src/diversions/boxcar2d/schema.ts` (`rubbleDensity` default)
- Test: `src/diversions/boxcar2d/schema.test.ts`

- [ ] **Step 1: Change the default.** `rubbleDensity: z.number().min(0).max(8).default(0)` (was `.default(1)`). Update its help to note `0 = none (default)`.

- [ ] **Step 2: Update the schema test** (`schema.test.ts:19`): `expect(d.rubbleDensity).toBe(0)` and amend the comment.

- [ ] **Step 3: Run schema tests.**
  Run: `npx vitest run src/diversions/boxcar2d/schema.test.ts`
  Expected: PASS.

- [ ] **Step 4: Commit.**
```bash
git add src/diversions/boxcar2d/schema.ts src/diversions/boxcar2d/schema.test.ts
git commit -m "feat(boxcar2d): default rubble off (the measured gen-10 wall)"
```

---

### Task 5: Random seed on fresh load (framework)

**Files:**
- Modify: `src/framework/fieldMeta.ts` (meta flag), `src/framework/urlCodec.ts` (helper), `src/routes/PlayScreen.tsx`, `src/routes/ConfigScreen.tsx`, `src/diversions/boxcar2d/schema.ts` (opt-in flag)
- Test: `src/framework/urlCodec.test.ts`

**Interfaces:**
- Produces: `applyFreshLoadRandomization(schema, config, rand?)` → a new config with each `randomizeOnFreshLoad` field replaced by a random integer.

- [ ] **Step 1: Add the meta flag.** In `fieldMeta.ts`, add to `FieldMeta`: `randomizeOnFreshLoad?: boolean // numeric field: rolled to a random value on a bare load (empty query); share-links still pin it`.

- [ ] **Step 2: Add the helper to `urlCodec.ts`.**
```ts
import { readMeta } from './fieldMeta'
/** On a bare page load (empty query string), replace each field flagged
 *  randomizeOnFreshLoad with a fresh random integer. Share-links carry an
 *  explicit value so they reproduce; this only fires when there are NO params. */
export function applyFreshLoadRandomization<T extends ZodObject<any>>(
  schema: T, config: z.infer<T>, rand: () => number = Math.random,
): z.infer<T> {
  const out: any = { ...config }
  for (const [key, field] of Object.entries(schema.shape)) {
    if (readMeta(field as any)?.randomizeOnFreshLoad) out[key] = Math.floor(rand() * 1e9)
  }
  return out
}
```
  (Add `import { z } from 'zod'` / `ZodObject` if not already imported.)

- [ ] **Step 3: Wire PlayScreen.** Replace the `config` useMemo (`PlayScreen.tsx:18-24`):
```ts
const config = useMemo(() => {
  if (!diversion) return null
  const params = new URLSearchParams(search)
  const decoded = decodeConfig(diversion.schema, params)
  return [...params].length === 0
    ? applyFreshLoadRandomization(diversion.schema, decoded)
    : decoded
}, [diversion]) // eslint-disable-line react-hooks/exhaustive-deps
```
  And fix the copy-link href (`PlayScreen.tsx:53`) to encode the active config so a copied fresh-load link reproduces:
```ts
import { encodeConfig } from '../framework/urlCodec'
// …
<CopyLinkButton href={`/d/${diversion.id}/play?${encodeConfig(diversion.schema, config).toString()}`} className="play-copy" />
```

- [ ] **Step 4: Wire ConfigScreen.** In the `useState` initializer (`ConfigScreen.tsx:20-22`), apply the same roll on empty query:
```ts
const [config, setConfig] = useState(() => {
  if (!diversion) return null
  const params = new URLSearchParams(location.search)
  const decoded = decodeConfig(diversion.schema, params)
  return [...params].length === 0
    ? applyFreshLoadRandomization(diversion.schema, decoded)
    : decoded
})
```
  (ConfigScreen's `playHref`/copy already encode `config`, so no copy-link change needed there.)

- [ ] **Step 5: Opt boxcar2d in.** In `schema.ts`, add to the `seed` field meta: `randomizeOnFreshLoad: true`.

- [ ] **Step 6: Failing tests in `urlCodec.test.ts`.**
```ts
import { applyFreshLoadRandomization } from './urlCodec'
import { boxcar2dSchema } from '../diversions/boxcar2d/schema'
it('randomizes a flagged field on fresh load, leaves others', () => {
  const base = boxcar2dSchema.parse({})
  const rolled = applyFreshLoadRandomization(boxcar2dSchema, base, () => 0.5)
  expect(rolled.seed).toBe(Math.floor(0.5 * 1e9)) // flagged → rolled
  expect(rolled.population).toBe(base.population)  // unflagged → unchanged
  const other = applyFreshLoadRandomization(boxcar2dSchema, base, () => 0.9)
  expect(other.seed).not.toBe(rolled.seed)         // different rand → different seed
})
```

- [ ] **Step 7: Run framework tests.**
  Run: `npx vitest run src/framework/urlCodec.test.ts`
  Expected: PASS.

- [ ] **Step 8: Commit.**
```bash
git add src/framework/fieldMeta.ts src/framework/urlCodec.ts src/framework/urlCodec.test.ts src/routes/PlayScreen.tsx src/routes/ConfigScreen.tsx src/diversions/boxcar2d/schema.ts
git commit -m "feat: randomize seed on fresh load (share-links still pin a seed)"
```

---

### Task 6: Full suite + typecheck + headless re-measure

**Files:** none (verification)

- [ ] **Step 1: Full suite + typecheck + build.**
  Run: `npx vitest run` then `npx tsc --noEmit` then `npm run build`
  Expected: all green. Fix any fallout (e.g. presetSweep/codecSweep touching the new genome fields).

- [ ] **Step 2: Headless re-measure** (reuse the probe pattern from the empiricist; scratchpad harness drives `setup`/`frame` at `speed`-fast-forward, intercepts `state.scored`). Measure best-distance-per-gen for gens 1–12 across seeds 42, 7, 1234 with the new defaults (rubble 0).
  Expected/acceptance: a working car (≥300 m, ideally a 500 m finish) by ~gen 10 in ≥2 of 3 seeds, with an upward trend (not a single late jackpot). Record the curves in the commit message / handoff. If the bar is missed, STOP and report — do not silently tune balance numbers (sacrosanct).

- [ ] **Step 3: Commit** any test fixups (no code change if green):
```bash
git commit -am "test(boxcar2d): suite green after evolution rework" --allow-empty
```

---

### Task 7: Chrome verify (port 5180)

**Files:** none (verification)

- [ ] **Step 1: Start the dev server (background).** `npm run dev` (pinned 5180). Confirm the listening port.
- [ ] **Step 2: Open** `http://localhost:5180/d/boxcar2d/play?mute=1` in Chrome (chrome-devtools MCP). Watch gens 1–10.
- [ ] **Step 3: Assert visually:** junk→competent arc legible; a car clearly works by ~gen 10; visible body-plan variety (raked stances, varied node sizes); NO reintroduced jitter/wobble/buzz. Console clean.
- [ ] **Step 4: Edge check** — drive the config toward `suspensionDamping≈0.85` extremes is internal-only; instead spot-check a couple of fresh seeds (reload → different run confirms the fresh-load roll). Copy a link, open it in a new tab → same run reproduces.
- [ ] **Step 5:** Report findings to the user with the live URL; await manual user-verify before FF-merge.

---

### Task 8: Code review (required phase)

- [ ] **Step 1:** Dispatch fresh `diversion-reviewer` + `perf-analyzer` agents (no implementation bias) against the branch diff. Focus: determinism (no rng leak in breeding), the subassembly crossover correctness + repair compatibility, the widened-gene ranges vs the anti-jitter floors, per-frame allocations in `buildCar`, and the framework seed/copy-link change.
- [ ] **Step 2:** Triage findings; apply confirmed fixes (re-running affected tests). Re-verify in Chrome if any fix touches the sim.

---

## Self-Review

- **Spec coverage:** §3.1 subassembly crossover → Task 1; §3.2 annealed mutation → Task 3; §3.3 widen genome → Tasks 1 (genes) + 2 (physics wiring); §3.4 random seed → Task 5; §3.5 rubble → Task 4; §4 determinism/tests → Tasks 1/3/5 + Task 6; §7 verification → Tasks 6/7/8. No gaps.
- **Placeholder scan:** all steps carry concrete code/commands. ✓
- **Type consistency:** `annealedRate`, `applyFreshLoadRandomization`, the new `NodeGene`/`WheelGene`/`GenomeRanges` fields are named identically across tasks. ✓
- **Note:** the determinism keystone needs no fixture regen (self-consistency test) — the spec's "regenerate the fixture" line is moot; tasks reflect that.
