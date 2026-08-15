# Ablation Circulating Fleet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Ablation's disposable lasers into a permanent circulating crew of turrets that rotate through shifts, add a Unison targeting mode where the whole crew hunts one exposed colour at a time, and make even spacing the default.

**Architecture:** A fixed-size fleet of `Turret` objects lives in exactly one of three arrays on state — `track`, `queue`, `retired` — and moves between them. Rotation triggers are unchanged (charge out / blank lap / lap cap, all evaluated at a gate crossing); only the destination changes, from destruction to the back of the queue at full charge. Colour assignment moves out of per-mint sampling into either a picture-start allocation proportional to the whole map (Mixed) or a single engine-held lock (Unison).

**Tech Stack:** TypeScript, Zod 4 schema, Vitest, Canvas 2D. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-15-ablation-fleet-design.md`
**Issues:** #283 (parent), #281 (even spacing), #282 (unison) — all three close with this branch.
**Branch:** `feature/ablation-fleet` (already created; the spec commit is on it).

## Global Constraints

- **Every band gets at least one turret.** Nothing but a turret tuned to band *b* ever destroys a cell of band *b*, so a band with zero turrets survives forever and the piece hangs permanently. `resolveFleet` clamps the fleet up to the band count and `allocateFleet` reserves one per band before distributing the rest. This is correctness, not balance.
- **No schema field-name changes.** Labels, help text, sections and the code's own identifiers may all change; the keys the URL codec emits may not, except for the removed `arrivalRate` and the two new fields. `urlKeys.test.ts` and `seedContract.test.ts` must stay green.
- **`z.enum`, never a TS `enum`.** `erasableSyntaxOnly` is on; TS enums fail with TS1294.
- **Every non-obvious schema field carries persistent `.meta({ help })`** (UX invariant #3).
- **Every option in a `PresetGroup` patches the identical key-set**, or `matchPresets` cannot detect drift.
- **Gates before any merge:** `npm test`, `npx tsc -b --noEmit`, `npm run lint`, all green.
- **Commit messages:** terse one-line subject, no trailers, no `Co-Authored-By`.

---

### Task 1: Rename lasers → turrets (mechanical, zero behaviour change)

The vocabulary change is the reason this is first: every later task touches these files, and doing the rename afterwards would bury the behavioural diff in noise.

**Files:**
- Rename: `src/diversions/ablation/lasers.ts` → `src/diversions/ablation/turrets.ts`
- Rename: `src/diversions/ablation/lasers.test.ts` → `src/diversions/ablation/turrets.test.ts`
- Modify: `src/diversions/ablation/ablation.ts`, `render.ts`, `schema.ts`, `index.ts`, `ablation.test.ts`, `render.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `turrets.ts` exporting `Turret` (was `Laser`), `makeTurret` (was `makeLaser`), and the unchanged `Geom`, `TrackPoint`, `makeGeom`, `trackPoint`, `advance`. `AblationState.track` replaces `AblationState.lasers`.

- [ ] **Step 1: Rename the two files with git so history follows**

```bash
cd /Users/matt/dev/MattAltermatt/diversion
git mv src/diversions/ablation/lasers.ts src/diversions/ablation/turrets.ts
git mv src/diversions/ablation/lasers.test.ts src/diversions/ablation/turrets.test.ts
```

- [ ] **Step 2: Rename the identifiers**

In `turrets.ts`: `export interface Laser` → `export interface Turret`; `export function makeLaser` → `export function makeTurret`; every `l: Laser` parameter type follows. In the file's header comment and in `advance`'s doc comment, replace the word "laser" with "turret" throughout.

In `ablation.ts`: `import { ..., makeLaser, ..., type Laser }` → `makeTurret`, `type Turret`; `lasers: Laser[]` → `track: Turret[]`; every `s.lasers` → `s.track`.

In `render.ts`: `import { trackPoint } from './lasers'` → `'./turrets'`; `for (const l of s.lasers)` → `s.track`.

In the test files: update imports and any `state.lasers` reads.

- [ ] **Step 3: Rename the user-facing labels in `schema.ts`**

Three edits, all inside `.meta({...})` — none of them touch a field name, so the codec is unaffected:

```ts
// every field currently in section 'Lasers'
section: 'Turrets',

// capacity
label: 'Turrets on track',

// capacity help — first sentence
help: 'How many turrets ride the track at the same time. The rest of the fleet '
    + 'waits in the queue outside the gate until a slot frees. Set it to 2 with '
    + 'Spacing at 1 for a pair working exactly opposite each other.',
```

- [ ] **Step 4: Update the description and header comment in `index.ts`**

```ts
description: 'Turrets ride a track and peel a contour map, one colour at a time.',
```

and the block comment above `defineDiversion`, replacing "lasers"/"a laser" with "turrets"/"a turret".

- [ ] **Step 5: Verify nothing behavioural moved**

```bash
grep -rin "laser" src/diversions/ablation/ ; echo "--- exit $?"
npx vitest run src/diversions/ablation
npx tsc -b --noEmit
```

Expected: the grep prints nothing, all Ablation tests pass unchanged (no test assertions should have needed editing beyond identifier names), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add -A src/diversions/ablation
git commit -m "Ablation: rename lasers to turrets throughout"
```

---

### Task 2: `resolveFleet` and `allocateFleet` in the scheduler

Pure functions, no state, TDD. This is the task that carries the anti-deadlock floor.

**Files:**
- Modify: `src/diversions/ablation/scheduler.ts`
- Test: `src/diversions/ablation/scheduler.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `resolveFleet(fleet: number, bands: number): number` — the fleet size actually used.
  - `allocateFleet(total: Uint32Array, k: number, fleetSize: number): Uint32Array` — turret count per band, summing exactly to `fleetSize`.
  - `temperedPick` and `temperedWeights` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/diversions/ablation/scheduler.test.ts`:

```ts
import { resolveFleet, allocateFleet } from './scheduler'

