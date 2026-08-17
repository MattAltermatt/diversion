# Framework Bug Sweep — Implementation Plan

> Snapshot, 2026-08-17. Executes the ten `bug + framework` issues filed by the
> 2026-08-17 framework audit. Each issue carries its own reproduction and
> mechanism; this plan carries only the *grouping*, the *fix shape*, and the
> *regression test* each one needs.

**Goal:** close #298 #299 #300 #301 #302 #303 #304 #305 #310, and put #311 in
front of the user as the tuning decision it is.

**Architecture:** five clusters drawn on **file boundaries**, so they can run
concurrently without touching each other's lines. One branch
(`feature/framework-bugs-20260817`), one commit per cluster, one code review
before FF-merge.

**Tech stack:** Vite + React 19 + TS + Zod 4, Vitest co-located.

## Global constraints

- Every fix lands with a regression test that **fails before it and passes
  after** — and every "nothing happened" assertion gets mutation-checked
  (`gotcha-absence-assertions-pass-for-the-wrong-reason`).
- No numeric-balance edits. Any fix that would change a tuning literal stops
  and asks (that is the whole of #311).
- Never `Write` over an existing `*.test.*` file — `Edit` it.
- The codec keystone (`randomizeOnFreshLoad` pin-only, per-field degradation)
  is not up for renegotiation; #299 and #305 *restore* it.

---

## Cluster A — the rAF loop (#298, #310)

**Files:** `src/framework/useAnimationLoop.ts`, `src/framework/AnimationHost.tsx`
(lines 288 / 352 / 455), tests `useAnimationLoop.test.ts`, `AnimationHost.test.tsx`.

**#298 — the fork.** `start()` queues a tick unconditionally; `setPaused(false)`
queues a second and overwrites `raf`. `AnimationHost` pauses *then* starts, so a
hidden mount leaves frame A parked in the browser's callback list forever.

Fix, in `createLoop`:
- `start()` queues only when `!paused`.
- `setPaused(false)` keeps its queue (that is the resume path) — but the loop
  must hold **one** handle, so `tick` must not be able to run from two roots.
  Guard with a `queued` flag cleared at the top of `tick`, and re-queue through
  one `schedule()` helper used by `start`, `setPaused` and `tick` alike.

Tests: mount-while-hidden then reveal ⇒ exactly one `onFrame` per rAF turn;
pause/resume cycles ⇒ still one; `stop()` cancels.

**#310 — the wrong clock.** Three static repaints pass `performance.now()` where
`t` is contracted as accumulated clamped dt. Expose the loop's own `t`
(`Loop.time()`), and have the three repaint sites pass `loopRef.current?.time() ?? 0`.

Tests: `time()` starts at 0, advances by clamped dt, does not advance while
paused; a paused config edit repaints with the loop's `t`, not wall clock.

---

## Cluster B — the Config screen's navigation (#301, #302, #303)

**Files:** `src/routes/ConfigScreen.tsx`, test `ConfigScreen.test.tsx`.

**#301 — double build.** `useNavigationType()` is `'POP'` on a first load, so the
POP effect re-randomizes over the `useState` initializer. Add a first-run guard:
a ref seeded `true`, flipped on the effect's first run, so the effect only acts
on a *subsequent* POP (a real back/forward).

Test: render once ⇒ `setup` called once, one seed. Then simulate a POP
(location.key change) ⇒ re-decode happens.

**#302 — scroll teleport.** `navigate({search}, {replace: true})` mints a new
location key per edit and `<ScrollRestoration>` falls through to `scrollTo(0,0)`.
Add `preventScrollReset: true` to that one call.

Test: 100 simulated input events ⇒ `window.scrollTo` never called.

**#303 — replaceState per input event.** Throttle the URL write, never the state
write. `setConfig` stays synchronous (the preview must not lag); the `navigate`
is deferred to a trailing rAF/timeout so a drag emits one write per frame at
most, with a flush on unmount so the last value always lands. Wrap the call in
`try/catch` — react-router's `replace` has none — so a rate-limited WebKit throw
degrades to "the URL is briefly behind" rather than a dead form.

Test: 100 rapid updates ⇒ ≤ 2 `navigate` calls, and the final URL carries the
final config; a `navigate` that throws does not break subsequent edits.

---

## Cluster C — codec resilience + preset seeds (#299, #305)

**Files:** `src/framework/urlCodec.ts`, `src/framework/presets.ts`,
`src/framework/PresetPicker.tsx`, tests alongside.

**#299 — `decodeURIComponent` throws.** `urlCodec.ts:148` is the one unguarded
call site of two. Wrap per element: a malformed escape yields the **raw** part,
which then flows through the field's own `safeParse` and degrades per-field like
every other invalid value. Decode must not be able to throw at all.

Test: `?colors=%,%2,%zz` ⇒ no throw, that field reverts to its default, every
sibling field survives. Plus a sweep assertion: `decodeConfig` never throws for
any single-param mutation of a defaults URL.

**#305 — presets that patch a seed.** `matchPresets` compares a
`randomizeOnFreshLoad` field that is re-rolled on every load, so those options
can never match. Give `matchPresets` an optional `ignoreKeys` set and have
`PresetPicker` derive it from the schema (the codec already knows which fields
are pin-only — reuse that predicate, do not re-implement it).

Test: a group whose patch includes `seed` matches when every non-seed key
matches; the three real diversions (`hopalong`, `strange-attractors`,
`thornbird`) report their named option at defaults.

---

## Cluster D — the schema/control contract (#304)

**Files:** `src/framework/controls/Select.tsx`, `Swatch.tsx`, `ColorList.tsx`,
`src/diversions/morphogen/schema.ts`, `intermomentary/schema.ts`,
`ablation/schema.ts`, sweep `src/framework/diversionMeta.test.ts`.

> **Landed differently.** `Select.tsx` and `intermomentary/schema.ts` needed **no
> change**. `Select` was already correct — the bug was `morphogen` declaring no
> options — and `intermomentary`'s 8-hex defaults already carry the signal once
> `Swatch` reads the value's length, which is a better answer than editing the
> schema. Don't go hunting for edits to those two files.

Four live bugs, one cause — the sweep guards `ui:'segmented'` options and
`ui:'number'` bounds only.

1. `morphogen`'s two `ui:'select'` fields declare no `options` ⇒ empty
   dropdowns, and three sliders gated on `fateMode` are unreachable. Supply the
   options from the Zod enum.
2. `intermomentary`'s two Ink fields are `hex8` behind a bare
   `<input type="color">`, which sanitizes to 6-hex ⇒ the value the picker
   writes is rejected by the field's own regex. Give `Swatch` the
   `splitColor`/`joinColor` + alpha treatment `ColorList` already has.
3. `ablation`'s Palette: control defaults `min 1 / max 8`, schema is
   `.min(2).max(24)`. Surface the schema bounds in `.meta()`.
4. `Swatch` / `ColorList` inputs have no accessible name — the same one-line
   `aria-label` from `meta.label` the other controls already carry.

Then close the gap: extend the sweep so the options contract covers **every**
`ui` kind that renders from `meta.options`, and the bound-agreement check covers
**every** bounded control, not just `number`.

Mutation-check the extended sweep by reverting each of the four fixes in turn —
the sweep must go red for each.

---

## Cluster E — WebGPU device loss (#300)

**Files:** `src/framework/AnimationHost.tsx`, `src/framework/webgpu.ts`,
`src/framework/pauseModel.ts`, tests alongside. **Depends on Cluster A**
(same file region) — run it after A lands.

WebGPU has no `webglcontextrestored`; loss arrives as the one-shot `device.lost`
promise. `webgpu.ts` already drops the *cache*, but a running diversion holds
pipelines against the dead handle and nothing tells it.

Fix shape: `webgpu.ts` gains a subscribe seam (`onDeviceLost(cb)`) fired once per
lost device; `AnimationHost` subscribes for `kind === 'webgpu'` and runs the
**existing** `onLost` / `onRestored` pair — set `pauseRef.lost`, then
`freeRun` + `setup()` against a fresh device. The diversions already re-acquire
via `getSharedDevice()` inside `setup`, and the cache is already dropped, so the
rebuild picks up a new device with no diversion-side change.

Tests: a simulated loss pauses the loop and re-runs `setup`; a loss after
teardown does not write dead state; the WebGL path is unchanged.

**Verify in Chrome** — this is the one cluster a unit test cannot fully cover.

---

## Not in scope — #311

24 diversions open their Config screen on "Custom". Every candidate fix is a
numeric-balance edit (move the default to the preset, or the preset to the
default), and gameplay/visual tuning is the user's call. Surface the 7
one-key-apart cases with their actual diverging values and let the user choose.

---

## Sequencing

```text
A ─┐
B ─┼─ concurrent (disjoint files) ─→ review ─→ E ─→ Chrome verify ─→ FF-merge
C ─┤
D ─┘
```

Each cluster ends with `npx vitest run <paths>` green; the lead runs the full
`npm test` + `npm run lint` + `npx tsc -b --noEmit` before review.
