# Substrate Curvature (Circular Cracks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add curved cracks to the existing Substrate diversion via a straight/curved mix percentage plus a curve-radius range, producing swirling "circular Substrate" cells alongside the straight grid.

**Architecture:** One new `Crack.curvature` field (rad/step; 0 = straight) and one line in `advanceCrack` that rotates the heading before moving. A `rollCurvature(cfg, rng)` helper decides each crack's type/arc from its own RNG on seed and relocate. Collision, sand fill, and lifecycle are untouched — tight curves self-collide and stop.

**Tech Stack:** Vite + React 19 + TypeScript + Zod 4, Vitest. All changes in `src/diversions/substrate/{schema.ts,substrate.ts}` + co-located tests.

## Global Constraints

- **Additive to the existing Substrate diversion** — no new diversion folder, no new files. Only `schema.ts` and `substrate.ts` (+ their tests) change.
- **`STEP = 0.42`** is the existing exported crack-step constant; `curvature = ±STEP/radius` rad/step.
- **Per-crack RNG only:** `rollCurvature` consumes from the crack's own seeded stream; it must be called **last** in `seedCracks` / `findStart` (after x/y/angle/gain/color) so existing fields' RNG draws are unchanged. Determinism contract (same seed + cadence → identical buffer) must still hold.
- **Live-apply, not structural:** the three new fields ride in `updateSubstrateState`'s existing `state.cfg = cfg` copy (they are NOT added to the structural set `{initialCracks, maxCracks, seed, background}`), so no `update` change is needed — confirm, don't edit.
- **Sliders carry min/max/step** (UX invariant 4); `seed` stays last in the schema object. New leaf names `straightPct` / `minRadius` / `maxRadius` are unique (URL codec safe).
- **Defaults:** `straightPct 80`, `minRadius 25`, `maxRadius 400`.
- Tests: `npx vitest run src/diversions/substrate/`. Verify in Chrome (port 5180), never a built-in preview. Branch `feature/substrate-curvature` (already created). Terse commits, no trailers.

---

### Task 1: Schema fields (straightPct, minRadius, maxRadius)

**Files:**
- Modify: `src/diversions/substrate/schema.ts` (insert after `branchJitter`, before `drawTime`)
- Test: `src/diversions/substrate/schema.test.ts`

**Interfaces:**
- Produces: `SubstrateConfig` gains `straightPct: number`, `minRadius: number`, `maxRadius: number`.

- [ ] **Step 1: Add the three fields** after the `branchJitter` field in `schema.ts`:

```ts
  straightPct: z.number().int().min(0).max(100).default(80)
    .meta({ section: 'Growth', ui: 'slider', min: 0, max: 100, step: 1, label: 'Straight %',
            help: 'Share of cracks that grow straight; the rest curve along an arc. '
                + '100 = all straight (classic Substrate), 0 = all curved.' }),
  minRadius: z.number().int().min(10).max(400).default(25)
    .meta({ section: 'Growth', ui: 'slider', min: 10, max: 400, step: 5, label: 'Min curve radius',
            help: 'Tightest arc radius (px) a curved crack can take. Small = tight curls that loop into '
                + 'their own trail and stop.' }),
  maxRadius: z.number().int().min(20).max(800).default(400)
    .meta({ section: 'Growth', ui: 'slider', min: 20, max: 800, step: 5, label: 'Max curve radius',
            help: 'Loosest arc radius (px) a curved crack can take. Large = gentle, barely-there bends. '
                + '(If min exceeds max they are simply used as an unordered range.)' }),
```

- [ ] **Step 2: Extend the schema tests.** In `schema.test.ts`, add to the "parses with all defaults" block:

```ts
    expect(cfg.straightPct).toBe(80)
    expect(cfg.minRadius).toBe(25)
    expect(cfg.maxRadius).toBe(400)
```

and add to the "enforces ranges" block:

```ts
    expect(() => substrateSchema.parse({ straightPct: 101 })).toThrow()
    expect(() => substrateSchema.parse({ minRadius: 5 })).toThrow()
```

- [ ] **Step 3: Run the schema tests**

Run: `npx vitest run src/diversions/substrate/schema.test.ts`
Expected: PASS (the existing slider-bounds test auto-covers the three new sliders; the default-and-range assertions pass).

- [ ] **Step 4: Commit**

```bash
git add src/diversions/substrate/schema.ts src/diversions/substrate/schema.test.ts
git commit -m "substrate: straightPct + min/max curve radius schema fields"
```

---

