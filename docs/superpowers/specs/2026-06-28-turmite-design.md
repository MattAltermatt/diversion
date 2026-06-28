# 🐜 Turmite (Langton's ant / turmites) — design

**Issue:** #76 — `xscreensaver/ant: Langton's ant / turmites`
**Source:** xscreensaver hack `ant` by Jamie Zawinski; original hack © its author.
Clean-room port with full credit. Port target: Canvas2D. Ranking: `port:easy`.
**Date:** 2026-06-28 · **Slug:** `turmite` · **Kind:** `2d`

## Summary

A generalized **turmite** (two-dimensional Turing machine) diversion. Langton's
ant is the 2-state special case; we ship the general form: an arbitrary rule
string drives an N-state cellular automaton on a square grid. One or more ants
read the color-state under them, turn per the rule, advance the cell's state,
and step forward — emergent highways, spirals, cardioids, and fractal-ish growth
appear depending on the rule. Gallery-grade palette + calm auto-reseed so it
runs beautifully unattended.

## Core mechanic

```text
Grid of cells, each holding a color-state 0..N-1 (N = rule length). All start 0.
Each ant: { x, y, heading ∈ {N,E,S,W} }.

Per simulation step, for each ant:
  s          = grid[idx(x,y)]
  turn       = rule[s]              // L=left 90°, R=right 90°, U=180°, N=straight
  grid[idx]  = (s + 1) % N          // advance the cell's state
  heading    = applyTurn(heading, turn)
  (x, y)    += dir(heading)         // step one cell
  wrap (x, y) toroidally at grid edges
  repaint cell (x,y) in palette[newState]   // incremental — one cell per step
```

- **Square grid, 4-direction** — the iconic Langton form (`port:easy`).
- **Toroidal wrap** — ants never leave the screen (load-bearing for an
  unattended screensaver; not user-exposed).
- **Incremental draw** — only the visited cell repaints each step. No full-grid
  redraw per frame. The grid array is the source of truth; the canvas is a
  persistent accumulation of painted cells.
- **dt-driven stepping** — `speed` is steps/second; per frame run
  `floor(speed * dt/1000)` steps (carry the fractional remainder) so the rate is
  frame-rate independent.

## Schema (single source of truth)

```text
rule        z.enum([...])  default "LRRRRRLLR"  curated 10–12 rule strings
                          ui:'hidden' — driven by the "Rule" preset dropdown,
                          not a rendered form control (URL-encoded all the same).
ants        slider 1–12   default 3             seeded random start pos+heading
cellSize    slider 2–16   default 4 (px)        smaller = finer/denser
speed       slider 10–4000 default 900 (steps/s) dt-driven; tuned live in Chrome
background  color         deep near-black       canvas fill; negative space
palette     colorList(hex8) 2–12 colors         one per state; palette[0] ≈ bg
seed        number int                          mulberry32; same seed → same start
```

**Decision (C):** the framework form has no free-text control, so `rule` is a
**curated `z.enum` of 10–12 hand-picked rule strings** (incl. `LRRRRRLLR`),
chosen via a **"Rule" preset dropdown** (the PresetPicker `<select>` handles many
options cleanly; `segmented` would overflow). The `rule` field carries
`ui:'hidden'` so it stays in the schema (URL-encoded, codec SSOT) but isn't
rendered as a redundant form control. Arbitrary free-text rules → BACKLOG (needs
a new framework `text` control; `rule` staying a string is the seam).

- **Tiny framework addition:** extend `FieldUi` with `'hidden'`; `SchemaForm`
  already returns `null` for unhandled `ui` (add an explicit `case 'hidden'` for
  clarity). A `'hidden'` field is URL-encoded but not form-rendered.
- **Color mapping:** cells start at state 0; an ant on a state-`s` cell advances
  it to `(s+1) % N` and paints `palette[(s+1) % palette.length]`. The draw path is
  uniform — always `palette[state % len]`. `palette[0]` defaults ≈ `background`
  so a cell cycling back to state 0 reads as erased (correct turmite behavior).
  Palette length is independent of rule length; `% len` degrades gracefully.
- `palette` is **hex8** (the `colorList` control assumes an alpha byte —
  `splitColor` slices bytes 7–9); use `ff` alpha for opaque cells. `meta.max: 12`.

### Presets

- **Rule group** ("Rule") — 10–12 named options, each patches `rule` (a curated
  string). Names are the discoverable interface (Langton, Cardioid, Spiral,
  Fractal, …); the raw enum value is the hidden field. Palette is a separate axis
  (the uniform `% len` mapping means any palette works with any rule), so Rule
  options patch `rule` only — no palette coupling needed.
