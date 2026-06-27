# Flow Field — Gradient color mode

**Issues:** #26 (Gradient color mode) · subsumes #25 (Field Hue) · **Date:** 2026-06-26 · **Status:** design approved

Add a continuous, source-driven **Gradient** color mode to Flow Field alongside today's **Palette Set** mode, selected by a new `colorMode` switch. A gradient is an evenly-spaced, ordered list of color stops sampled along a per-particle **color source** (flow-angle, x, or y). This is the most expressive continuous color mode and **subsumes Field Hue (#25)** — an HSL hue sweep is just a gradient whose stops trace an HSL arc, so no separate HSL mode is built.

Scoped to **one diversion (Flow Field)**. The framework-level reusable color-mode engine (#24) is explicitly **out of scope** — it is gated on a second color-hungry diversion existing (e.g. the WebGL raymarcher #13), which it does not yet.

## Goals

- A `colorMode` selector: `palette` (today's behavior) | `gradient` (new).
- Gradient mode: evenly-spaced multi-stop color list sampled along a color source.
- Color source: `flow-angle` (default), `x`, or `y` position.
- Defaults preserve today's exact look (default `colorMode: 'palette'`); Gradient is opt-in.
- Reuse the `colorList` control + string-array URL codec + per-stop alpha shipped in #23/#3.

## Non-goals

- Framework-level color-mode engine (#24) — deferred until a second consumer exists.
- A separate Field Hue / HSL-arc mode (#25) — subsumed by Gradient; closed.
- **Positioned stops** (`{color, pos}` pairs) — BACKLOG as a #26 refinement; v1 stops are evenly spaced.
- A `speed` color source — the sim's per-frame step magnitude is constant across particles, so a speed source would be near-constant and inert (violates "hide nothing / readability"). Excluded.
- Any change to the white-out tame — already handled by the `screen` default + trail/lifespan sliders shipped this session.

## Decisions (from brainstorm)

- **Gradient subsumes Field Hue** (Q1=A): one Gradient mode, close #25. Hue sweeps via HSL-arc stops.
- **Color sources** (Q2=A): `flow-angle`, `x`, `y`; default `flow-angle` (most flow-field-native — colors trace field direction, rendering vortices/spines as rotating bands of hue). `speed` dropped.
- **Stop shape** (Q3=A): evenly-spaced ordered color list — reuses the `colorList` control and string-array codec. Per-stop alpha retained for additive richness. Positioned stops deferred.
- **Cyclic wrap:** the `flow-angle` source is cyclic (0→2π); its gradient **wraps** (last stop blends back to first) to avoid a seam at the angle rollover. `x`/`y` sources clamp at the ends.
- **Default mode `palette`:** preserves today's default look; Gradient opt-in.
- **Inert-but-visible:** both `palette` and `gradient` groups stay fully visible regardless of mode (the same precedent as this session's inert-while-off Trail length slider); help on each notes which mode it drives.

## Schema (`src/diversions/flow-field/schema.ts`)

- **`colorMode`** — new: `z.enum(['palette','gradient']).default('palette')` with
  `.meta({ ui:'segmented', options:['palette','gradient'], label:'Color mode', help:'Palette: each particle keeps one random color from the list. Gradient: color is sampled along a source (direction or position).' })`.
- **`background`** — **promoted to a top-level field** (it is a mode-independent global used by the fade fill, not part of either color source). Moves out of the `palette` group: `z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')` with `.meta({ ui:'color', label:'Background' })`. (Flow Field is unreleased — schema reshape is free; see `wip-diversion-versioning` memory.)
- **`palette`** — group now holds only `colors[]` (unchanged array: `min(1).max(8)`, `colorList` control, the existing default 4 colors). Label `'Palette colors'`; help notes it drives color only in Palette mode.
- **`gradient`** — new group `{ source, stops }`:
  - `source: z.enum(['flow-angle','x','y']).default('flow-angle')` with `.meta({ ui:'segmented', options:['flow-angle','x','y'], label:'Gradient source', help:'What maps onto the gradient: flow-angle (particle direction — cyclic, wraps), or x / y screen position.' })`.
  - `stops: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/)).min(2).max(8).default(['#ff3b3b22','#ffd23b22','#3bff7a22','#3bd2ff22','#6a3bff22'])` with the `colorList` control (`min:2, max:8`), label `'Gradient stops'`, help noting even spacing + per-stop alpha. The default is a low-alpha (`0x22`) red→yellow→green→cyan→blue/violet hue arc that wraps cleanly (blue→red) for the cyclic flow-angle source, so switching to Gradient immediately looks good.

Field order: `colorMode` near the other color controls (after `blend`/before `fadeTrails`, grouped with color concerns), `background` top-level, then the `palette` and `gradient` groups adjacent so the two modes read together.

## Mechanism (`src/diversions/flow-field/flowField.ts`)

### Gradient sampling (pure, exported, tested)

```ts
/** Linear-interpolate rgba across evenly-spaced stops at t in [0,1].
 *  wrap=true blends the last stop back to the first (for cyclic sources). */
export function sampleGradient(stops: string[], t: number, wrap: boolean): string
```

- Stops are `#rrggbbaa`; parse each to {r,g,b,a} (reuse the parsing in `hexToRgba`).
- Segment count = `wrap ? stops.length : stops.length - 1`. Locate the segment for `t`, lerp r/g/b/a between its two endpoints (the second endpoint of the final wrap segment is `stops[0]`), return an `rgba(...)` string in the same format `hexToRgba` produces.
- `t` is clamped to `[0,1]`; a single distinct stop (or `t` exactly on a stop) returns that stop's color.

### Color source → t (pure, exported, tested)

```ts
/** Map a particle's chosen color source to t in [0,1). */
export function colorSourceT(source: 'flow-angle'|'x'|'y', x: number, y: number, angle: number, w: number, h: number): number
```

- `x` → `x / w`, `y` → `y / h` (both clamped to `[0,1]`).
- `flow-angle` → `((angle % 2π) + 2π) % 2π / 2π` (normalized into `[0,1)`; pairs with `wrap=true`).

### Stroke color selection in `stepFlow`

- `palette` mode → unchanged: `styles[p.ci % styles.length]`.
- `gradient` mode → per particle, per frame: compute `angle` (already computed for movement), `t = colorSourceT(cfg.gradient.source, p.x, p.y, angle, w, h)`, `color = sampleGradient(cfg.gradient.stops, t, cfg.gradient.source === 'flow-angle')`; set `ctx.strokeStyle = color`.
- The fade fill reads `cfg.background` (was `cfg.palette.background`).
- `createFlowState` still precomputes `styles` from `cfg.palette.colors` for Palette mode; the per-particle `ci` is still assigned (harmless/unused in Gradient mode — keeps determinism + instant mode-switch).

## UX invariants check

1. **Readability** — segmented `colorMode` + clearly-labeled source/stops. ✅
2. **Hide nothing** — both palette and gradient groups always visible/live; inert-mode controls stated in help, not hidden (Trail-length precedent). ✅
3. **Inline help** — `colorMode`, `source`, `stops`, `palette colors` all carry persistent help noting mode dependency. ✅
4. **Sliders only when bounded** — no new sliders; color/colorList/segmented controls. ✅
5. **More contrast** — unchanged theme. ✅

## Testing (`flowField.test.ts`, co-located)

- **`sampleGradient`** — `t=0`→stop0 exact; `t=1`→last stop exact (non-wrap); midpoint of 2 stops = component-wise average; `wrap=true` at `t→1` blends last→first (≈ stop0 at t exactly 1, with wrap the segment endpoint is stop0); 2-stop and many-stop cases.
- **`colorSourceT`** — `x`/`y` normalize and clamp to `[0,1]`; `flow-angle` of `0`, `π`, `2π`, and a negative angle all land in `[0,1)`.
- **schema defaults** — `colorMode==='palette'`; `gradient.source==='flow-angle'`; `gradient.stops` length ≥2; `background==='#0a0a12'` at top level.
- **determinism** — same seed → identical particle layout (RNG call order in `createFlowState` unchanged: x, y, age, life, ci).
- **codec** — `colorMode`/`gradient.source` enums + `gradient.stops` string array round-trip; existing codec round-trip/resilience tests cover enums + string arrays (no new codec code). `background` is now a top-level dotted key, not `palette.background` — confirm round-trip.

## Build sequence

1. Schema: add `colorMode`; promote `background` to top-level; reduce `palette` to `colors[]`; add `gradient` group (`source`, `stops`).
2. `flowField.ts`: add `sampleGradient` + `colorSourceT`; branch stroke color by `colorMode`; point fade fill at `cfg.background` (+ tests).
3. Chrome verify: default look unchanged (Palette mode); switch to Gradient → flow-angle shows rotating hue bands with no seam; switch source to x/y → linear sweeps; edit stops (add/remove/alpha) live; share-link round-trip across mode + source + stops + background.

## Issue housekeeping

- **#26** — closed by this.
- **#25** — closed as **subsumed by #26** (Gradient subsumes the HSL-arc Field Hue).
- **#24** — stays **deferred** (no second color-hungry diversion yet).
- **Positioned stops** — BACKLOG as a #26 refinement.

## Open / deferred

- Positioned gradient stops (`{color, pos}`) — #26 refinement, backlogged.
- Framework reusable color-mode engine (#24) — deferred to when a 2nd consumer exists (#13).
- A `diversion.update?` hook to avoid full `setup` re-run on each edit — still backlogged; mode-switch works fine under re-run-setup.