### Task 2: Curvature engine (roll + heading integration)

**Files:**
- Modify: `src/diversions/substrate/substrate.ts`
- Test: `src/diversions/substrate/substrate.test.ts`

**Interfaces:**
- Consumes: `STEP`, `mulberry32`, `SubstrateConfig`, `createSubstrateState`, `advanceCrack` (existing).
- Produces: `Crack` gains `curvature: number`; new exported `rollCurvature(cfg: SubstrateConfig, rng: () => number) => number`.

- [ ] **Step 1: Write the failing tests.** Append to `substrate.test.ts` (add `STEP`, `rollCurvature` to the existing import from `./substrate`):

```ts
describe('rollCurvature', () => {
  it('is always 0 at straightPct 100 and never 0 at straightPct 0', () => {
    const rngA = mulberry32(1), rngB = mulberry32(2)
    for (let i = 0; i < 60; i++) expect(rollCurvature(cfg({ straightPct: 100 }), rngA)).toBe(0)
    for (let i = 0; i < 60; i++) expect(rollCurvature(cfg({ straightPct: 0 }), rngB)).not.toBe(0)
  })

  it('curved magnitude stays within [STEP/maxR, STEP/minR] and both signs occur', () => {
    const c = cfg({ straightPct: 0, minRadius: 25, maxRadius: 400 })
    const rng = mulberry32(3)
    let pos = false, neg = false
    for (let i = 0; i < 300; i++) {
      const k = rollCurvature(c, rng)
      const mag = Math.abs(k)
      expect(mag).toBeGreaterThanOrEqual(STEP / 400 - 1e-9)
      expect(mag).toBeLessThanOrEqual(STEP / 25 + 1e-9)
      if (k > 0) pos = true
      if (k < 0) neg = true
    }
    expect(pos && neg).toBe(true)
  })

  it('treats minRadius > maxRadius as an unordered range (no crash)', () => {
    const c = cfg({ straightPct: 0, minRadius: 400, maxRadius: 25 })
    const rng = mulberry32(5)
    for (let i = 0; i < 100; i++) {
      const mag = Math.abs(rollCurvature(c, rng))
      expect(mag).toBeGreaterThanOrEqual(STEP / 400 - 1e-9)
      expect(mag).toBeLessThanOrEqual(STEP / 25 + 1e-9)
    }
  })

  it('is roughly half straight at straightPct 50', () => {
    const c = cfg({ straightPct: 50 })
    const rng = mulberry32(7)
    let straight = 0
    const N = 2000
    for (let i = 0; i < N; i++) if (rollCurvature(c, rng) === 0) straight++
    expect(straight / N).toBeGreaterThan(0.4)
    expect(straight / N).toBeLessThan(0.6)
  })
})

describe('advanceCrack curvature', () => {
  it('rotates the heading by curvature each step; 0 holds the heading', () => {
    const s = createSubstrateState(cfg({ straightPct: 100 }), 200, 200)
    const c = s.cracks[0]
    c.x = 100; c.y = 100; c.angle = 0; c.curvature = 0; c.alive = true
    advanceCrack(s, c)
    expect(c.angle).toBe(0)                     // straight: heading unchanged
    c.x = 100; c.y = 100; c.angle = 0; c.curvature = 0.01; c.alive = true
    advanceCrack(s, c)
    expect(c.angle).toBeCloseTo(0.01)           // curved: heading bent by curvature
  })
})

describe('seeded cracks carry a curvature', () => {
  it('assigns curvature 0 to every crack when straightPct is 100', () => {
    const s = createSubstrateState(cfg({ straightPct: 100, initialCracks: 6 }), 100, 100)
    for (const c of s.cracks) expect(c.curvature).toBe(0)
  })
  it('assigns nonzero curvature to every crack when straightPct is 0', () => {
    const s = createSubstrateState(cfg({ straightPct: 0, initialCracks: 6 }), 100, 100)
    for (const c of s.cracks) expect(c.curvature).not.toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'rollCurvature|advanceCrack curvature|seeded cracks carry'`
Expected: FAIL — `rollCurvature` not exported; `c.curvature` undefined.

- [ ] **Step 3: Implement.** Four edits in `substrate.ts`:

(a) Add `curvature` to the `Crack` interface (after `gain`):

```ts
export interface Crack {
  x: number; y: number      // float head position (CSS px)
  angle: number             // heading, radians
  gain: number              // sand-painter gain, random-walks in ±SAND_MAXG
  curvature: number         // heading rotation per step (rad); 0 = straight
  color: RGBA               // wash colour for this crack's current life
  alive: boolean
  rng: () => number         // this crack's own seeded stream
}
```

