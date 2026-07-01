# Particle Life polish — auto-restart · copy-link-with-seed · Mariners palette

**Date:** 2026-06-30
**Status:** implemented 2026-06-30 — 1569 tests green, Chrome-verified (Mariners look, seed-pinned link, live auto-restart). Pending user-verify + FF-merge. Issue #191.
**Scope:** 3 features on the Particle Life diversion (#133), plus one small reusable framework seam. **Perf is explicitly OUT** — see "Perf: dropped" below.

---

## 0. Perf: dropped (was ask #1)

A perf audit + a 3-agent adversarial debate concluded the perf work is not worth doing now:

- The hot path is already zero-alloc and its invariants are already hoisted (`sim.ts:71-72`). At the default (1500 × rMax 80) it runs 120fps / 8.3ms — pinned at the display cap. Bucket-A "safe" wins are imperceptible there.
- The 5.3fps cliff is a **deliberate double-max** (count 4000 × rMax 160), already owner-blessed to leave as-is in #190.
- The only meaningful levers (grid-cell decouple, fewer divides) **re-roll every seed's exact world** (chaotic float reassociation) to fix a corner nobody hits.
- Exact-seed reproducibility protection was a *manufactured* decision: no test asserts a trajectory (`sim.test.ts` is self-relative), shared links are seedless by construction, and no shipped UI pins a seed.

**Decision:** leave #190 open and untouched. Do not reorganize this work around a reproducibility reset. This spec ships zero changes to `sim.ts` / `grid.ts` / `force.ts` — so every exact world is preserved bit-for-bit.

---

## 1. Auto-restart on stall

**Goal:** a screensaver should never sit on a dead world. When the broth stops moving (freezes into a static crystal or collapses to a motionless clump), roll a fresh world automatically.

**Trigger — motion-stopped only (option A).** Track the mean per-particle kinetic energy (`meanSpeed² = mean(vx²+vy²)`). When it stays below a small **absolute** threshold for a sustained duration, the world is dead → reseed. Deliberately **not** caught: a single creature that zooms around forever (it never stops moving — owner wants it left alone). No timer, no max-age cap.

**Guards:**
- **Min-age:** ignore the first ~20 s after each (re)seed — a new world needs time to organize; judging it early would kill it mid-formation.
- **Absolute threshold** (not grid-proportional): per [[gotcha-ca-quiescence-absolute-threshold]], a proportional threshold falsely reseeds. A frozen crystal has ~0 velocity regardless of `forceScale`, so an absolute `meanSpeed²` floor is correct.

**Starting constants (tunable — verify in Chrome):**
- `MIN_AGE_MS = 20_000`
- `STILL_MS = 4_000` (sustained-stillness duration before reseed)
- `FROZEN_SPEED2 = 4` (world-units/sec)² — mean speed below ~2 u/s counts as "stopped"

**Reseed mechanism:** always-on; each restart rolls a **fresh random seed** (via the existing `applyFreshLoadRandomization` with empty params) and re-runs the diversion's `setup` → new soup. Applies even to a pinned `?seed=N` world: if it freezes, the screensaver rolls on. (Verify-time tweak candidate: should an explicit `?seed=N` freeze instead of roll? Default = roll, to keep the screensaver alive.)

**Transition:** rely on the diversion's existing `trailFade` for a soft dissolve (old frozen dots fade over a few frames as the new soup spreads). A dedicated crossfade is deferred to backlog unless the dissolve reads badly in Chrome verify.

---

## 2. The framework seam (enables #1 and #3)

Both auto-restart and copy-link-with-seed need one thing the architecture doesn't currently provide: **the framework must know which world (seed) is on screen right now**, and that changes each time #1 reseeds. Today the config is frozen at mount and the diversion is a sealed black box. We add a minimal, reusable seam.

### 2a. `types.ts` — one optional hook

```ts
export interface Diversion<...> {
  // ...existing...
  /** Polled once per rendered frame (after frame()). Return true to ask the
   *  framework to reseed: roll fresh randomizeOnFreshLoad fields + re-run setup.
   *  Diversion-specific staleness logic lives here; the framework owns the reseed
   *  lifecycle + live-config tracking. Omit → never auto-restarts. */
  shouldRestart?(state: State, t: number, dt: number): boolean
}
```

### 2b. `AnimationHost.tsx` — reseed lifecycle + live-config reporting

- **New optional prop `onLiveConfigChange?(config: unknown): void`.** Called once on mount with the initial config, and again with the new config after each reseed. Lets the play screen track the on-screen world for copy-link-with-seed.
- **In the loop callback, after `diversion.frame(...)`:** if `diversion.shouldRestart?.(run.state, t, dt)` is true, perform a reseed:
  1. `const next = applyFreshLoadRandomization(diversion.schema, lastConfigRef.current, EMPTY_PARAMS)` — rolls a fresh seed (empty params → always rolls).
  2. `diversion.teardown?.(run.state)` → `run.state = diversion.setup(ctx, next, run.size)` (mirrors the existing re-setup path; setup can throw → same `setSetupError` handling).
  3. `lastConfigRef.current = next; onLiveConfigChange?.(next)`.
- Only runs while the loop ticks (not paused / reduced-motion-frozen), because it's inside the frame callback. No extra polling.
- The `[config]` effect's `config === lastConfigRef.current` guard already tolerates an internally-swapped `lastConfigRef` — a later parent config change still compares correctly and applies.

This is the honest home for the feature: the framework owns chrome + lifecycle, the diversion only *describes* when it's stale.

---

## 3. Copy-link-with-seed

**Goal:** capture the exact world on screen right now (before auto-restart discards it) as a shareable/savable link.

Today `PlayScreen` has one copy button that mirrors the URL verbatim — seedless by convention (a "new world every visit" link). We **add a second button** that pins the live seed.

### 3a. `urlCodec.ts` — pinned encode

Add an options arg to `encodeConfig` so it can *include* the pin-only fields:

```ts
export function encodeConfig<T extends ZodObject<any>>(
  schema: T,
  value: ReturnType<T['parse']>,
  opts: { includePinned?: boolean } = {},
): URLSearchParams {
  // ...unchanged, except:
  const skip = opts.includePinned ? new Set<string>() : freshLoadKeys(schema)
  // ...
}
```

Default behavior (no opts) is byte-identical to today — the seedless button and all existing callers are unaffected. `includePinned: true` emits a **full snapshot including `seed`**, so the link reproduces the exact world *and* current settings.

### 3b. `CopyLinkButton.tsx` — parametrize the label

Add optional `label` / `copiedLabel` props (defaults keep the current `🔗 Copy link` / `✓ Copied`). Behavior otherwise unchanged.

### 3c. `PlayScreen.tsx` — track live config, render two buttons

- Init `liveConfig` state = the mount config; update it from `AnimationHost`'s `onLiveConfigChange`.
- Render:
  - existing seedless button (unchanged): `🔗 Copy link`
  - new pinned button: `📌 Copy this world`, href built from `encodeConfig(schema, liveConfig, { includePinned: true })` → `/d/${id}/play?<params>`.
- The pinned href updates live as auto-restart rolls worlds, so it always pins whatever is currently displayed.

---

## 4. Mariners palette (new default)

**Goal:** old-school Seattle Mariners colors (1977–1986 trident era: royal blue + gold) as the default palette.

**Wrinkle:** palettes are derived OKLCH **hue-sweeps** (constant L+C, sweep hue) generating N evenly-spaced species colors. Two brand colors can't distinguish 6 species (readability invariant #1/#5). So Mariners is a **discrete anchor ramp**, ordered dark-blue → light-neutral → gold so interpolation for non-6 species counts never crosses off-brand green (chroma passes through ~0 at the white anchor).

### 4a. `palette.ts` — support anchor-list palettes

Extend `PaletteSpec` to a union:

```ts
type PaletteSpec =
  | { kind: 'sweep'; lo: number; hi: number; L: number; C: number }
  | { kind: 'anchors'; stops: Array<[L: number, C: number, H: number]> }
```

Existing five palettes become `kind: 'sweep'`. `paletteColors` gains an anchors branch: sample N points evenly along the piecewise-linear OKLCH ramp (`t = i/(N-1)`, or the single stop when N=1), lerping L, C, and H between adjacent stops. For the default 6 species this yields exactly the 6 stops.

**Mariners anchors (starting values — finalize hexes with the `color-expert` skill during impl for gamut + contrast):**

```text
stop    L      C      H     reads as
navy    0.40   0.11   258   deep navy
royal   0.55   0.15   256   royal blue (#005CA9-ish)
sky     0.78   0.09   240   powder/sky blue
silver  0.90   0.015  250   near-white silver (kept off pure white so additive glow doesn't blow out)
cream   0.88   0.06   92    pale gold / cream
gold    0.80   0.145  85    Mariners gold (#FDB827-ish)
```

### 4b. `schema.ts` — default palette → `Mariners`

Add `'Mariners'` to `PALETTE_NAMES` (first) and change the `palette` field default from `'Spectrum'` to `'Mariners'`. Look field, no sim impact — worlds unchanged.

### 4c. `presets.ts` — Mariners Look preset (default-matching)

Add as the first "Look" option: `{ name: 'Mariners', patch: { palette: 'Mariners', background: '#05070d', trailFade: 0.15, glow: true, dotSize: 2.5 } }`. Patch equals the schema defaults for those fields, so a fresh load shows Look = **Mariners** (via `matchPresets`).

---

## 5. Tests (anti-regression)

- **`restart.ts`** (new pure module): `meanSpeed2(vx, vy, n)` correctness; `tickStall(state, dtMs, speed2)` — returns false under min-age; false while moving; resets `stillMs` when motion resumes; returns true only after `STILL_MS` sustained below `FROZEN_SPEED2`.
- **`palette.test.ts`**: Mariners returns N valid distinct hexes for N=3/6/8; 6-species = the 6 anchors; no NaN/out-of-gamut.
- **`urlCodec.test.ts`**: `encodeConfig(..., { includePinned: true })` emits `seed`; default omits it (unchanged); pinned link round-trips through `decodeConfig` to the same seed.
- **`AnimationHost.test.tsx`**: a fake diversion whose `shouldRestart` returns true triggers teardown+setup and fires `onLiveConfigChange` with a changed seed; `shouldRestart` absent → never reseeds.
- **`CopyLinkButton.test.tsx`**: custom `label`/`copiedLabel` render; default unchanged.
- **`PlayScreen.test.tsx`**: both buttons render; pinned href contains a `seed=` param.

---

## 6. Files touched

```text
NEW  src/diversions/particle-life/restart.ts          stall detector (pure)
NEW  src/diversions/particle-life/restart.test.ts
mod  src/diversions/particle-life/index.ts             shouldRestart hook + age/stall state
mod  src/diversions/particle-life/palette.ts           anchor-ramp support + Mariners
mod  src/diversions/particle-life/palette.test.ts
mod  src/diversions/particle-life/schema.ts            default palette → Mariners
mod  src/diversions/particle-life/presets.ts           Mariners Look preset
mod  src/framework/types.ts                            shouldRestart? on Diversion
mod  src/framework/AnimationHost.tsx                   reseed lifecycle + onLiveConfigChange
mod  src/framework/AnimationHost.test.tsx
mod  src/framework/urlCodec.ts                          encodeConfig includePinned
mod  src/framework/urlCodec.test.ts
mod  src/framework/CopyLinkButton.tsx                   label props
mod  src/framework/CopyLinkButton.test.tsx
mod  src/routes/PlayScreen.tsx                          live config + pinned copy button
mod  src/routes/PlayScreen.test.tsx
```

Untouched (exact worlds preserved): `sim.ts`, `grid.ts`, `force.ts`, `matrix.ts`, `render.ts`.
