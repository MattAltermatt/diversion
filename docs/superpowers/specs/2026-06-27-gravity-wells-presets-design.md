# Gravity Wells presets — design (#42)

**Date:** 2026-06-27
**Issue:** #42 — Gravity Wells polish pass.
**Status:** approved (brainstorm), ready for plan.

## Scope

Issue #42 has three wants. One is already shipped, one is reframed, one is the
deliverable here:

1. **Control organization** — ✅ shipped last session as collapsible subpanels
   (`fieldMeta` + `Subpanel.tsx`, commit `ab0bb38`). Out of scope.
2. **Color picker / "easier palette-gradient editing"** — resolved as
   **presets, not a richer widget**. The existing `ColorList` control already
   gives every color a native swatch picker + hex field + alpha slider; the real
   "easy editing" win is curated picks, exactly how Flow Field solved it. The
   `ColorList` control is **unchanged**.
3. **Preset pickers** — THE deliverable. Gravity Wells currently has no presets.
   Add two independent preset axes (Motion + Color), mirroring Flow Field's
   Flow/Color structure.

This is **purely additive data** — it does not change any default config value,
so there is no gameplay-tuning gate. The default config already equals the first
option of each axis (Vortex / Tide), so the pickers read a named preset on load
rather than "Custom".

## Architecture

Mirrors `src/diversions/flow-field/presets.ts` + its `index.ts` wiring exactly —
the framework preset seam is already built (`PresetGroup`/`PresetOption` in
`types.ts`, `PresetPicker.tsx`, `matchPresets`/`applyPreset` in
`framework/presets.ts`, rendered by `ConfigScreen`). No framework changes.

### New file: `src/diversions/gravity-wells/presets.ts`

Two axes, each a `Pick<>` of the config:

- **Motion axis** — the flow + well dynamics + trails (everything motion-related
  except `seed` and color):
  `particles · particleSize · noiseScale · fieldDrift · gravityInfluence ·
   swirl · speed · maxWells · wellLifespan · forceMin · forceMax · fadeTrails ·
   trailLength`
- **Color axis** — the canvas + palette: `background · blend · color`.

`seed` is excluded from both (the 🎲 dice stays independent of the chosen look —
same rule as Flow Field).

Each option carries a `patch: Partial<GravityWellsConfig>`. Top-level spread, so
the nested `color` group is supplied whole.

### Unused-axis fallback (color)

Same safety pattern Flow Field uses: a palette preset still carries a complete,
valid gradient-stops array and vice-versa, so toggling Mode in the form never
lands on empty data. Shared fallback constants:

- `FALLBACK_STOPS` (for palette presets) = the schema default stops
  `['#1b3a8aaa','#3bd2ffaa','#ffd23baa','#ff3b3baa']`
- `FALLBACK_COLORS` (for gradient presets) = the schema default palette
  `['#3bd2ffaa','#4d9bffaa','#ffd23baa','#ff7a3baa']`

Using the schema defaults as the fallbacks guarantees the **Tide** color preset
deep-equals the schema default `color` group exactly (so it matches on load).

### Wiring: `src/diversions/gravity-wells/index.ts`

Add a `presets: PresetGroup<GravityWellsConfig>[]` with two groups, identical
shape to Flow Field:

```ts
const presets: PresetGroup<GravityWellsConfig>[] = [
  { label: 'Motion', options: motionPresets.map((p) => ({ name: p.name, patch: p.motion })) },
  { label: 'Color',  options: colorPresets.map((p) => ({
      name: p.name, patch: { background: p.background, blend: p.blend, color: p.color } })) },
]
```
and attach `presets` to the exported diversion object.

## Motion presets (6)

All carry `fadeTrails: true` and `forceMin: 0.1`. Vortex = the exact shipped
schema defaults.

```text
name        particles size  noiseScale fieldDrift grav  swirl speed wells life forceMax trail
----------  --------- ----  ---------- ---------- ----  ----- ----- ----- ---- -------- -----
Vortex*     10600     1.6   0.0016     0.35       1.6   1.00  0.20  5     60   1.5      95
Maelstrom   9000      2.2   0.0040     0.60       2.0   0.90  0.50  8     25   1.8      60
Drain       9000      1.4   0.0016     0.20       1.8   0.00  0.25  6     40   1.6      85
Spiral      10000     1.6   0.0020     0.40       1.6   0.55  0.30  5     45   1.5      90
Drift       7000      2.4   0.0012     0.15       0.8   0.70  0.15  4     60   1.2      80
Galaxy      14000     1.0   0.0008     0.25       1.4   0.95  0.18  10    50   1.3      95
```
`*Vortex` carries the shipped defaults so the Motion picker reads "Vortex" on load.

Character: spread across the swirl axis (0 = pure drain → 1 = pure whirlpool) and
density (7k → 14k particles) so each preset is visually distinct.

## Color presets (7)

All `0xaa` alpha (Gravity Wells convention — long trails + lighten blend keep hue
without white-out). Tide = the exact shipped color defaults.

```text
name        background blend    mode      colors / stops
----------  ---------- -------  --------  ----------------------------------------------------
Tide*       #05060f    lighten  palette   #3bd2ffaa #4d9bffaa #ffd23baa #ff7a3baa
Nebula      #05060f    screen   palette   #3a6dffaa #18d2ffaa #ff45a8aa #d6e6ffaa
Ember       #0a0a0c    lighten  palette   #bf2408aa #ff8c1aaa #ffbe3eaa #ffb56eaa
Acid        #02080a    lighten  palette   #39ff14aa #aaff00aa #00ffc8aa #d4ff3aaa
Mono        #050507    lighten  palette   #e6ebf2aa #a8b3c4aa #5e6a7eaa
Spectrum    #06060a    lighten  gradient  #ff4d6aaa #ffb24daa #7cff4daa #4dd6ffaa #9a6bffaa  (source flow-angle)
Field Heat  #06060f    lighten  gradient  #1b3a8aaa #3bd2ffaa #ffd23baa #ff3b3baa            (source FIELD)
```
`*Tide` carries the shipped color defaults so the Color picker reads "Tide" on load.

**Field Heat** is the showcase preset: `source: 'field'` maps gravity-bend
strength onto the gradient, so particles caught in a strong well flare from cold
indigo to hot red — a behavior unique to Gravity Wells (Flow Field has no `field`
source).

Palette presets set `source: 'flow-angle'` + `stops: FALLBACK_STOPS`; gradient
presets set `colors: FALLBACK_COLORS`.

## Testing

New `src/diversions/gravity-wells/presets.test.ts`, mirroring
`flow-field/presets.test.ts`:

1. **Every preset patch parses** against `gravityWellsSchema` (merge patch onto
   defaults, `schema.parse` must succeed) — guards typos / out-of-range values.
2. **Vortex motion deep-equals the schema motion defaults** — so the Motion
   picker reads "Vortex" on load (regression guard if a default changes).
3. **Tide color patch deep-equals the schema color defaults** (background +
   blend + color group) — so the Color picker reads "Tide" on load.
4. **`matchPresets` round-trips**: applying each option's patch onto the default
   config and running `matchPresets` returns that option's name for its group.
5. **Unique names** within each axis.

## Out of scope (record, don't build)

- Richer color-picker widget (HSL/eyedropper/drag-reorder) — `ColorList` already
  suffices; presets cover the "make it look good fast" path.
- Palette/gradient preview bar — considered (brainstorm option B), deferred.
- Framework-wide SchemaForm reorganization — already addressed by subpanels.
