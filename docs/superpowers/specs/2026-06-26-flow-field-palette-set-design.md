# Flow Field — Palette Set coloring

**Issue:** #23 · **Date:** 2026-06-26 · **Status:** design approved

Replace Flow Field's single hue-sweep coloring (`hueStart` / `hueRange`) with a
**Palette Set** mode: the viewer picks a *set* of colors, each carrying its own
alpha; every particle grabs one entry at random when it spawns and keeps it for
life, producing coherent, distinct colored ribbons. Low per-color alpha lets
overlapping ribbons build up into richer color instead of clipping to pure white
— which also tames the additive-blend white-out that motivated #23.

This is **scoped to Flow Field only**. The other two modes originally bundled in
#23 are split out (Field Hue → #25, Gradient → #26), and generalizing any of this
into a reusable framework color engine is deferred to #24. Flow Field is
unreleased, so the schema changes freely with **no backward-compat obligation**
(old `hueStart`/`hueRange` share links may break — see `wip-diversion-versioning`).

## Goals

- A color *set* (arbitrary count) where each entry is **color + alpha**.
- Per-particle random color assignment, stable for the particle's life → coherent ribbons.
- Visible, "hide-nothing" editing of the set in the config panel (UX invariants 1–5).
- No white-out at the bright spines under `lighter` blend at low alpha.

## Non-goals

