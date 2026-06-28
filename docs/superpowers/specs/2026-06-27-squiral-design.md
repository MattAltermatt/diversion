# Squiral — design spec

**Issue:** #94 · **Label:** `xscreensaver`, `port:medium` · **Date:** 2026-06-27

A grid-walking "square spiral" automaton. Worms crawl a cell grid, each
preferring to keep turning the same way, winding themselves into tight
right-angled spirals until boxed in, then respawning — flooding the screen
with interlocking colored spirals that fill, then renew.

Clean-room reimplementation of the algorithm from xscreensaver's **`squiral`**
hack by **Jeff Epler (1999)**. The original mechanic is preserved faithfully;
the presentation is upgraded to gallery grade (soft palettes, graceful fades,
variable cell rendering) per the standing port ethos. Original © Jeff Epler;
xscreensaver © Jamie Zawinski.

## Identity

- `id: 'squiral'`, `title: 'Squiral'`, `kind: '2d'`
- Files (mirroring `substrate/`):
  - `index.ts` — `Diversion` object: `setup` / `frame` / `resize` / `update`
  - `schema.ts` — Zod schema (single source of truth: form + URL codec + `Config` type)
  - `squiral.ts` — state + step logic (`createState`, `step`, `update`, `resize`)
  - `schema.test.ts`, `squiral.test.ts` — co-located Vitest

## 1. Core mechanic (faithful)

The grid is `cols × rows`, where `cols = floor(cssWidth / cellSize)` and
`rows = floor(cssHeight / cellSize)`. A `Uint8Array fill[cols*rows]` marks each
cell occupied (1) or empty (0). The grid **wraps toroidally** (index via
modulo), faithful to the original.

Four headings, indexed 0–3 (up / right / down / left), with `(dh, dv)` deltas.

Each **worm** holds:
- `col, row` — current cell
- `type` — winding sense: `0` = CCW-preferring, `1` = CW-preferring
- `dir` — current heading 0–3
- `colorPos` — position along the palette/gradient (for `cycle`)
- `colorStep` — per-step color advance (0 when `cycle` off)

**Step rule** (`do_worm`, faithful):
1. With probability `disorder`, reassign `type` from `handedness`
   (`type = rand() < handedness ? 1 : 0`).
2. Compute candidate headings in preference order:
   - `type 0` (CCW): `[CCW, STR, CW]`
   - `type 1` (CW):  `[CW, STR, CCW]`
   where `CCW = (dir+3)%4`, `CW = (dir+1)%4`, `STR = dir`.
3. For the first candidate `d` whose **two cells ahead** along `d` are both
   empty (`cell+d` and `cell+2d`), mark both occupied, draw them, advance the
   worm by 2 cells along `d`, set `dir = d`. Stop.
4. If none of the three are clear, **respawn**: random `col, row`, random
   `type`, random `dir`, fresh `colorPos`. (Faithful `RANDOM`.)

Moving two cells at a time with a same-direction turn preference is exactly
what produces inward square spirals.

## 2. Lifecycle — `clearMode` enum

A running `coverage` counter increments on each cell filled. When
`coverage >= fillThreshold/100 * cols * rows`, a reset fires. Three modes:

- **`fade`** *(default)* — enter a fade phase: each frame paint a translucent
  `background` rect over the whole canvas (alpha derived from `fadeTime` and
  `dt`) for `fadeTime` seconds; then clear `fill`, reset `coverage`, and worms
  resume on the fresh grid. Calm, gallery-consistent (matches Substrate).
- **`wipe`** — faithful edge-in sweep: erase rows from the top and bottom edges
  toward the middle over a short span, clearing the corresponding `fill` rows,
  then resume.
- **`rolling`** — no hard reset. Each cell records the frame/time it was filled;
  cells older than a derived age fade back to `background` and clear their
  `fill` bit continuously, so coverage self-limits near the threshold and
  motion never stops. (Heavier: requires an age buffer + per-frame repaint of
  expiring cells.)

`fillThreshold` is a structural input (changes the cycle length) → re-setup.

## 3. Color engine

Reuses the gallery's palette↔gradient pattern (as in `substrate/schema.ts`):

- `color` group with `mode: 'palette' | 'gradient'`:
  - **palette** — `colors: string[]` (8-digit hex w/ alpha); each worm picks one
    on spawn.
  - **gradient** — `source: 'x' | 'y'`, `stops: string[]`; worm color sampled by
    its current cell position.