(b) Add the `rollCurvature` helper (place it just above `seedCracks`):

```ts
/** Per-crack curvature (rad/step) from its own RNG: 0 for a straight crack
 *  (probability straightPct/100), else ±STEP/radius with radius uniform across
 *  the [minRadius,maxRadius] band (order-insensitive) and a random direction. */
export function rollCurvature(cfg: SubstrateConfig, rng: () => number): number {
  if (rng() < cfg.straightPct / 100) return 0
  const lo = Math.min(cfg.minRadius, cfg.maxRadius)
  const hi = Math.max(cfg.minRadius, cfg.maxRadius)
  const radius = lo + rng() * (hi - lo)
  const dir = rng() < 0.5 ? 1 : -1
  return (dir * STEP) / Math.max(1, radius)
}
```

(c) Assign curvature **last** in `seedCracks` (after `color`) and in `findStart` (after the `cr.color = ...` line), and add the placeholder to `makeCrack`'s literal.

In `seedCracks`, change the returned object build:

```ts
    const color = pickColor(cfg, palette, x, y, w, h, rng)
    const curvature = rollCurvature(cfg, rng)
    return { x, y, angle, gain, curvature, color, alive: true, rng }
```

In `findStart`, after `cr.color = pickColor(cfg, palette, cr.x, cr.y, w, h, cr.rng)`:

```ts
  cr.color = pickColor(cfg, palette, cr.x, cr.y, w, h, cr.rng)
  cr.curvature = rollCurvature(cfg, cr.rng)
  cr.alive = true
```

In `makeCrack`'s literal, add `curvature: 0` (overwritten by its `findStart`):

```ts
  const cr: Crack = {
    x: 0, y: 0, angle: 0, gain: 0.05, curvature: 0,
    color: state.palette[0], alive: false,
    rng: mulberry32(seedFor(base, state.cracks.length + 1)),
  }
```

(d) Rotate the heading in `advanceCrack` — add as the **first** line of the body, before the `cr.x += ...`:

```ts
export function advanceCrack(state: SubstrateState, cr: Crack): void {
  const { grid, buf, w, h, crackC } = state
  cr.angle += cr.curvature // curve the heading (0 for straight cracks)
  cr.x += STEP * Math.cos(cr.angle)
  cr.y += STEP * Math.sin(cr.angle)
```

- [ ] **Step 4: Run the new tests, then the full substrate suite**

Run: `npx vitest run src/diversions/substrate/substrate.test.ts -t 'rollCurvature|advanceCrack curvature|seeded cracks carry'`
Expected: PASS.

Run: `npx vitest run src/diversions/substrate/`
Expected: all PASS — including the existing determinism tests (both instances roll curvature identically).

- [ ] **Step 5: Commit**

```bash
git add src/diversions/substrate/substrate.ts src/diversions/substrate/substrate.test.ts
git commit -m "substrate: curved cracks — rollCurvature + heading integration (#50)"
```

---

## Self-Review

**Spec coverage:**
- Mix model (single `straightPct`, complementary) → Task 1 schema + Task 2 `rollCurvature`. ✓
- Per-crack curved radius range + random direction → `rollCurvature` (unordered min/max, `dir = ±1`). ✓
- `Crack.curvature` + `advanceCrack` heading rotation → Task 2 (a)(d). ✓
- Roll on seed AND relocate via own RNG, last → Task 2 (c). ✓
- Live-apply (no structural change) → Global Constraints (confirm `updateSubstrateState` untouched). ✓
- Determinism preserved → Task 2 Step 4 full-suite run. ✓
- Schema sliders + unique leaf names + defaults → Task 1. ✓
- Testing list (mix split, magnitude/sign, unordered radius, heading integration, determinism, schema) → Tasks 1–2. ✓

**Placeholder scan:** none — every step shows exact code and exact commands.

**Type consistency:** `rollCurvature(cfg, rng) => number` used identically in tests and impl; `Crack.curvature: number` defined in (a), consumed in (c)(d); `straightPct/minRadius/maxRadius` names match across schema, helper, and tests.

## Execution Handoff

Tiny, tightly-coupled, single-file change in code I just authored → **inline execution** (subagent hand-off would cost more in context than the edits save). Tasks 1–2 inline with TDD, then Chrome verify (port 5180), a fresh `diversion-reviewer`, and the user-verify gate before FF-merge + deploy.