describe('resolveFleet', () => {
  it('leaves a fleet larger than the band count alone', () => {
    expect(resolveFleet(20, 6)).toBe(20)
  })

  it('clamps UP to the band count, so no band can go unallocated', () => {
    expect(resolveFleet(4, 12)).toBe(12)
  })
})

describe('allocateFleet', () => {
  const total = (...v: number[]) => Uint32Array.from(v)

  it('sums to exactly the fleet size', () => {
    const a = allocateFleet(total(5000, 3000, 1500, 500), 1, 20)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(20)
  })

  it('is proportional to band mass at k = 1', () => {
    // 50/50 in the picture means 50/50 of the turrets — the headline requirement.
    expect([...allocateFleet(total(4000, 4000), 1, 20)]).toEqual([10, 10])
    expect([...allocateFleet(total(6000, 2000), 1, 20)]).toEqual([15, 5])
  })

  it('is flat across bands at k = 0', () => {
    expect([...allocateFleet(total(9000, 900, 90), 0, 12)]).toEqual([4, 4, 4])
  })

  it('piles onto the dominant band above k = 1', () => {
    const a = allocateFleet(total(6000, 2000), 2, 20)
    expect(a[0]).toBeGreaterThan(15)
    expect(a[1]).toBeGreaterThanOrEqual(1)
  })

  it('gives a rounding-sliver band at least one turret', () => {
    // 1 cell out of 8001 is 0.0025 of 20 turrets — it must still get one.
    const a = allocateFleet(total(8000, 1), 1, 20)
    expect(a[1]).toBe(1)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(20)
  })

  it('gives every band one turret when the fleet equals the band count', () => {
    const a = allocateFleet(total(500, 400, 300, 200, 100, 50), 1, 6)
    expect([...a]).toEqual([1, 1, 1, 1, 1, 1])
  })

  it('allocates nothing to a band with no cells', () => {
    const a = allocateFleet(total(500, 0, 300), 1, 9)
    expect(a[1]).toBe(0)
    expect([...a].reduce((x, y) => x + y, 0)).toBe(9)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/diversions/ablation/scheduler.test.ts
```

Expected: FAIL — `resolveFleet is not a function` / `allocateFleet is not a function`.

- [ ] **Step 3: Implement both functions**

Append to `src/diversions/ablation/scheduler.ts`:

```ts
/** The fleet size actually used. A band with no turret tuned to it is never
 *  destroyed, so the picture could never reach zero cells and the piece would hang
 *  permanently — the clamp is therefore a correctness requirement, not balance.
 *  It cannot live on the slider's `min`, because it depends on `palette.length`,
 *  a different field; it is resolved here where both are visible. */
export function resolveFleet(fleet: number, bands: number): number {
  return Math.max(fleet, bands)
}

/** Distributes `fleetSize` turrets across bands in proportion to `total[band]^k`,
 *  by LARGEST REMAINDER so the counts sum exactly. Every band holding at least one
 *  cell is reserved a turret first (see `resolveFleet`); the rest is shared out.
 *
 *  `k` is the same Targeting bias the Unison lock draw uses: 0 gives every band an
 *  equal crew regardless of mass, 1 is strictly proportional (50% of the map blue
 *  means 50% of the turrets blue), above 1 piles onto the biggest band. */
export function allocateFleet(total: Uint32Array, k: number, fleetSize: number): Uint32Array {
  const n = total.length
  const out = new Uint32Array(n)
  const live: number[] = []
  for (let i = 0; i < n; i++) if (total[i] > 0) live.push(i)
  if (live.length === 0) return out

  // Reserve one per live band, then share the remainder proportionally. If the
  // fleet cannot even cover one each, hand them out to the biggest bands first —
  // `resolveFleet` makes that unreachable from the running piece, but a direct
  // caller must not get a silently over-allocated fleet.
  if (fleetSize <= live.length) {
    const byMass = [...live].sort((a, b) => total[b] - total[a])
    for (let i = 0; i < fleetSize; i++) out[byMass[i]] = 1
    return out
  }
  for (const i of live) out[i] = 1
  let rest = fleetSize - live.length

  const w = temperedWeights(total, k)
  let wsum = 0
  for (const i of live) wsum += w[i]
  const rem: { band: number; frac: number }[] = []
  for (const i of live) {
    const share = wsum > 0 ? (w[i] / wsum) * rest : rest / live.length
    const whole = Math.floor(share)
    out[i] += whole
    rem.push({ band: i, frac: share - whole })
  }
  let placed = 0
  for (const i of live) placed += out[i]
  let left = fleetSize - placed
  // Largest remainder wins the leftovers; ties break toward the earlier band so
  // the result is deterministic and testable.
  rem.sort((a, b) => b.frac - a.frac || a.band - b.band)
  for (let i = 0; left > 0; i = (i + 1) % rem.length, left--) out[rem[i].band]++
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/diversions/ablation/scheduler.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Mutation-check the floor**

Temporarily change `for (const i of live) out[i] = 1` to `for (const i of live) out[i] = 0` and re-run. The rounding-sliver test MUST fail. Restore the line and re-run to green. A guard that passes against a broken build is not a guard.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/ablation/scheduler.ts src/diversions/ablation/scheduler.test.ts
git commit -m "Ablation: allocate a fleet across bands by largest remainder"
```

---

### Task 3: Schema and presets

**Files:**
- Modify: `src/diversions/ablation/schema.ts`, `src/diversions/ablation/presets.ts`
- Test: `src/diversions/ablation/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AblationConfig` gains `fleet: number` and `targeting: 'Mixed' | 'Unison'`, and loses `arrivalRate`. Later tasks read `cfg.fleet`, `cfg.targeting`.

- [ ] **Step 1: Write the failing tests**

Append to `src/diversions/ablation/schema.test.ts`:

```ts
it('defaults to an evenly spread crew hunting proportionally', () => {
  const d = ablationSchema.parse({})
  expect(d.spacing).toBe(1)
  expect(d.targetingBias).toBe(1)
  expect(d.targeting).toBe('Mixed')
  expect(d.fleet).toBeGreaterThan(d.capacity)
})

it('has no arrivalRate field', () => {
  expect(Object.keys(ablationSchema.shape)).not.toContain('arrivalRate')
})

it('rejects an unknown targeting mode', () => {
  expect(ablationSchema.safeParse({ targeting: 'Frenzy' }).success).toBe(false)
})

it('gives every Demolition option the identical key-set', () => {
  const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
  const keys = demolition.options.map((o) => Object.keys(o.patch).sort().join(','))
  expect(new Set(keys).size).toBe(1)
})

it('offers a Unison option in the Demolition group', () => {
  const demolition = ablationPresets.find((g) => g.label === 'Demolition')!
  expect(demolition.options.some((o) => o.patch.targeting === 'Unison')).toBe(true)
})
```

Add `import { ablationPresets } from './presets'` at the top if it is not already there.

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/diversions/ablation/schema.test.ts
```

Expected: FAIL — `targeting` is undefined, `spacing` is 0, `targetingBias` is 0.5.

- [ ] **Step 3: Edit `schema.ts`**

Replace the whole `arrivalRate` field with `fleet`, add `targeting`, and change two defaults. Every field currently carrying `section: 'Lasers'` already became `'Turrets'` in Task 1.

```ts
  fleet: z.number().int().min(2).max(128).default(20)
    .meta({ section: 'Turrets', ui: 'slider', min: 2, max: 128, step: 1, label: 'Fleet',
            help: 'How many turrets exist in total. They are never used up — a turret '
                + 'rides a shift, rotates out at the gate, recharges and queues for '
                + 'another. Anything beyond "Turrets on track" waits in the queue, so '
                + 'a fleet larger than the track is what gives you a queue to read. '
                + 'Raised automatically if it is smaller than the number of colours, '
                + 'since every colour needs at least one turret hunting it.' }),
  targeting: z.enum(['Mixed', 'Unison']).default('Mixed')
    .meta({ section: 'Turrets', ui: 'select', label: 'Targeting',
            options: [
              { value: 'Mixed', label: 'Mixed' },
              { value: 'Unison', label: 'Unison' },
            ],
            help: 'Mixed gives the fleet a fixed colour mix matching the picture, so '
                + 'every band is worked at once and the map dissolves evenly. Unison '
                + 'locks the whole crew onto ONE colour until it is gone from the '
                + 'outside edge, then picks another — the map peels a band at a time. '
                + 'A crew converts as its turrets rotate, so a switch shows up in the '
                + 'queue before it reaches the track.' }),
```

Then:

```ts
  spacing: z.number().min(0).max(1).default(1)      // was .default(0)
  targetingBias: z.number().min(0).max(3).default(1) // was .default(0.5)
```

and rewrite `targetingBias`'s help, since its subject changed:

```ts
            help: 'How the fleet is shared out. 0 gives every colour the same number '
                + 'of turrets whatever its share of the picture; 1 is strictly '
                + 'proportional, so a map that is half blue gets a crew that is half '
                + 'blue; above 1 the crew piles onto whatever covers the most ground. '
                + 'In Unison it weights which colour the crew locks onto next.',
```

and `charge`'s, since it is now a shift length rather than a life span:

```ts
            help: 'How many cells one turret destroys before its shift ends. It then '
                + 'rotates out at the gate, recharges to full and rejoins the back of '
                + 'the queue. Brightness on the track is charge remaining, so a turret '
                + 'dims visibly as its shift runs down.',
```

Check `ui: 'select'` against a sibling diversion before writing it — grep `ui: 'select'` under `src/diversions/` and copy whichever `options` shape `SchemaForm` actually consumes.

- [ ] **Step 4: Edit `presets.ts`**

Every Demolition option must carry the identical key-set: `capacity, fleet, charge, speed, targetingBias, spacing, targeting`. `arrivalRate` is gone. `Focused` is renamed — with a `Targeting` control now sitting in the same section, an option called "Focused" reads as a mode name and invites exactly the wrong inference.

```ts
  {
    label: 'Demolition',
    options: [
      { name: 'Patient',    patch: { capacity: 5,  fleet: 9,   charge: 30,  speed: 70,  targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Steady',     patch: { capacity: 12, fleet: 20,  charge: 60,  speed: 140, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Sentinels',  patch: { capacity: 2,  fleet: 6,   charge: 90,  speed: 90,  targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Ring',       patch: { capacity: 16, fleet: 26,  charge: 50,  speed: 120, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Swarm',      patch: { capacity: 40, fleet: 64,  charge: 45,  speed: 200, targetingBias: 1,   spacing: 1, targeting: 'Mixed'  } },
      { name: 'Relentless', patch: { capacity: 14, fleet: 24,  charge: 120, speed: 160, targetingBias: 2.2, spacing: 1, targeting: 'Mixed'  } },
      { name: 'Strip Mine', patch: { capacity: 14, fleet: 22,  charge: 70,  speed: 150, targetingBias: 1,   spacing: 1, targeting: 'Unison' } },
    ],
  },
```

Update the file's header comment: "laser-swarm feel" → "turret-crew feel".

- [ ] **Step 5: Run the tests**

```bash
npx vitest run src/diversions/ablation
npx tsc -b --noEmit
```

Expected: schema tests PASS. `ablation.ts` will now fail to typecheck on `cfg.arrivalRate` — that is expected and Task 4 fixes it. If `ablation.test.ts` constructs configs literally it will need `fleet`/`targeting` added; do that now.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/ablation/schema.ts src/diversions/ablation/presets.ts src/diversions/ablation/schema.test.ts
git commit -m "Ablation: add Fleet and Targeting, drop arrival rate"
```

---

### Task 4: The circulating fleet

The core of the change. `ablation.ts` stops minting and starts rotating.

**Files:**
- Modify: `src/diversions/ablation/ablation.ts`, `src/diversions/ablation/turrets.ts`
- Test: `src/diversions/ablation/ablation.test.ts`

**Interfaces:**
- Consumes: `resolveFleet`, `allocateFleet` (Task 2); `cfg.fleet`, `cfg.targeting` (Task 3).
- Produces: `AblationState` gains `track: Turret[]`, `queue: Turret[]`, `retired: Turret[]`, `bandAlive: Uint32Array`, `lockBand: number`, and loses `lasers`, `arrivalDebt`, `minted`. `Turret` gains `jitter: number`. `turrets.ts` exports `resetTurret(t: Turret, charge: number): void`.

- [ ] **Step 1: Write the failing tests**

Append to `src/diversions/ablation/ablation.test.ts`. Reuse whatever config/step helpers the file already has; if it builds configs via `ablationSchema.parse({...})`, keep doing that.

```ts
const cfgOf = (over: Partial<AblationConfig> = {}) => ablationSchema.parse(over)
const SIZE = { width: 900, height: 620 }
/** Steps a fixed number of simulated seconds in 60fps slices. */
const run = (s: AblationState, seconds: number) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) step(s, 1 / 60)
}

describe('the circulating fleet', () => {
  it('crews the whole fleet into the queue at picture start', () => {
    const cfg = cfgOf({ fleet: 20, capacity: 12 })
    const s = createState(cfg, SIZE)
    expect(s.track.length).toBe(0)
    expect(s.queue.length).toBe(20)
    expect(s.retired.length).toBe(0)
  })

  it('raises a fleet smaller than the number of colours', () => {
    const cfg = cfgOf({ fleet: 2, palette: ['#111111', '#333333', '#555555', '#777777'] })
    const s = createState(cfg, SIZE)
    expect(s.queue.length).toBe(4)
  })

  it('gives every band at least one turret', () => {
    const cfg = cfgOf({ fleet: 8 })
    const s = createState(cfg, SIZE)
    const per = new Uint32Array(cfg.palette.length)
    for (const t of s.queue) per[t.band]++
    expect([...per].every((c) => c >= 1)).toBe(true)
  })

  it('interleaves colours in the queue rather than releasing one band first', () => {
    const cfg = cfgOf({ fleet: 24 })
    const s = createState(cfg, SIZE)
    const firstSix = s.queue.slice(0, 6).map((t) => t.band)
    expect(new Set(firstSix).size).toBeGreaterThan(1)
  })

  it('holds the headcount invariant across a long run', () => {
    const cfg = cfgOf({ fleet: 20, capacity: 12, speed: 400, charge: 8, cellSize: 20 })
    const s = createState(cfg, SIZE)
    const expected = s.track.length + s.queue.length + s.retired.length
    for (let i = 0; i < 60 * 60; i++) {
      step(s, 1 / 60)
      const n = s.track.length + s.queue.length + s.retired.length
      if (n !== expected && s.pictures === 0) throw new Error(`headcount ${n} != ${expected}`)
      if (s.pictures > 0) break
    }
  })

  it('returns a spent turret to the BACK of the queue at full charge', () => {
    const cfg = cfgOf({ fleet: 20, capacity: 4, speed: 400, charge: 3, cellSize: 20 })
    const s = createState(cfg, SIZE)
    run(s, 45)
    // Someone has rotated by now, and nothing on the track or in the queue is
    // carrying a partly-used charge from a previous shift's leftovers.
    expect(s.queue.some((t) => t.charge === cfg.charge)).toBe(true)
    for (const t of s.queue) expect(t.charge).toBe(cfg.charge)
  })

  it('releases turrets only at the gate', () => {
    const cfg = cfgOf({ fleet: 20, capacity: 12, speed: 300, cellSize: 20 })
    const s = createState(cfg, SIZE)
    for (let i = 0; i < 600; i++) {
      const before = new Set(s.track)
      step(s, 1 / 60)
      for (const t of s.track) {
        // A turret that was not on the track last frame must be within one frame's
        // travel of the gate — never dropped in mid-track.
        if (!before.has(t)) expect(t.s).toBeLessThan(s.geom.cell + 300 / 60)
      }
    }
  })

  it('retires a turret whose band is extinct, and never one merely unexposed', () => {
    const cfg = cfgOf({ fleet: 20, capacity: 12, speed: 500, charge: 40, cellSize: 20 })
    const s = createState(cfg, SIZE)
    for (let i = 0; i < 60 * 240 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      for (const t of s.retired) expect(s.bandAlive[t.band]).toBe(0)
    }
  })
})

describe('no deadlock', () => {
  it('reaches zero cells with the fleet clamped to one turret per band', () => {
    const cfg = cfgOf({ fleet: 2, capacity: 8, speed: 600, charge: 200, cellSize: 24 })
    const s = createState(cfg, SIZE)
    for (let i = 0; i < 60 * 900 && s.field.aliveCount > 0; i++) step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(0)
  })

  it('re-crews the whole fleet for the next picture', () => {
    const cfg = cfgOf({ fleet: 14, capacity: 8, speed: 600, charge: 200, cellSize: 24 })
    const s = createState(cfg, SIZE)
    for (let i = 0; i < 60 * 1200 && s.pictures === 0; i++) step(s, 1 / 60)
    expect(s.pictures).toBe(1)
    expect(s.retired.length).toBe(0)
    expect(s.track.length + s.queue.length).toBe(14)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/diversions/ablation/ablation.test.ts
```

Expected: FAIL — `s.track` / `s.queue` shapes do not exist yet and `cfg.arrivalRate` no longer typechecks.

- [ ] **Step 3: Add `jitter` and `resetTurret` to `turrets.ts`**

```ts
export interface Turret {
  /** perimeter position */
  s: number
  /** target palette index */
  band: number
  charge: number
  maxCharge: number
  laps: number
  edge: Edge
  lane: number
  armed: boolean
  spent: boolean
  hitThisLap: boolean
  /** fixed sub-cell entry offset, unique per turret. Two turrets released at an
   *  IDENTICAL `s` are welded together for life — same lane, same centre crossing,
   *  every frame — and double-strike every lane, breaking the one-shot-per-lane
   *  rule. It is smaller than a cell, so it never disturbs the formation. Fixed
   *  per turret rather than per release, so a rotation does not reshuffle it. */
  jitter: number
}

export function makeTurret(band: number, jitter: number, charge: number): Turret {
  const t: Turret = { s: 0, band, charge, maxCharge: charge, laps: 0, edge: EDGE.top,
                      lane: -1, armed: false, spent: false, hitThisLap: false, jitter }
  resetTurret(t, charge)
  return t
}

/** Puts a turret back at the gate at full charge, ready for another shift. Called
 *  when the fleet is crewed and again on every rotation. `band` and `jitter` are
 *  deliberately NOT touched — the caller owns colour policy. */
export function resetTurret(t: Turret, charge: number): void {
  t.s = t.jitter
  t.charge = charge
  t.maxCharge = charge
  t.laps = 0
  t.edge = EDGE.top
  t.lane = -1
  t.armed = false
  t.spent = false
  t.hitThisLap = false
}
```

- [ ] **Step 4: Rebuild the state shape in `ablation.ts`**

Replace the `lasers` / `arrivalDebt` / `minted` fields:

```ts
export interface AblationState {
  cfg: AblationConfig
  geom: Geom
  field: Field
  front: Front
  /** turrets riding right now */
  track: Turret[]
  /** turrets waiting at the gate, FIFO, all at full charge */
  queue: Turret[]
  /** turrets whose colour is gone for this picture */
  retired: Turret[]
  /** alive cells per band — maintained incrementally; a full recount is O(cells) */
  bandAlive: Uint32Array
  /** the colour the whole crew is hunting in Unison mode; -1 in Mixed */
  lockBand: number
  dying: Dying[]
  bolts: Bolt[]
  hist: Uint32Array
  rand: () => number
  pictures: number
  gateClear: number
  patches: number[]
  buffer: HTMLCanvasElement | null
  size: Size
}
```

Add the crew routine:

```ts
const PHI = 0.618033988749895

/** Builds the fleet for the picture now in `s.field` and puts all of it in the
 *  queue. Colour is allocated in proportion to the WHOLE picture rather than to
 *  what is currently exposed: 50% of the map blue means 50% of the turrets blue.
 *  Measured over 5 seeds at 6 and 12 bands, every band is exposed at picture start,
 *  so a whole-picture allocation never leaves a turret with nothing to shoot. */
function crew(s: AblationState): void {
  const bands = s.field.bands
  const total = new Uint32Array(bands)
  for (let i = 0; i < s.field.idx.length; i++) total[s.field.idx[i]]++
  s.bandAlive = total.slice()

  const size = resolveFleet(s.cfg.fleet, bands)
  const alloc = allocateFleet(total, s.cfg.targetingBias, size)

  s.track.length = 0
  s.queue.length = 0
  s.retired.length = 0
  let n = 0
  for (let b = 0; b < bands; b++) {
    for (let i = 0; i < alloc[b]; i++) {
      n++
      s.queue.push(makeTurret(b, ((n * PHI) % 1) * s.geom.cell, s.cfg.charge))
    }
  }
  // Shuffle, or the gate releases every turret of band 0 before any of band 1 and
  // the first minutes of a picture are monochrome.
  for (let i = s.queue.length - 1; i > 0; i--) {
    const j = Math.floor(s.rand() * (i + 1))
    ;[s.queue[i], s.queue[j]] = [s.queue[j], s.queue[i]]
  }
  s.gateClear = 0
  s.lockBand = -1
}
```

Add rotation:

```ts
/** A turret leaving the track. It is never destroyed: it goes back to the gate at
 *  full charge and joins the BACK of the queue — or the retired row if the colour
 *  it hunts no longer exists anywhere in this picture. */
function rotate(s: AblationState, t: Turret): void {
  resetTurret(t, s.cfg.charge)
  if (s.cfg.targeting === 'Unison' && s.lockBand >= 0) t.band = s.lockBand
  if (s.bandAlive[t.band] === 0) s.retired.push(t)
  else s.queue.push(t)
}
```

In `createState`, initialise the three arrays empty plus `bandAlive: new Uint32Array(field.bands)`, `lockBand: -1`, then call `crew(state)` before returning it.

- [ ] **Step 5: Rewrite `step`'s sections 3, 5 and 6**

Section 2's firing loop is unchanged except that it iterates `s.track` and must now maintain `bandAlive`. Immediately after the existing `killCell(field, cell)`:

```ts
      s.bandAlive[l.band]--
```

Replace section 3 (ejection) with rotation:

```ts
  // 3. Rotate out the spent, the blank-lapped and the capped. Same three triggers
  //    as before and still evaluated at a gate crossing — only the destination
  //    changed, from destruction to the back of the queue.
  for (let i = s.track.length - 1; i >= 0; i--) {
    const t = s.track[i]
    if (t.spent || t.laps >= cfg.lapCap) {
      s.track.splice(i, 1)
      rotate(s, t)
    }
  }

  // 3b. A queued turret whose colour died while it waited retires from the queue
  //     rather than riding a pointless shift. This is what visibly fills the
  //     retired row as a picture nears its end.
  for (let i = s.queue.length - 1; i >= 0; i--) {
    if (s.bandAlive[s.queue[i].band] === 0) s.retired.push(...s.queue.splice(i, 1))
  }
```

Delete section 5 (mint) entirely. Replace section 6 with:

```ts
  // 6. Release from the gate. Everything enters at the gate and nowhere else; how
  //    far apart they end up is set by how long the gate holds between releases.
  //    Never release onto a picture that is already gone — that is what produces
  //    the quiet beat at the end without any timer asking for one.
  s.gateClear = Math.max(0, s.gateClear - ds)
  while (s.gateClear <= 0 && s.queue.length > 0 && s.track.length < cfg.capacity
         && field.aliveCount > 0) {
    s.track.push(s.queue.shift()!)
    s.gateClear = gateInterval(s)
  }
```

Section 7's completion check becomes `field.aliveCount === 0 && s.track.length === 0 && s.dying.length === 0`, and its body calls `crew(s)` after rebuilding the field and front, replacing the `s.queue.length = 0` line.

Delete the now-unused `mint` function and the `temperedPick` import if Task 5 has not yet added it back.

- [ ] **Step 6: Update `applyConfig` and `resizeState`**

```ts
  // A fleet resize or a mode change re-crews: both change what colour every turret
  // should be carrying, and reconciling that in place would mean deciding which
  // existing turrets keep their colour — invisible policy for no visible gain.
  if (next.fleet !== prev.fleet || next.targeting !== prev.targeting) {
    s.cfg = next
    crew(s)
    return true
  }
```

placed after the `structural` early-return and before the existing palette check. `resizeState` calls `crew(s)` in place of its four `length = 0` lines for the turret arrays.

- [ ] **Step 7: Run the tests**

```bash
npx vitest run src/diversions/ablation
npx tsc -b --noEmit
```

Expected: PASS. `render.ts` still reads `s.queue[i]` as a band index and will draw wrong colours — Task 6 fixes that; its test may fail here and that is expected.

- [ ] **Step 8: Commit**

```bash
git add src/diversions/ablation
git commit -m "Ablation: turrets rotate through the queue instead of being consumed"
```

---

### Task 5: Unison targeting

**Files:**
- Modify: `src/diversions/ablation/ablation.ts`
- Test: `src/diversions/ablation/ablation.test.ts`

**Interfaces:**
- Consumes: `rotate` and `s.lockBand` (Task 4); `temperedPick` (existing).
- Produces: `s.lockBand` maintained per step when `cfg.targeting === 'Unison'`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('unison targeting', () => {
  const uni = (over: Partial<AblationConfig> = {}) =>
    ablationSchema.parse({ targeting: 'Unison', fleet: 20, capacity: 12, cellSize: 20, ...over })

  it('locks onto an exposed band and puts every released turret on it', () => {
    const s = createState(uni(), SIZE)
    run(s, 2)
    expect(s.lockBand).toBeGreaterThanOrEqual(0)
    expect(s.hist[s.lockBand]).toBeGreaterThan(0)
  })

  it('holds the lock while the band is still on the exposed front', () => {
    const s = createState(uni({ speed: 200 }), SIZE)
    run(s, 2)
    const held = s.lockBand
    for (let i = 0; i < 60 * 20; i++) {
      step(s, 1 / 60)
      if (s.hist[held] === 0) break
      expect(s.lockBand).toBe(held)
    }
  })

  it('releases the lock only when the band leaves the exposed front', () => {
    const s = createState(uni({ speed: 500, charge: 30 }), SIZE)
    run(s, 2)
    let changes = 0
    let prev = s.lockBand
    for (let i = 0; i < 60 * 300 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      if (s.lockBand !== prev) { changes++; prev = s.lockBand }
    }
    expect(changes).toBeGreaterThan(0)
  })

  it('recolours a turret on rotation, never mid-ride', () => {
    const s = createState(uni({ speed: 500, charge: 6 }), SIZE)
    run(s, 2)
    for (let i = 0; i < 60 * 120 && s.pictures === 0; i++) {
      const before = s.track.map((t) => ({ t, band: t.band }))
      step(s, 1 / 60)
      for (const { t, band } of before) if (s.track.includes(t)) expect(t.band).toBe(band)
    }
  })

  it('still reaches zero cells', () => {
    const s = createState(uni({ speed: 600, charge: 200, cellSize: 24 }), SIZE)
    for (let i = 0; i < 60 * 900 && s.field.aliveCount > 0; i++) step(s, 1 / 60)
    expect(s.field.aliveCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run src/diversions/ablation/ablation.test.ts -t unison
```

Expected: FAIL — `s.lockBand` stays -1.

- [ ] **Step 3: Maintain the lock in `step`**

Insert immediately after section 4 (`exposedHistogram`), so the lock always reads a fresh front:

```ts
  // 4b. The Unison lock. It is released on EXPOSURE, not extinction — a colour that
  //     has left the surface can come back when the layer above it is peeled, and
  //     the crew returns to it. Applied only in `rotate`, so a switch shows up as a
  //     new colour entering the back of the queue while the track still works the
  //     old one; that lag is the mode's visible signature, not a defect.
  if (cfg.targeting === 'Unison') {
    if (s.lockBand < 0 || s.hist[s.lockBand] === 0) {
      s.lockBand = temperedPick(s.hist, cfg.targetingBias, s.rand)
    }
  } else {
    s.lockBand = -1
  }
```

Restore the `temperedPick` import if Task 4 removed it.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/diversions/ablation
```

Expected: PASS.

- [ ] **Step 5: Mutation-check the lock-release rule**

Change the condition to `if (s.lockBand < 0)` (never releases) and confirm "still reaches zero cells" fails. Then change it to re-pick every step and confirm "holds the lock" fails. Restore and re-run green.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/ablation/ablation.ts src/diversions/ablation/ablation.test.ts
git commit -m "Ablation: Unison targeting locks the crew onto one exposed colour"
```

---

### Task 6: Draw the queue from turrets, and the retired row

**Files:**
- Modify: `src/diversions/ablation/render.ts`
- Test: `src/diversions/ablation/render.test.ts`

**Interfaces:**
- Consumes: `s.queue: Turret[]`, `s.retired: Turret[]`, `s.track: Turret[]` (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Follow whatever recording-context helper `render.test.ts` already uses. Add:

```ts
it('draws a dot per queued turret and per retired turret', () => {
  const cfg = ablationSchema.parse({ fleet: 20, capacity: 12 })
  const s = createState(cfg, { width: 900, height: 620 })
  s.retired.push(...s.queue.splice(0, 3))
  const rec = recordingContext()          // the file's existing helper
  render(s, rec.ctx)
  // 17 queued + 3 retired arcs, and the retired ones are drawn dimmer.
  expect(rec.arcs.length).toBe(20)
  const alphas = new Set(rec.arcs.map((a) => a.alpha))
  expect(alphas.size).toBe(2)
})

it('anchors the retired row on the corner opposite the gate', () => {
  const cfg = ablationSchema.parse({ fleet: 20, capacity: 12 })
  const s = createState(cfg, { width: 900, height: 620 })
  s.retired.push(s.queue.shift()!)
  const rec = recordingContext()
  render(s, rec.ctx)
  const gateCorner = { x: s.geom.px - s.geom.gap, y: s.geom.py - s.geom.gap }
  const far = rec.arcs[rec.arcs.length - 1]
  // Diagonally opposite: right of and below the gate corner.
  expect(far.x).toBeGreaterThan(gateCorner.x + s.geom.pw / 2)
  expect(far.y).toBeGreaterThan(gateCorner.y + s.geom.ph / 2)
})
```

If `render.test.ts` has no arc-recording helper, add one that captures `{ x, y, r, alpha, fillStyle }` on each `arc` + `fill` pair — `globalAlpha` must be read at `fill` time, since it is sticky state and the value at `arc` time is not what paints.

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/diversions/ablation/render.test.ts
```

Expected: FAIL — only queue dots are drawn, and their colour lookup uses `s.queue[i]` as a number.

- [ ] **Step 3: Replace section 8 of `render.ts`**

```ts
  // 8. The two rows of turrets that are NOT riding. Undrawn, they would be
  //    invisible state (UX invariant #2) — and the colour mix in each is a readout:
  //    what is about to happen to the picture on one side, what is finished on the
  //    other. Both walk BACKWARDS along the track from their anchor and offset
  //    outward, so they read as parked rather than riding.
  const outward = Math.max(4, geom.gap * 0.55)
  const spacing = Math.max(6, geom.gap * 0.5)
  const dot = Math.max(2, spacing * 0.32)
  const parkedRow = (turrets: Turret[], anchor: number, alpha: number) => {
    for (let i = 0; i < turrets.length; i++) {
      const pt = trackPoint(geom, anchor - (i + 1) * spacing)
      const qx = Math.max(dot, Math.min(w - dot, pt.x - pt.dx * outward))
      const qy = Math.max(dot, Math.min(h - dot, pt.y - pt.dy * outward))
      ctx.globalAlpha = alpha
      ctx.fillStyle = bandCss(p, turrets[i].band)
      ctx.beginPath()
      ctx.arc(qx, qy, dot, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // Pending trails back from the gate at the top-left corner; finished trails back
  // from `perimeter / 2`, which lands exactly on the bottom-right corner.
  parkedRow(s.queue, 0, 0.75)
  parkedRow(s.retired, geom.perimeter / 2, 0.3)
```

Add `import type { Turret } from './turrets'`.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run src/diversions/ablation
npx tsc -b --noEmit
npm run lint
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diversions/ablation/render.ts src/diversions/ablation/render.test.ts
git commit -m "Ablation: draw the pending and retired turret rows"
```

---

### Task 7: The even-spacing guard (#281)

The shipped comment claims even spacing holds under churn. Nothing measures it, and the claim only holds if every rotation coincides with a gate crossing.

**Files:**
- Test: `src/diversions/ablation/ablation.test.ts`

**Interfaces:**
- Consumes: `s.track` (Task 4).
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

```ts
describe('even spacing (#281)', () => {
  it('keeps the crew evenly spread across a full picture of rotations', () => {
    const cfg = ablationSchema.parse({
      spacing: 1, fleet: 24, capacity: 12, speed: 400, charge: 25, cellSize: 20,
    })
    const s = createState(cfg, { width: 900, height: 620 })
    // Let the track fill first — a partly-crewed track is legitimately uneven.
    for (let i = 0; i < 60 * 240 && s.track.length < cfg.capacity; i++) step(s, 1 / 60)
    expect(s.track.length).toBe(cfg.capacity)

    let worst = 0
    let rotations = 0
    let seen = new Set(s.track)
    for (let i = 0; i < 60 * 300 && s.pictures === 0; i++) {
      step(s, 1 / 60)
      for (const t of s.track) if (!seen.has(t)) rotations++
      seen = new Set(s.track)
      if (s.track.length < cfg.capacity) continue
      const at = s.track.map((t) => t.s).sort((a, b) => a - b)
      const gaps = at.map((v, j) => (j === 0 ? v + s.geom.perimeter - at[at.length - 1] : v - at[j - 1]))
      const even = s.geom.perimeter / cfg.capacity
      worst = Math.max(worst, ...gaps.map((g) => Math.abs(g - even) / even))
    }
    expect(rotations).toBeGreaterThan(10)  // the churn actually happened
    expect(worst).toBeLessThan(0.35)       // no gap ever drifts >35% off even
  })
})
```

- [ ] **Step 2: Run it**

```bash
npx vitest run src/diversions/ablation/ablation.test.ts -t "evenly spread"
```

If it FAILS, the spacing claim is wrong and the cause must be found before proceeding — the likely culprit is a rotation that does not coincide with a gate crossing, or `gateClear` continuing to drain while the track is full so a freed slot refills instantly. Fix the mechanism; do not loosen the threshold to make the test pass. If it PASSES first time, that is a legitimate green — the test still earns its place as the regression guard the claim never had.

- [ ] **Step 3: Mutation-check it**

Set `spacing`'s default back to 0 in the test's config literal and confirm the assertion fails. Restore.

- [ ] **Step 4: Commit**

```bash
git add src/diversions/ablation/ablation.test.ts
git commit -m "Ablation: guard that an evenly spread crew stays even under churn"
```

---

### Task 8: Docs

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-08-15-ablation-fleet-design.md`
- Check: `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Find and fix every stale claim**

```bash
grep -rn -i "ablation" README.md CLAUDE.md
grep -rn -i "laser" README.md
```

Rewrite Ablation's README entry for turrets, the fleet, and the two targeting modes. The previous session shipped a README bug of exactly this kind (`7aacad5` — the lap cap was credited with the blank-lap rule's job), so read what the code now does rather than what the old entry said.

- [ ] **Step 2: Flip the spec's status line**

In `docs/superpowers/specs/2026-08-15-ablation-fleet-design.md`, change `**Status:** approved, not yet implemented` to `**Status:** shipped 2026-08-15`. Correct any detail the implementation settled differently from the design; the spec is the record of what shipped, not of what was imagined.

- [ ] **Step 3: Add the gotcha to `CLAUDE.md` only if one was earned**

If a non-obvious trap surfaced during implementation — anything a future session would rediscover the hard way — add it under "Gotchas learned". If nothing did, change nothing. Do not pad.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/superpowers/specs
git commit -m "docs: Ablation's circulating fleet and targeting modes"
```

---

### Task 9: Code review

Required phase, not optional, and it runs before any verification handoff.

- [ ] **Step 1: Run every gate first**

```bash
npm test
npx tsc -b --noEmit
npm run lint
```

All three green before dispatching. A reviewer should not be spending its attention on a red build.

- [ ] **Step 2: Dispatch two reviewers in parallel, both with no implementation bias**

- `diversion-reviewer` — the diff against the five UX invariants, the schema-as-single-source-of-truth rule, and the URL-codec keystone.
- `perf-analyzer` — `step()` and `render()` are the hot path; the fleet arrays are now allocated per crew rather than per mint, and `crew()` runs an O(cells) count. Confirm nothing per-frame allocates.

Brief both with the spec path and `git diff main...HEAD`.

- [ ] **Step 3: Triage, fix, and re-run the gates**

For every finding, either fix it or record why it is not a defect. **Mutation-test any new guard**: delete the line it claims to protect and confirm the test fails. Two of three guards added in the previous Ablation session passed against a deliberately broken build.

- [ ] **Step 4: Commit the fixes**

```bash
git commit -am "Ablation: address review findings"
```

---

### Task 10: Chrome verification

**Never** the built-in preview panel. Chrome only.

- [ ] **Step 1: Start the dev server and confirm the port**

```bash
npm run dev
```

Vite is pinned to 5180 but may bump; read the actual port from the output. A brand-new diversion folder needs a restart — this one already exists, but the rename means a restart is worth doing anyway.

- [ ] **Step 2: Walk these URLs in Chrome, with a pinned seed**

A seedless direct load can resume a persisted run and is the wrong thing to verify against.

```text
http://localhost:5180/d/ablation/play?seed=4242
http://localhost:5180/d/ablation/play?seed=4242&targeting=Unison
http://localhost:5180/d/ablation/play?seed=4242&targeting=Unison&speed=400&cellSize=25
http://localhost:5180/d/ablation/config?seed=4242
```

- [ ] **Step 3: Confirm each of these by eye, not by inference**

- The crew rides **evenly spread** around the whole perimeter, not as a pack.
- Pending dots trail from the top-left corner; retired dots from the bottom-right, dimmer.
- The retired row **fills** as the map empties, and both rows clear at the new picture.
- In Unison: the whole crew converges on one colour, and a switch appears **in the queue first** while the track still works the old colour. Time one full conversion and judge whether the lag reads as deliberate or as a stall — this is the number most likely to need tuning, and any tuning change is the user's call, not the implementer's.
- The quiet beat at the end of a picture survives.
- Console is clean.

- [ ] **Step 4: Watch out for the HMR trap**

Editing source while watching re-runs `setup()` and rebuilds the **same** picture at full, which reads exactly like a mid-run reset bug. An HMR rebuild is *identical*; a real completion advances the generation and looks different. Do not diagnose a reset without checking which one it was.

- [ ] **Step 5: Hand off for user verification**

Surface the full clickable URLs on their own lines and wait for explicit approval before any FF-merge. Automated green is necessary, not sufficient.

---

## Merge

Only after user approval:

```bash
git checkout main && git pull --ff-only
git checkout feature/ablation-fleet && git rebase main
git checkout main && git merge --ff-only feature/ablation-fleet
git push origin main
git branch -d feature/ablation-fleet
```

Squash the branch into one commit first if the history does not read as "what shipped". Close **#283**, **#281** and **#282** with the merge, then validate live at
`https://mattaltermatt.github.io/diversion/d/ablation/play` once Pages has deployed.