- `cycle` (boolean) — when true, a worm's `colorStep` is nonzero and `colorPos`
  advances each step, so the coil becomes a shifting ribbon of hue; when false,
  each coil is a single flat color.
- `background` (6-digit hex) — the ground color, painted on setup and faded back
  to on reset.

## 4. Cell rendering (variable)

Drawn incrementally on the DPR-scaled 2D context in CSS px — only the newly
filled cells are painted each frame (cheap, like the original). Controls:

- `cellSize` — 2–12 px (slider). Sets grid resolution → structural, re-setup.
- `gap` — 0–3 px (slider). 0 = solid mosaic; >0 leaves a background-colored
  gutter for a tessellated look.
- `cellStyle` — `square | ribbon`. `square` = crisp filled cell (sharp right
  angles, the classic look). `ribbon` = rounded-capped stroke along the worm's
  path for a softer, painterly coil.

`fade` and `rolling` modes additionally composite the whole-canvas / per-cell
fades described in §2.

## 5. Live-apply (`update`) vs re-`setup`

Following the `AnimationHost` contract (`update?(state, config, size)` returns
falsy to fall back to teardown+setup):

- **Live (mutate `state.cfg`, no realloc):** color group, `cycle`, `disorder`,
  `handedness`, `speed`, `gap`, `cellStyle`, `clearMode`, `background`.
- **Re-setup (return false):** `count`, `cellSize`, `fillThreshold`, `seed`.
- `resize(state, size)` — rebuild the grid arrays at the new dimensions and
  reseed worm positions in-range.

## 6. Motion speed

`speed` = worm-steps per second per worm (default ~120, matching the original's
~100 steps/s at delay 10 ms). `frame(state, ctx, t, dt)` accumulates
`dt * speed` into a step budget and runs that many steps across the worm set,
so motion is framerate-independent.

## 7. Determinism

A small seeded PRNG (mulberry32, same pattern as Substrate) seeded by `seed`
drives all randomness (spawn positions, type/dir, disorder rolls, color picks).
Same `seed` → identical sequence of spirals.

## 8. Presets (two independent groups)

Declared as `PresetGroup<SquiralConfig>[]` (framework renders one dropdown per
group; picking applies a `patch`):

- **Motion:** `Classic` (count med, disorder 0.005, handedness 0.5) ·
  `Orderly` (disorder 0, handedness 0 or 1 → pristine same-sense spirals) ·
  `Chaotic` (high disorder) · `Sparse` (low count, large cells).
- **Color:** `Ember` · `Mariners` · `Mono Blueprint` · `Pastel` ·
  `Neon` (ribbon + cycle on).

## 9. Schema (fields, sections)

```text
section    field          type / ui         range / default
---------  -------------  ----------------  ------------------------------
Worms      count          slider int        1–800 / 120
Worms      speed          slider            10–400 / 120  (steps/s)
Motion     disorder       slider            0–0.05 / 0.005
Motion     handedness     slider            0–1 / 0.5
Lifecycle  clearMode      segmented         fade | wipe | rolling / fade
Lifecycle  fillThreshold  slider int        20–95 / 75    (% cells)
Lifecycle  fadeTime       slider            1–6 / 2.5     (seconds)
Cells      cellSize       slider int        2–12 / 4      (px)
Cells      gap            slider int        0–3 / 0       (px)
Cells      cellStyle      segmented         square | ribbon / square
Color      color          group             palette / gradient (see §3)
Color      cycle          toggle            default false
Color      background     color             #11131a (deep slate, revisable)
Advanced   seed           number int        deterministic
```

All numeric ranges are tunable (🎚️) and may be refined during Chrome verify;
they are not load-bearing. `background` defaults to `#11131a` (deep slate) to
flatter the default palette; revisable as a cosmetic during verify.

## 10. Testing

Co-located Vitest:
- **Determinism:** same `seed` → identical worm step sequence (positions/colors).
- **Worm rule:** prefers its winding turn; only enters empty cells; moves 2;
  respawns when all three candidates blocked.
- **Coverage trigger:** reset fires at `fillThreshold` for each `clearMode`.
- **Schema:** defaults parse; `SquiralConfig` matches `z.infer`.
- Codec round-trip + control-from-schema are covered by the framework's generic
  test suites (the schema auto-registers).

## Out of scope (YAGNI)

- No interactivity (no pointer seam; #9 is separate).
- No per-worm trails beyond the grid fill.
- `wipe`/`rolling` ship with the enum but `fade` is the verified default;
  the other two get a Chrome eyeball but minimal tuning.