- **Palette group** ("Palette") — independent axis, gallery-grade color ramps
  (each a full hex8 array). `matchPresets` flips to "Custom" on manual drift.
- Final rule list is curated during impl + Chrome verify (some strings may be
  swapped for prettier growth — a cosmetic/tuning call).

## Screensaver longevity (the seam)

Turmites eventually (a) reach an emergent highway and loop the torus, or
(b) saturate the grid into mush. Neither is acceptable unattended. So:

```text
Auto-reseed:
  - Track painted-cell coverage with a cheap running counter (increment when a
    step paints a previously-state-0 cell).
  - Trigger when coverage crosses a threshold (~grid mostly full) OR a long
    step budget elapses with little fresh coverage (highway / stuck loop).
  - On trigger: calm crossfade the grid toward background, then restart with a
    fresh seeded ant layout for the next generation.
  - Reseed is deterministic: derived from seed + generation counter, so the
    whole run remains reproducible from the URL.
```

Same family as squiral's regrow / flow-field respawn — built in the first pass,
not deferred. Optionally rotate to the next rule each generation (decided at
impl; default may be "same rule, new ants").

## Aesthetic (gallery-grade upgrade)

- **State 0 ≈ background** so unvisited grid reads as calm negative space; states
  `1..N-1` step through a curated, analogous (non-clashing) palette.
- Optional 1px soft gap / anti-aliasing between cells so the lattice reads as
  texture, not a harsh pixel grid. Err toward contrast (invariant #5) while
  staying zen-calm.
- Reuse shared `src/framework/` `rng` / `color` helpers — no bespoke RNG/color.

## Files

```text
src/framework/fieldMeta.ts     + 'hidden' in FieldUi union
src/framework/SchemaForm.tsx   + explicit case 'hidden': return null (clarity)
src/diversions/turmite/
  schema.ts        Zod schema + Config type (single source of truth)
  turmite.ts       framework-agnostic sim: grid, ants, step, draw, reseed (pure)
  presets.ts       rule + palette preset groups
  index.ts         Diversion<Config, State, '2d'> default export
  turmite.test.ts  determinism + rule-engine + wrap + reseed unit tests
```

## Lifecycle hooks

- `setup(ctx, config, size)` — fill background, build grid + seeded ants, return state.
- `frame(state, ctx, t, dt)` — run dt-scaled steps; incremental cell paints; handle
  reseed crossfade. No `requestAnimationFrame` inside.
- `resize(state, size, ctx)` — rebuild grid to new dims, repaint background (canvas
  resize wipes the backing store). Ants reclamped into the new bounds.
- `update(state, config, size)` — live-apply visual-only changes (palette,
  background, speed). Structural changes (rule length, ants, cellSize, seed)
  return false → framework re-runs `setup`.
- `teardown(state)` — drop references; no GPU/listeners to free (2D), but be a
  good unattended citizen.

## Testing

- **Determinism:** same seed → identical initial ant layout; different seed →
  different. (Mirror `flow-field/flowField.test.ts`.)
- **Rule engine:** `applyTurn` for L/R/U/N across all 4 headings; classic Langton
  `RL` produces the known early step sequence; state advance `(s+1)%N` wraps.
- **Toroidal wrap:** stepping off each edge lands on the opposite edge.
- **Coverage counter / reseed trigger:** counter increments only on first paint of
  a cell; trigger fires at threshold.
- Green `npx vitest run` + clean `npx tsc -b --noEmit`.

## UX invariants (MUST, first pass)

1. Readable lattice. 2. Every control discoverable + helped. The rule is chosen
   via the named "Rule" dropdown (Langton / Spiral / …), so the picker itself is
   the discoverable interface; the gallery `description` + the diversion's intro
   carry the turmite concept. 3. Inline help on `speed`, `ants`, `cellSize`,
   `palette`. 4. Sliders only where bounded (`ants`, `cellSize`, `speed`); `seed`
   is number; `rule` is a hidden enum (preset-driven). 5. Err toward contrast in
   the default palette.

## Out of scope (file as issues if wanted)

- **Arbitrary free-text rules** (needs a new framework `text` control). `rule`
  stays a string so this is a clean later upgrade — the seam, not a rewrite.
- Hex / 6- or 8-neighbor grids.
- Ant motion blur / glow trails.
- Audio.

## Credit

Port of xscreensaver `ant` (Jamie Zawinski; original hack © its author).
Clean-room reimplementation. Credit in code header + gallery description.
