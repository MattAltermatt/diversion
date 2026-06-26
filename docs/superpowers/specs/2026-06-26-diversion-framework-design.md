# 🌀 Diversion — Framework + Flow Field (v1) Design Spec

**Date:** 2026-06-26
**Status:** Approved design → ready for implementation plan
**Scope of this spec:** the shared framework + one reference diversion (Flow Field) proven end-to-end.

---

## 🎯 What this is

**Diversion** is a personal web gallery of independent, screensaver-like generative-art mini-projects ("diversions"). Each diversion is unrelated in *content* — one might be a particle flow field, the next a cellular automaton, the next a raymarched shader — but they all share **one design ethos and one framework**. The collection grows over time; adding a new diversion should be pure content authoring against a fixed contract.

Every diversion has two screens:

1. **Config screen** — controls on the left, a live animation preview on the right.
2. **Animation screen** — a full-viewport canvas (fullscreen-able) that reads its entire configuration from the URL.

v1 ships the framework plus a single polished reference diversion (**Flow Field**) that exercises every seam of the contract.

---

## 🧱 Architecture overview

The framework standardizes the **chrome** around each piece and treats *what renders* as a black box. A diversion hands the framework a config schema and a set of lifecycle hooks; the framework owns everything else — routing, the config form, URL syncing, the animation loop, fullscreen, pause, FPS, and thumbnails.

```
┌─────────────────────────────────────────────────────────────┐
│  React + Vite chrome                                         │
│                                                             │
│   /                 Gallery index (tiles = live previews)   │
│   /d/:slug          Config screen (form left, preview right)│
│   /d/:slug/play     Animation screen (full canvas)          │
│                                                             │
│   ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│   │ Registry    │   │ SchemaForm   │   │ URL codec       │  │
│   │ (diversions)│   │ (Zod→form)   │   │ (config⇆params) │  │
│   └─────────────┘   └──────────────┘   └─────────────────┘  │
│           │                 │                  │            │
│           ▼                 ▼                  ▼            │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ AnimationHost — owns the rAF loop, canvas, fullscreen │  │
│   │ pause / visibility-pause / FPS / thumbnail capture    │  │
│   └─────────────────────────────────────────────────────┘  │
│                          │ drives                            │
│                          ▼                                   │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ Diversion (black box): setup / frame / resize /       │  │
│   │ teardown — draws into a 2D or WebGL context           │  │
│   └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Tech stack

```text
Build / dev      Vite (6/7) + TypeScript
UI               React 19
Schema           Zod 4 — ONE schema per diversion drives form + URL + types
URL state        nuqs (typed URL search-param state) on the config screen
Routing          React Router (3 routes: index, config, play)
Forms            custom SchemaForm (~150 lines) — switches on a `ui` hint in
                 each field's Zod .meta(); NO generator dependency
Primitives       Radix / shadcn for the underlying controls
Testing          Vitest (round-trip codec tests, schema tests, form-logic tests)
```

**Why React** (decided via a 3-way panel vs Solid/Svelte): ecosystem size was the top priority, React wins it decisively, and the hard part (config + URL round-trip) is framework-agnostic — so React costs nothing on the architecture. The 60fps concern is a non-issue because **no framework code runs in the animation hot path** (see below).

---

## 🔌 The diversion contract (the spine)

A diversion is a plain module implementing this interface. The framework owns the `requestAnimationFrame` loop and calls `frame` each tick.

```ts
interface Diversion<Config> {
  // ---- metadata ----
  id: string;                         // slug, e.g. "flow-field"
  title: string;                      // "Flow Field"
  description: string;                // one-line gallery blurb
  kind: '2d' | 'webgl';               // which context the framework acquires

  // ---- config ----
  schema: ZodSchema<Config>;          // drives the form, URL codec, AND the Config type

