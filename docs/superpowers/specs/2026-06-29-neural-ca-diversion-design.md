# Neural CA — design spec

**Issue:** #148 · **Family:** neural cellular automaton (learned growth) · **kind:** `webgl` · **Date:** 2026-06-29

A diversion where each cell runs a tiny *pretrained* neural net over its hex
neighborhood, growing an **endless, continuously-churning abstract texture** from a
seed. The rule is learned weights, not hand-authored — emergence that is *designed*.
Calm, never-settling, always-beautiful: a pure zen screensaver.

## 1. Identity & behavior

- **Self-Organising Textures** flavor (Mordvintsev & Niklasson, *Self-Organising
  Textures*, Distill 2021 — the Hexells art piece), **not** the Growing-NCA
  grow-an-emoji flavor. Chosen because it churns forever (no settling), is abstract
  and tileable, and matches the gallery's zen ethos.
- **One texture at a time**, selectable. Behavior is a single, endless calm churn —
  **no** auto-cycle, **no** damage/self-heal events in v1 (both → backlog).
- **Per-reload genesis variety**: the seed varies the stochastic update mask + seed
  cell so each reload churns into a different variant of the chosen texture (#141
  pattern).

## 2. Architecture (all-GPU, inference-only)

Follows the established FBO-host pattern (`grayscott` / `physarum` / `plasma` as
references), scaled to multi-channel state.

- **State:** ~16 channels per cell — first 4 = visible RGBA, the rest hidden —
  stored across **4× RGBA32F render targets via WebGL2 MRT** (`drawBuffers`),
  **ping-ponged** each step. **NEAREST** sampling throughout (NCA reads exact
  texels), which sidesteps the `OES_texture_float_linear` gotcha entirely.
- **Update shader (one step)**, reimplemented in our raw WebGL2 GLSL following
  hexells' `ca.js` math:
  1. **Perception:** per-channel hex-neighborhood filters (identity + gradient
     kernels) → wide perception vector.
  2. **Dense layer 1** (perception → hidden) + **ReLU**.
  3. **Dense layer 2** (hidden → 16 state deltas), linear.
  4. **Stochastic per-cell update mask** (some cells skip each step — required for
     the trained rule to behave), seeded for per-reload variety.

  Weight matrices uploaded as uniforms/textures from the parsed model.
- **Display shader:** reads the visible RGB channels onto a **hex lattice** → screen.
- **Lifecycle:** `teardown(state)` disposes all programs / VAOs / textures / FBOs
  (gallery-navigation leak rule — context persists on the canvas). Per-frame
  `gl.viewport(...)`. `webglcontextlost` handler `preventDefault()`s and rebuilds
  via `setup`.
- **Performance knobs:** `speed` = sim steps per frame (zen default low). Resolution
  capped (aspect-fit, like grayscott's texel cap) so the per-pixel dense math stays
  affordable.

## 3. Weights asset

- Vendor **`models.json` from `znah/hexells`** (Apache-2.0) into the diversion folder
  as a bundled static asset. **Attribution** in the source header + the diversion
  `description` ("after Mordvintsev & Niklasson, *Self-Organising Textures*").
- A small **pure parser** turns the JSON into typed weight arrays (layer shapes,
  biases) that `setup` uploads to the GPU.
- **Plan step 1 verifies** the file's exact size + per-model field layout before
  committing it (params are tiny — ~8k/model — so almost certainly <1 MB, but
  confirm). This is a feasibility gate, not an assumption.

## 4. Schema / controls (single source of truth)

| field    | ui     | meaning |
|----------|--------|---------|
| `pattern`| select | which trained texture rule runs — curated subset of hexells' models (~8–12 named, e.g. "Bubbles", "Weave", "Grid", "Coral"). Inline help (effect non-obvious). |
| `speed`  | slider | sim steps per frame. Zen default low (~1–2). `min` 0.25, `max` ~6. |
| `scale`  | slider | cell size / resolution → drives the texel cap. Bounded. |
| `seed`   | number | per-reload genesis: seeds the stochastic mask + seed cell. Inline help. |

- All sliders carry `min`/`max` (UX invariant #4); open-ended values use `ui:'number'`.
- **Presets:** a few curated `{ pattern, speed, scale }` combos (e.g. "Bubbles",
  "Weave", "Coral") via the framework's `PresetGroup` data.

## 5. Display / color

- **Native trained RGB**, rendered on the **hex lattice** (the state is hex-trained;
  faithful display = reading visible RGB onto hexagonal cells — also what visually
  distinguishes this from every square-grid diversion).
- Recoloring / palette-remap is **out** for v1 — remapping a net's learned RGB output
  fights the trained look. → backlog.

## 6. Scope / non-goals

**In (v1):** single-texture endless churn · curated pattern picker · `speed`/`scale`/
`seed` controls · native-RGB hex display · per-reload genesis variety.

**Out → backlog** (one follow-up issue at ship, like Labyrinth #151): training custom
textures · auto-cycle / morph between patterns · damage / self-heal events ·
grow-to-target (emoji — #148's literal form) · palette remap · square-grid variant.

## 7. Testing & risks

**Tests** (pure logic — the GPU sim itself is Chrome-verified, consistent with other
`webgl` diversions):

- `models.json` **parser**: correct weight shapes/dimensions, deterministic.
- **schema codec round-trip** (the keystone) + control-selection-from-schema +
  `pattern` enum options present.
- **presets** round-trip / `matchPresets`.
- **seeded-init determinism** (CPU-side seed → deterministic initial state).

**Risks:**

1. **Perf** — dense layers per pixel × steps/frame. Mitigate: resolution cap + low
   default speed + MRT efficiency. Verify fps in Chrome.
2. **Hex fidelity** — perception offsets + lattice layout must match hexells exactly
   or the weights won't reproduce the trained texture. **Plan validates against a
   known hexells texture early** — this is the make-or-break.
3. **models.json format/size** — resolved by plan step 1.

## 8. Credit / license

Weights and the reference update math derive from `znah/hexells` (Apache-2.0,
Alexander Mordvintsev / Eyvind Niklasson). Clean-room TypeScript reimplementation of
the update rule; `models.json` vendored verbatim with attribution. Compatible with
this repo's MIT license + the project's port-credit convention.
