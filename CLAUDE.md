# Diversion — project conventions

A gallery of independent screensaver-like generative-art "diversions" sharing one framework + one design ethos. Read `README.md` for orientation, `docs/superpowers/specs/` for the design spec.

## Architecture (load-bearing)

- **The framework owns the chrome; a diversion is a black box that draws.** A diversion implements `{ id, title, description, kind, schema, setup, frame, resize?, teardown? }` (`src/framework/types.ts`). The framework owns the `requestAnimationFrame` loop and calls `frame(state, ctx, t, dt)` each tick. Diversions never touch React.
- **One Zod schema per diversion is the single source of truth** — it drives the config form, the URL codec, AND the `Config` type. Each field carries `.meta({ ui, label, help, min, max, step, options })`.
- **`kind: '2d' | 'webgl'`** selects which context the host acquires. 2D contexts are DPR-scaled so sims draw in CSS pixels; WebGL gets device pixels.
- **Registry auto-discovers** diversions via `import.meta.glob('../diversions/*/index.ts')` — a new folder is picked up with no registration.
- **Config ⇆ URL codec** (`framework/urlCodec.ts`): flatten nested → dotted keys, omit defaults (short URLs), `safeParse` on decode (bad URL → defaults, never throws into the loop). It is the keystone — keep it fully tested.

## The five UX invariants (treat as MUST)

1. Readability is key. 2. Hide nothing — every variable stays **discoverable** and shows its live value; never bury live state behind an accordion the user must expand to see it. Mode-dependent controls *may* swap (a `showWhen` panel that shows only the active mode's options — e.g. the Color panel's palette-vs-gradient controls) as long as the hidden data returns when you switch the controlling field. Discoverable ≠ always-on-screen. 3. Add inline help when confusing (`.meta({ help })`, persistent — not hover-only). 4. Sliders only when bounds are defined (`ui:'slider'` needs min/max; open-ended → `ui:'number'`). 5. Err toward more contrast.

## Conventions

- **Tests:** Vitest, co-located `*.test.ts(x)` next to sources. Pure logic (codec, noise, loop) is unit-tested; UI via @testing-library/react. Anti-regression must-haves: codec round-trip + resilience, control-selection-from-schema, noise determinism.
- **Stack:** Vite + React 19 + TypeScript + Zod 4. Custom `SchemaForm` (no form-generator dep) and custom URL codec. React Router for the 3 routes.
- **Dev server:** pinned to **port 5180** (`vite.config.ts`).
- **Verify in Chrome** (chrome-devtools MCP), never a built-in preview. Visual quality matters — verify the animation actually looks good, not just that it renders.
- **Git identity:** `MattAltermatt <1435066+MattAltermatt@users.noreply.github.com>`. Branch `feature/...`, FF-merge to `main` after verify.

## Gotchas learned

- **A flow-field-style sim needs particle respawn/lifecycle** or all particles collapse onto one streamline. Missing-lifecycle = mechanism bug, not tuning.
- **HiDPI:** size the canvas backing store to `cssW*dpr` and `setTransform(dpr,…)` for 2D so the sim works in CSS pixels (density + crispness). Reapply the transform on every resize (resizing a canvas resets its context state).
- **Config changes go through `diversion.update?(state, config, size)`** first (live-apply, e.g. swap `state.cfg` + recompute derived data); return falsy and the framework falls back to a full teardown + `setup`. `AnimationHost` runs `setup` in a `[diversion]` effect (live run held in a ref) and `update` in a `[config]` effect — so visual params don't reallocate. Structural changes a diversion can't apply live (flow-field: particle count, seed) just return false. Diversions without `update` re-run `setup` on every config change (the old behavior).
- **Zod 4:** `.meta({...})` chains after `.default(...)`; read it back with `.meta()`. Grouped fields are `.default().meta()`-wrapped — unwrap via `.unwrap()` to reach the `ZodObject.shape` (see `SchemaForm.asObject`).