- Field Hue / Gradient continuous modes (#25 / #26).
- A reusable framework-level `ColorMode` abstraction (#24).
- A mode *selector* — Palette Set is the only Flow Field color mode this pass.
- Backward-compatible decoding of old `hueStart`/`hueRange` URLs.

## Data model

### Schema (`src/diversions/flow-field/schema.ts`)

The `palette` group keeps `background` and replaces the two hue sliders with a
single repeatable `colors` field:

```ts
palette: z.object({
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0a0a12')
    .meta({ ui: 'color', label: 'Background' }),
  colors: z.array(z.string().regex(/^#[0-9a-fA-F]{8}$/))
    .min(1).max(8)
    .default(['#1e63ff1f', '#16d6ff1a', '#ff3ea51a', '#ffffff14'])
    .meta({
      ui: 'colorList',
      label: 'Colors',
      help: 'Each particle picks one color at random when it spawns and keeps it '
          + 'for life. Low alpha lets overlapping ribbons build up into richer '
          + 'color instead of clipping to white.',
    }),
}).default(...).meta({ ui: 'group', label: 'Palette' })
```

- **Each entry is an 8-digit hex string `#rrggbbaa`** — color and alpha in one
  token, so the whole set is a single `string[]`, which the #3 codec already
  encodes/decodes (collision-safe array support). No new codec work.
- **Alpha** is the `aa` byte (`00`–`ff`). The UI edits it as `0–100%`; conversion
  is `round(pct/100 * 255)` ⇄ `round(byte/255 * 100)`. Sub-1% precision loss is
  imperceptible.
- **Bounds:** `min(1)` (the last color can't be removed), `max(8)` (keeps URLs
  and the panel manageable).
- **Defaults:** `#1e63ff` 12%, `#16d6ff` 10%, `#ff3ea5` 10%, `#ffffff` 8% — the
  alphas encoded as `1f / 1a / 1a / 14`.

### Particle state (`flowField.ts`)

`Particle` gains a `ci: number` — an index into `cfg.palette.colors`, chosen
uniform-random at spawn and on every respawn:

```ts
interface Particle { x; y; age; life; ci: number }
// at spawn / respawn:
p.ci = Math.floor(rng() * cfg.palette.colors.length)
```

Index (not a resolved color) is stored so that a config edit — which currently
re-runs `setup` — reflects immediately. If the set shrinks such that `ci` is now
out of range, clamp/reassign on read (`p.ci < colors.length ? p.ci : random`).

### Stroke color — retires the hue cache

The current path memoizes `hsl()` strings in a 360-entry cache
(`makeHueStyleCache`, `STROKE_SAT`, `STROKE_LIGHT`) to avoid per-frame string
allocation (#11). Palette Set replaces this with a far smaller precompute:
**one `rgba(r,g,b,a)` string per palette entry**, built once in `createFlowState`
(and rebuilt when config changes, which already re-runs setup). The hot loop does
`ctx.strokeStyle = state.styles[p.ci]` — no per-frame allocation, so #11's GC
concern is closed more directly than the hue cache did. `makeHueStyleCache` /
`STROKE_SAT` / `STROKE_LIGHT` are deleted.

A helper converts `#rrggbbaa` → `rgba(r, g, b, a)`:

```ts
function hexToRgba(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const a = parseInt(hex.slice(7, 9), 16) / 255
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
```

`background` stays a 6-digit hex; the trail-fade fill (`background + '22'`) is
unchanged.

## New framework control: `ui: 'colorList'`

The first **repeatable** control in `SchemaForm`. It renders a vertical list,
one row per color, plus an "Add color" button:

```
┌ Colors ───────────────────────────┐
│ [■]  #1e63ff           [ ✕ ]       │   ■ = native <input type=color>
│      α  [====o───────]  12%        │   hex text field (editable)
│ ──────────────────────────────────│   α = range 0–100% + readout
│ [■]  #16d6ff           [ ✕ ]       │
│      α  [===o────────]  10%        │
│ …                                  │
│ [ + Add color ]                    │
└────────────────────────────────────┘
```

- Reuses the existing `input[type=color]` swatch styling; adds `.crow`, `.clist`,
  `.addc`, `.arow` styles to `theme.css` (mockup carries the exact CSS).
- **Editing a swatch or hex** rewrites the `#rrggbb` part, preserving the `aa`
  byte. **Editing α** rewrites the `aa` byte, preserving the color. Hex text input
  validates `^#[0-9a-fA-F]{6}$` before committing (mirrors the existing color field).
- **Add** appends a sensible new entry (e.g. `#7df5cf1a`). **Remove** is disabled /
  hidden when only one color remains (min-1 invariant).
- Emits the whole `string[]` upward through the same `onChange(path, value)` seam
  `SchemaForm` already uses for scalar fields. `fieldMeta.ts` learns `colorList`
  as a known `ui` value; `asObject`/array detection in `SchemaForm` unwraps
  `z.array(z.string())`.

This control is intentionally Flow-Field-agnostic so the deferred Gradient mode
(#26) can adopt it later, but we are **not** generalizing color logic now (#24).

## UX invariants check

1. **Readability** — every color shown as a labeled row. ✅
2. **Hide nothing** — full set visible, each with exact hex + alpha %; no collapse. ✅
3. **Inline help** — persistent help line explains the spawn-pick + alpha-combine. ✅
4. **Sliders only when bounded** — α slider is `0–100`, bounded. ✅
5. **More contrast** — high-contrast dark theme; swatches sit on `--field`. ✅

## Testing (anti-regression)

- **Codec round-trip** — a `palette.colors` array of `#rrggbbaa` strings encodes
  to the URL and decodes back identically (extends the #3 array tests); a
  malformed entry falls back to defaults via `safeParse`, never throws.
- **`colorList` control** (@testing-library/react) — renders one row per color;
  "Add color" appends; remove drops a row and is unavailable at length 1; editing
  the α slider rewrites only the `aa` byte; editing hex rewrites only the color
  bytes.
- **Particle color assignment** — `createFlowState` assigns every particle a `ci`
  in `[0, colors.length)`; index-clamp picks a valid entry when the set shrinks;
  `styles.length === colors.length`.
- **`hexToRgba`** — `#1e63ff1f` → `rgba(30, 99, 255, 0.1215…)` (spot values).

## Build sequence

1. Schema: swap hue fields → `colors: string[]` (`#rrggbbaa`), defaults, bounds.
2. `colorList` control + `theme.css` styles + `fieldMeta`/`SchemaForm` wiring (+ tests).
3. `flowField.ts`: `ci` on particle, per-entry `rgba` precompute, delete hue cache,
   index-clamp (+ tests).
4. Codec test extension for the `#rrggbbaa` array.
5. Chrome verify: edit set live, confirm coherent ribbons + no white-out; flip
   blend modes; add/remove colors.

## Open / deferred

- Field Hue (#25), Gradient (#26), reusable engine (#24) — out of scope.
- A `diversion.update?` hook to avoid full `setup` re-run on edit is still
  backlogged (CLAUDE.md gotcha); Palette Set works fine under the re-run-setup
  model for now.