  // ---- lifecycle (framework-driven loop) ----
  setup(ctx: RenderContext, config: Config, size: Size): State;
  frame(state: State, ctx: RenderContext, t: number, dt: number): void;
  resize?(state: State, size: Size): void;
  teardown?(state: State): void;
}
```

- `RenderContext` is `CanvasRenderingContext2D` for `kind: '2d'` or `WebGL2RenderingContext` for `kind: 'webgl'`. The framework acquires the right one based on `kind`.
- `setup` builds whatever the diversion needs (particle arrays, compiled shaders, GL buffers) and returns an opaque `State` the framework threads back into `frame`/`resize`/`teardown`.
- `frame` draws exactly one frame given the current time `t` (ms) and delta `dt` (ms). It must not call `requestAnimationFrame` itself.
- The diversion never touches React. The framework renders one `<canvas>` and hands over its context.

### Framework-owned features (built once, free for every diversion)

- **Animation loop** — single rAF, consistent `t`/`dt`, started/stopped on mount/unmount.
- **Pause / resume** — manual, plus **auto-pause when the tab/window is hidden** (Page Visibility API).
- **FPS readout** — toggleable overlay.
- **Fullscreen** — Fullscreen API on the canvas.
- **Restart** — re-run `setup` (e.g. after a seed change).
- *(Thin capability, not wired into v1 gallery)* **Thumbnail capture** — grab a frame to a data URL, for the future static-thumbnail backlog item.

---

## 🗺️ Screens & routes

```text
/                 Gallery index
                  Grid of tiles, one per registered diversion. Each tile shows a
                  LIVE mini-preview at default config + title + blurb. Clicking a
                  tile → its config screen.
                  (Live previews are fine at v1 scale; switching to captured static
                  thumbnails is a BACKLOG item for when the collection grows large.)

/d/:slug          Config screen
                  Left: SchemaForm (all params, fully exposed). Right: live preview
                  running via AnimationHost. Editing a control updates the preview
                  immediately AND writes to the URL (nuqs). An "Open animation ↗"
                  button links to /d/:slug/play with the current params.

/d/:slug/play     Animation screen
                  Full-viewport canvas. Config parsed ENTIRELY from URL params on
                  mount (frozen — no live form). Chrome (back, fullscreen, fps)
                  appears on mouse-move and auto-hides after a few seconds, like a
                  video player — keeps the screensaver feel. Fullscreen available.
