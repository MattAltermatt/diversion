# BoxCar2D — Modes, Terrain Types & Rubble (#155) — Design

**Date:** 2026-06-30
**Diversion:** `src/diversions/boxcar2d/`
**Issue:** #155 (additional terrain types), expanded in brainstorm to add a **time mode** and an **infinite track lifespan** option.

## 🎯 Context

BoxCar2D ships GA-evolved wireframe cars on an **endless** procedural Box2D track. Fitness is pure distance (go as far as you can); the track is one infinite height function with no terminus. This change adds three things the user wants:

1. **Terrain variety** — the original #155: switchable terrain *shapes*.
2. **A time mode** — a second objective: a finite, user-set goal distance with a finish line; the fastest car to reach it wins. Until cars *can* reach the goal, evolution still ranks by distance (so the lineage first learns to get there, then learns to get there fast).
3. **Infinite track lifespan** — the "Track Lifespan" slider should reach **∞** (one track, mastered forever) and **default there**.

A user-reframe during brainstorm turned "Rubble" from a terrain *shape* into a **resettable obstacle layer**: small dynamic blocks that slow the car and reset to an identical, fair layout for every car in the population.

All numeric defaults below are 🎚️ **tunable** — propose-and-adjust during Chrome verify, not locked balance.

---

## 🧩 Schema additions (`schema.ts`)

New fields (all carry `.meta`), following the existing `segmented`/`showWhen` conventions (ref `gravity-wells/schema.ts:50`, `moire/schema.ts:46`):

```ts
mode: z.enum(['distance','time']).default('distance')
  .meta({ section:'Evolution', ui:'segmented', options:['distance','time'],
          label:'Mode', help:'Distance = go as far as possible (endless). Time = reach the goal fastest.' }),

goalDistance: z.number().min(50).max(1000).default(300)
  .meta({ section:'Evolution', ui:'slider', min:50, max:1000, step:10,
          label:'Goal distance (m)', help:'Time mode: finish line position.',
          showWhen:{ field:'mode', equals:'time' } }),

timeCap: z.number().min(5).max(60).default(20)
  .meta({ section:'Evolution', ui:'slider', min:5, max:60, step:1,
          label:'Time limit (s)', help:'Time mode: per-car budget to reach the goal before it is culled.',
          showWhen:{ field:'mode', equals:'time' } }),

terrainType: z.enum(['rolling','dunes','plateaus','ridges']).default('rolling')
  .meta({ section:'Track', ui:'segmented', options:['rolling','dunes','plateaus','ridges'],
          label:'Terrain', help:'Shape of the hills.' }),

rubbleDensity: z.number().min(0).max(10).default(0)
  .meta({ section:'Track', ui:'slider', min:0, max:10, step:1,
          label:'Rubble', help:'Loose blocks per ~10 m that slow the car. 0 = none. Resets for every car.' }),
```

**Track Lifespan → ∞:** `trackLifespan` stays a single slider but its **max position reads "∞"** and means *never regenerate*. Requires a tiny shared-`Slider` enhancement (below). Change its `.default(12)` → **default to max (∞)**, keep range `1..50`, add `maxLabel:'∞'`.

> Invariant (enforced by `diversionMeta.test.ts:57`): a `segmented` field's `options` must equal its enum values, and a `showWhen.field` must name a real sibling.

---

## ⏱️ Time mode mechanic

**Endpoint:** a finish line at world-x `= spawnX + goalDistance` (`D`). A checkered finish-line is drawn at `D`. A car **finishes** the instant `chassis.x ≥ D`.

**Single scalar fitness** (drives the existing roulette + elitism in `ga.ts` unchanged):

```
finisher      →  fitness = D + (timeCap − timeToFinish)     // faster ⇒ higher; always > D
non-finisher  →  fitness = distanceReached                   // always < D
```

This makes the two phases emerge with **no mode-switch branch**: early generations are all non-finishers ranked by distance (evolving toward the flag); once cars finish, their fitness jumps above `D` and selection pivots to minimizing time.

**A car's run ENDS on the first of:**
1. `chassis.x ≥ D` → **finished**, record `timeToFinish` (steps/60).
2. progress-rate cull → stuck (existing `minProgress` / `progressWindow`, `index.ts:142`).
3. `timeCap` reached → too slow → scored by `distanceReached`.

`distance` mode is **unchanged** (no goal, no time cap, endless; fitness = `maxX − spawnX`, `index.ts:103`).

Switching `mode` (or `goalDistance`) is a **structural** config change → triggers a clean re-setup (fresh population, fresh generation count) — switching objectives is a deliberate restart.

---

## ⛰️ Terrain types (`terrain.ts`)

`makeTerrain` gains a `type` param: `makeTerrain(seed, roughness, type)`. It returns the same pure `y = f(x)` (meters), still ramped flat for the first ~9 m, still × `roughness`. The two call sites (`index.ts:172` setup, `index.ts:126` new-track) pass `cfg.terrainType`.

Height functions (`n(f)` = value noise at freq `f`, centered −1..1):

```
rolling  (default)  n(.05)·2.6 + n(.14)·1.6 + n(.34)·0.8       varied hills (current)
dunes               n(.025)·3.5 + n(.06)·1.2, crests sharpened big, calm swells
plateaus            quantise n(.04)·3.2 to flat steps + cliff  tables + drops (push step for legibility)
ridges              (1−|n(.05)|)·3.2 + (1−|n(.13)|)·1.3 − bias  sharp peaks & V-valleys (push sharpness)
```

