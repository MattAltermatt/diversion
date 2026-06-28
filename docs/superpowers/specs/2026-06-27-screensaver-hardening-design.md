# Screensaver-hardening bundle — design (#39 / #6 / #7)

**Date:** 2026-06-27
**Issues:** #39 (prefers-reduced-motion), #6 (gallery offscreen pause), #7 (ResizeObserver)
**Scope:** framework only — `src/framework/AnimationHost.tsx`, `src/framework/useAnimationLoop.ts` (no change expected), `src/routes/Gallery.tsx` (no change expected), plus 2-line `resize()` additions in `flow-field` and `gravity-wells`.

## Why these three together

All three converge on `AnimationHost`. #39 and #6 each add a **new reason to pause the rAF loop**; #7 fixes the **resize path**. Shipping them as one branch lets the pause logic be unified once instead of patched three times.

## 1. Unified pause model (covers #39 + #6)

Today the host pauses via scattered `pausedRef.current || document.hidden` checks at four call sites (initial `loop.setPaused`, `onVisibility`, the `[paused]` effect, and WebGL restore). Replace with a single source of truth.

### Pause sources (OR-union — paused if ANY is true)

| Source        | Origin                                              | Issue |
|---------------|-----------------------------------------------------|-------|
| `manual`      | user pause button (existing `paused` state)         | —     |
| `hidden`      | `document.hidden` (existing)                         | —     |
| `reducedMotion` | `matchMedia('(prefers-reduced-motion: reduce)')`  | #39   |
| `offscreen`   | `IntersectionObserver` says wrapper not intersecting | #6    |

### Mechanism

- A `pauseStateRef` object holds the four booleans. A `syncPaused()` helper computes the union and calls `loopRef.current?.setPaused(union)`. Every place that currently flips pause calls `syncPaused()` after mutating one flag.
- `manual` continues to live in React state (`paused`) because it drives the button label; the others live only in refs (no re-render needed — they just gate the loop).

### #39 reduced-motion — "static first frame + opt-in"

- Read `matchMedia('(prefers-reduced-motion: reduce)')` once in the setup effect; subscribe to its `change` event so toggling the OS setting live takes effect.
- **First-frame-then-freeze:** the loop must paint **exactly one frame** before honoring the reduced-motion pause, so the diversion shows its initial state rather than a blank canvas. Implementation: start the loop unpaused for reduced-motion, and after the first `onFrame` completes, set `reducedMotion=true` + `syncPaused()`. (Manual play later clears it.) This avoids teaching `createLoop` a "run N frames" concept.
- **Opt-in affordance (play screen, `showChrome=true`):** because the loop is paused, the existing button already renders ▶ (play). Add a one-time hint chip in the chrome bar — `"Reduced motion — press ▶ for full motion"` — shown only while `reducedMotion && paused-by-reduced-motion`. Pressing play sets `manual=false` AND clears the `reducedMotion` gate for this session (user explicitly opted in), so it animates.
- **Gallery tiles (`showChrome=false`):** no chrome, so they simply render their static first frame and freeze. This doubles as a free "static thumbnail" for reduced-motion users. No opt-in control on tiles (clicking the tile navigates to the play screen, where the user can opt in).
- Clicking the manual play button is the single opt-in gesture: it clears the reduced-motion gate so subsequent pause/play behaves normally.

### #6 gallery offscreen pause

- `IntersectionObserver` on `wrapRef`, created in the setup effect, threshold `0` (any pixel visible ⇒ on-screen). On change, set `offscreen = !entry.isIntersecting` then `syncPaused()`.
- Lives **inside `AnimationHost`** so every embedding benefits and the black-box contract holds. On the play screen the host fills the viewport → always intersecting → no behavior change.
- Disconnect the observer in the effect cleanup.
- **Out of scope (backlog):** captured static thumbnails "at scale." The IntersectionObserver pause is the now-fix; `AnimationHost` retains the capture seam for the future thumbnail path. Note this explicitly in the issue when closing.

## 2. #7 — ResizeObserver + resize bg-refill

- Replace `window.addEventListener('resize', onResize)` with a `ResizeObserver` observing `wrapRef.current`. This catches container/layout reflow and fullscreen transitions that never fire a `window` resize. Keep the same `onResize` body (`run.size = sizeOf(); diversion.resize?.(run.state, run.size)`).
- Disconnect the observer in cleanup.
- **First-callback guard:** `ResizeObserver` fires once immediately on observe with the initial size — harmless (it just re-runs `sizeOf()` with the same dimensions), but we should make sure it doesn't run before `run`/`ctx` exist. It won't: the observer is created after `runRef` is populated in the same effect.
- **Trail-clear flash (bg-refill):** accumulation diversions that fade rather than full-clear (`flow-field`, `gravity-wells`) will flash the page background in the newly-exposed region after a resize. Fix in each diversion's existing `resize()` hook: fill the configured background color over the full canvas. ~2 lines each. Buffer-based diversions (`substrate`, `sand-stroke`) already blit a full CSS-px buffer every frame, so they self-heal and need no change. This honors the black-box rule — the diversion owns its background color, the framework does not guess it.

## Testing

- **`AnimationHost.test.tsx`** — extend with:
  - reduced-motion: mock `matchMedia` → `reduce`; assert the loop receives `setPaused(true)` after the first frame and the diversion's `frame` was called at least once (first-frame painted).
  - offscreen: mock `IntersectionObserver`; fire a non-intersecting entry → assert `setPaused(true)`; fire intersecting → `setPaused(false)` (when no other gate active).
  - resize: mock `ResizeObserver`; fire a callback → assert `diversion.resize` called with new size.
- Union logic: assert that clearing one gate does NOT unpause while another gate is still active (e.g. offscreen clears but `document.hidden` true ⇒ still paused).
- Diversion `resize()` bg-fill: covered by existing diversion unit tests if any assert on canvas ops; otherwise rely on Chrome verify (visual).

## Chrome verification checklist

1. Gallery: scroll tiles out of view → confirm offscreen tiles stop animating (DevTools perf / fps), re-enter view → resume.
2. Reduced-motion: emulate `prefers-reduced-motion: reduce` (DevTools rendering pane) → open a diversion → confirm one frame painted then frozen, hint chip visible, ▶ press animates.
3. Resize: drag window / toggle fullscreen on flow-field & gravity-wells → confirm canvas refits crisply (no blur/stretch) and no background flash in the newly-exposed area.

## Order / bundling

One feature branch `feature/screensaver-hardening`, three logical commits:
1. **#7** ResizeObserver + diversion bg-refill (independent, lowest risk — lands first).
2. **#39** reduced-motion (introduces the unified pause model).
3. **#6** offscreen pause (extends the pause model the #39 commit established).

FF-merge to `main` after Chrome verify + diversion-reviewer pass.
