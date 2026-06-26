# 📓 Changelog

## Unreleased

### Fixed
- **Flow Field GC hitches (#11)** — the hot loop built a fresh `hsl(…)` string per particle per frame (~240k/sec at high particle counts), churning the garbage collector into periodic micro-stutters. Stroke styles are now memoized by integer hue (`makeHueStyleCache`), so a populated field allocates at most 360 strings total. Visual output is unchanged.

## v0.1.0 — 2026-06-26 — Framework + Flow Field

First cut. The framework spine and one reference diversion, proven end-to-end in Chrome.

### Added
- **Diversion contract** (`framework/types.ts`) — `{ id, title, description, kind, schema, setup, frame, resize?, teardown? }`; the framework owns the rAF loop.
- **Registry** (`framework/registry.ts`) — auto-discovers diversions via Vite glob; no manual registration.
- **Config⇆URL codec** (`framework/urlCodec.ts`) — one Zod schema → form + URL + types. Flattens nested config to dotted keys, omits defaults for short URLs, and validates on decode so a bad/hand-edited URL degrades to defaults instead of throwing. Fully unit-tested (round-trip, coercion, resilience).
- **Schema-driven form** (`framework/SchemaForm.tsx` + `controls/`) — picks the control from each field's `.meta({ ui })`; recurses into nested groups (expanded). Controls: slider, number, segmented, toggle, swatch, group.
- **Animation host** (`framework/AnimationHost.tsx` + `useAnimationLoop.ts`) — single rAF loop, manual pause, tab-hidden auto-pause, FPS readout, fullscreen, HiDPI-correct 2D rendering.
- **Three screens** — gallery (live-preview tiles), config (form + live preview, URL-synced), play (full canvas from URL).
- **Flow Field diversion** — seeded value-noise, particle advection with trail fade, a respawn lifecycle, mixed-type config (sliders, an open-ended seed number, segmented blend, toggle, color, nested palette group).
- **"Instrument" theme** — high-contrast dark studio honoring the five UX invariants.

### Fixed (during verify + code review)
- Flow field collapsed all particles onto a single streamline — added a **particle respawn lifecycle** so the field stays populated.
- **HiDPI**: the 2D context now scales by DPR so the sim draws in CSS pixels (correct density + crisp lines) instead of device pixels.
- `blend: 'normal'` mapped to the valid `source-over` composite op.
- **Seed determinism**: particle init + respawn now use a seeded RNG (was global `Math.random()`), so the same seed truly regenerates the same pattern as promised.
- **Toggle** control now renders inline `help` like every other control (invariant #3).
- **Play-screen chrome auto-hides** after ~2.5s idle and wakes on mouse-move (screensaver feel), per spec.

### Tuned
- Flow Field **Speed** range narrowed to 0–1 with fine 0.01 steps (default 0.5).

### Hardened (full code-review pass)
- **dt-clamp** (≤50ms) in the loop so a tab-return after the rAF suspension doesn't teleport time-driven diversions.
- Flow Field particle **lifespan now in milliseconds** (was frames) → identical behavior at 30/60/120fps.
- **FPS sampling skipped** when the readout is hidden (gallery tiles no longer re-render twice/sec for nothing).
- **Slider/number readouts** formatted to the step's precision; removed a `no bounds → number` dev tag that leaked into the UI.
- `SchemaForm` **throws a clear error** on an unknown control type instead of rendering `null`.
- Larger findings (codec generalization for non-numeric arrays, share-link default-coupling, gallery offscreen-pause, contract type/input seams, nuqs reconciliation) filed as GitHub Issues.

### Deploy
- GitHub Pages via Actions (Vite `base: /diversion/`, router `basename`, `404.html` SPA fallback).

### Notes
- nuqs is installed but not yet wired — the codec + React Router `navigate()` handle v1 URL sync. Available for future per-param needs.
- Dev server pinned to port **5180**.