```

---

## 🔗 Config ⇆ URL round-trip (framework-agnostic core)

One Zod schema per diversion is the single source of truth for the form, the types, and the URL codec.

**Encoding** (`config → URLSearchParams`):
- Flatten nested objects to dotted keys: `palette.hueStart` → `palette.hueStart=200`.
- **Omit any value still equal to its schema default** → short, clean URLs.
- Arrays/vectors use a compact join convention (e.g. `warp=0_0`).

**Decoding** (`URLSearchParams → typed Config`):
- Rebuild the nested object from dotted keys, coercing by the default's type (number/boolean/array/string).
- `schema.parse()` fills every omitted field from its `.default()` **and validates** — so a hand-edited or stale URL (`?particles=999999`) is clamped/rejected by the same bounds that constrain the slider.
- Decode **never throws into the render loop**: on failure it falls back to validated defaults.

This codec is written once in the framework and reused by every diversion regardless of config complexity. **Adding a diversion = a schema + the lifecycle hooks; zero new form or URL code.**

**How nuqs and the codec compose (no overlap):** the custom codec owns the *serialization logic* (nested flatten/unflatten + Zod-validated parse). nuqs is only the *reactive transport* on the config screen — it makes slider edits write to the URL live and keeps browser back/forward working, delegating the actual (de)serialization to the codec via custom parsers. The play screen skips nuqs entirely and calls the codec directly to parse the URL once on mount. One serialization implementation, used by both screens.

---

## 🎛️ Design ethos — "Instrument" + 5 invariants

Shared aesthetic: **high-contrast dark "studio"** — near-black background, near-white labels, a single bright-cyan accent, monospace labels, crisp hairline borders. The chrome stays quiet so the art dominates; the underlying art palette is per-diversion.

These five UX principles are **invariants — implemented in the first pass, not deferred polish:**

1. **Readability is key.** Legible type and sizes; no decorative-over-legible tradeoffs (no serif-italic labels, no glow that smears edges).
2. **Hide nothing from the user.** No collapsed groups, no "advanced" drawers, no progressive disclosure. Every param is visible at once; nested groups render **expanded**. Every control shows its live numeric value.
3. **Add help when confusing.** Each schema field may carry `.meta({ help })`; when present it renders as persistent inline subtext (not a hover-only tooltip that can be missed).
4. **Sliders only when bounds are truly defined.** The SchemaForm picks the control from the schema:
   ```text
   number + min & max  → slider (with editable numeric readout)
   number, open-ended  → number input (typed, with – / + steppers)
   enum                → segmented buttons
   boolean             → toggle
   color (hex string)  → swatch + picker
   nested object       → expanded group (labeled, accent-barred)
   vector/array        → grouped number inputs   [future control, as needed]
   ```
5. **Err toward more contrast.** High-contrast palette; bright foreground on deep background; crisp borders. No muted/washed tones.

Control vocabulary for v1: **slider · number-input · segmented · toggle · swatch**. Vector and other control types get added when a future diversion's schema needs them.

---

## 🌊 Reference diversion: Flow Field

A 2D-canvas particle flow field. Particles advect through a Perlin/simplex-noise vector field, leaving fading trails. Chosen as the reference because it stress-tests every control type and the nested-group + open-ended-param cases.

**Config schema (illustrative):**

```ts
const flowFieldSchema = z.object({
  particles:  z.number().int().min(100).max(20000).default(4000)
                .meta({ ui: 'slider', step: 100, label: 'Particles' }),
  noiseScale: z.number().min(0.0005).max(0.02).default(0.004)
                .meta({ ui: 'slider', step: 0.0005, label: 'Noise scale',
                        help: 'Lower = broad, sweeping currents. Higher = tight, turbulent detail.' }),
  speed:      z.number().min(0).max(5).default(1.2)
                .meta({ ui: 'slider', step: 0.1, label: 'Speed' }),
  seed:       z.number().int().default(10847)            // no bounds → number input
                .meta({ ui: 'number', label: 'Seed',
                        help: 'Any integer. The same seed always regenerates the same pattern.' }),
  blend:      z.enum(['lighter', 'screen', 'normal']).default('lighter')
                .meta({ ui: 'segmented', label: 'Blend' }),
  fadeTrails: z.boolean().default(true)
                .meta({ ui: 'toggle', label: 'Fade trails' }),
  palette: z.object({
    background: z.string().regex(/^#[0-9a-f]{6}$/i).default('#0a0a12')
                  .meta({ ui: 'color', label: 'Background' }),
    hueStart:   z.number().min(0).max(360).default(200)
                  .meta({ ui: 'slider', step: 1, label: 'Hue start' }),
    hueRange:   z.number().min(0).max(360).default(80)
                  .meta({ ui: 'slider', step: 1, label: 'Hue range' }),
  }).meta({ ui: 'group', label: 'Palette' }),
});
```

This `z.infer<typeof flowFieldSchema>` is the exact `Config` type the animation consumes — no duplication.

---

## 🧩 Repo structure (proposed)

```text
src/
  framework/
    AnimationHost.tsx     // owns rAF loop, canvas, fullscreen, pause, fps, capture
    SchemaForm.tsx        // Zod schema → controls (switch on ui hint), recursive groups
    controls/             // Slider, NumberInput, Segmented, Toggle, Swatch, Group
    urlCodec.ts           // encode/decode config ⇆ URLSearchParams (+ tests)
    registry.ts           // diversion registry + lazy loading (Vite glob import)
    types.ts              // Diversion<Config>, RenderContext, Size, State
  diversions/
    flow-field/
      index.ts            // Diversion impl: metadata + schema + setup/frame/resize/teardown
      schema.ts
      flowField.ts        // the actual simulation/render (framework-agnostic)
  routes/
    Gallery.tsx
    ConfigScreen.tsx
    PlayScreen.tsx
  main.tsx
```

Diversions register via a Vite glob import so a new folder under `diversions/` is auto-discovered.

---

## ✅ Testing & anti-regression contract

Vitest, with these as the load-bearing guarantees:

- **URL codec round-trip:** `decode(encode(config)) === config` for representative configs (including nested + non-default values). Defaults omitted from the encoded string.
- **Codec resilience:** malformed/out-of-range URL params → validated defaults, never a throw.
- **SchemaForm control selection:** given a field's Zod meta + bounds, the correct control type is chosen (bounded number → slider; open number → number input; etc.).
- **Schema validation:** flow-field schema accepts valid configs and rejects out-of-range values.

---

## 🚧 Out of scope for v1 (BACKLOG)

- Additional diversions beyond Flow Field (the collection grows post-v1).
- Captured **static thumbnails** for the gallery (v1 uses live mini-previews; revisit at scale).
- Vector/array and other exotic control types (add when a diversion needs them).
- Record-to-GIF / share-image export.
- Diversion-owned animation loop escape hatch (only if a future piece truly needs custom timing).
- Remote GitHub repo creation + deploy pipeline (separate step, needs approval).

---

## 🧭 Decisions captured (for the record)

```text
visual mix          framework hosts BOTH 2d-canvas and webgl diversions
stack               React + Vite + TS + Zod 4 + nuqs + React Router
loop ownership      FRAMEWORK owns the rAF loop
contract            { id, title, description, kind, schema, setup, frame, resize?, teardown? }
v1 scope            framework + 1 reference diversion
reference           Flow Field (2D particle advection)
ethos               "Instrument" — high-contrast dark studio, cyan accent, mono labels
invariants          readability · hide-nothing · inline-help · sliders-only-if-bounded · high-contrast
```