Mockup reference: `boxcar2d-mockups.html` (brainstorm artifact). Plateaus/ridges need slightly stronger quantization/sharpness than the mockup to read clearly at the live zoom.

---

## 🧱 Rubble obstacle layer

Small **dynamic** Box2D boxes resting on the terrain surface; the car collides with them and loses momentum.

**Resettable & fair (the core requirement):** the layout is a deterministic function of the *track seed* (a dedicated seeded stream). At **every car spawn** the blocks snap back to that exact layout (set transform + zero linear/angular velocity). All cars in a generation meet identical debris — no car bulldozes a path for the next. This keeps the determinism test honest.

**Placement / pooling:** blocks live in a **sliding pool** within the window ahead of the car (mirrors the terrain sliding window, `index.ts:71`). Block x-positions are seeded so each car meets the same block at the same x; block y sits on `terrainHeight(x)`. On car spawn, repopulate/reset the pool at the spawn region. `rubbleDensity` controls blocks per ~10 m; `0` ⇒ pool empty (no bodies created — zero cost when off).

**Scope guard:** cap the live block count (pool size) so a high density × wide window can't spawn hundreds of dynamic bodies. `log`/comment the cap.

Works on **any** terrain type and in **both** modes (composes with the finish line).

---

## ♾️ Infinite track lifespan (shared `Slider` tweak)

`src/framework/controls/Slider.tsx` + `fieldMeta.ts`: add optional `maxLabel?: string` to `FieldMeta`. When set and the value is at `max`, the **readout displays `maxLabel`** (e.g. "∞") instead of the number; the range thumb sits at max as usual. Keep the editable numeric readout behaviour for all non-max values. Add a focused `Slider.test.tsx` case.

Diversion logic: treat `trackLifespan >= max (50)` as **never regenerate**. The new-track branch (`index.ts:125`) becomes:

```ts
const lifespanInf = cfg.trackLifespan >= TRACK_LIFESPAN_MAX
if (!lifespanInf && (generation - 1) % cfg.trackLifespan === 0) { /* regenerate track */ }
```

Default `trackLifespan = 50` (∞) ⇒ one mastered track by default (calmer, matches zen ethos).

---

## 🖼️ Rendering & HUD (`render.ts`)

- **Finish line** (time mode only): checkered pole at `sx(spawnX + goalDistance)`, drawn before the car. The existing "best distance" ghost flag stays in **distance** mode only.
- **Rubble:** draw each live block as a translucent-fill + outline square (reuse the chassis wireframe idiom; a contrasting accent so debris reads against terrain).
- **HUD string** (`render.ts:156`) branches on mode:
  - distance: `Gen N   Car i/pop   Dist Xm   Best Ym` (current)
  - time: `Gen N   Car i/pop   Time X.Xs   Best Y.Ys   Goal Dm`

---

## 🔁 Lifecycle / `update()` (`index.ts:214`)

- **Structural (return `false` → re-setup):** existing set + `mode`, `goalDistance`, `terrainType`, `rubbleDensity`. (Mode/goal/terrain reshape the run; rubble changes body count.)
- **Live-apply (`state.cfg = config`, return `true`):** existing cosmetic/speed/motor + `timeCap`, `showHud`.

---

## 🎛️ Presets (`presets.ts`)

- Extend the **"Terrain feel"** group (or add a **"Landscape"** group) with one option per terrain type, e.g. `Rolling` / `Dunes` / `Plateaus` / `Ridges` patching `{ terrainType }` (optionally paired with a sensible `roughness`).
- Optional **"Objective"** group: `Distance` `{mode:'distance'}` / `Race` `{mode:'time'}`.

---

## ✅ Testing & verification

**Unit (Vitest, co-located):**
- `terrain.test.ts`: each `terrainType` is deterministic for a seed; flat launch ramp preserved; output finite across a long x-sweep.
- Time-mode fitness: finisher always > `D`, non-finisher always < `D`; faster finish ⇒ higher fitness (pure helper, hoist asserts out of any hot loop per the CI-timeout gotcha).
- Rubble: same seed ⇒ same block layout; reset returns blocks to initial transforms.
- `Slider.test.tsx`: `maxLabel` renders at max, number elsewhere.
- Determinism: keep the gen-1/gen-3 snapshot test green (update expected values if defaults shift).
- Codec: full round-trip incl. the new fields (the keystone — `urlCodec.test.ts` / `urlKeys.test.ts`).

**Chrome verify (port 5180, `?mute=1`):**
- Distance mode unchanged; cycle all 4 terrain types — each visibly distinct and legible at live zoom.
- Time mode: finish line visible at `D`; early gens rank by distance; cars eventually finish; HUD timer counts; best time drops over generations.
- Rubble: blocks appear, slow the car, and **reset identically** each car (watch two consecutive cars hit the same block).
- Track Lifespan slider shows **∞** at top and defaults there; lower it and confirm a new track at the interval.

**Files touched:** `schema.ts`, `terrain.ts`, `terrain.test.ts`, `index.ts`, `render.ts`, `presets.ts`, `palette.ts` (only if a rubble colour is added), `framework/fieldMeta.ts`, `framework/controls/Slider.tsx`, `framework/controls/Slider.test.tsx`, README (diversion blurb), close #155.
