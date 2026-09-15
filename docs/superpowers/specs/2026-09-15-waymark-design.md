# Waymark — design spec

**Issue:** *(filed with this spec)* · **Date:** 2026-09-15 · **Slug:** `waymark` (working title — owner's pick, see Open) · **Kind:** `2d` · **Size:** S–M

A grid of flat coloured tiles fills the screen. One ant walks it, slowly. Every tile
holds a letter of a short program — `L`, `R`, `U`, `D` — and its colour *is* that
letter. When the ant lands on a tile it reads the letter, turns as told, and the tile
moves on to the next letter of the program; the ant sits there while the tile's colour
eases to its new letter, then hops to the next tile. Over minutes the ant's route
carves texture into the field, and the texture is the piece.

**What this is, said plainly:** the machine is a turmite (Langton's ant generalised —
the same family as `turmite`, which ships as an xscreensaver port). What is new is
everything the eye sees, and it was found by probing, not argued: a *pre-seeded*
field of territories instead of a blank grid, one large, slow, legible walker instead
of a bitmap filling at 900 steps a second, colour that means the letter rather than
the visit count, and transitions in place of pops. Three things the probes ruled out
are recorded in **Provenance** so nobody re-proposes them.

The mockup is `docs/mockups/2026-09-15-waymark.html` (standalone; URL knobs in its
header) with captures beside it. It is the visual contract for this spec.

## Provenance

- **Turmites** — Langton (1986); the multi-state generalisation is Rucker/Pegg's
  "turmites". `src/diversions/turmite/turmite.ts` is the in-repo reference for the
  step and the rule alphabet (`applyTurn`, `parseRule`).
- **Rotor-router / Eulerian walkers** (Priezzhev et al. 1996; Holroyd, Levine,
  Mészáros, Peres, Propp, Wilson 2008) — what the *absolute*-direction reading of the
  letters turns out to be. Probed 2026-09-15 and rejected: on a uniform start every
  cell in a row says the same thing, so the walker runs full rows and full columns
  (scan-lines); random starts give staircases. Capture: `.probe/rotor-LURD-3ants.png`
  in the session, not committed — the finding is what matters, not the picture.
- **Random per-cell start** — rejected by capture: the emergent pattern is a
  *departure from order*, and a noise field has no order to depart from; after
  10,800 steps the field was indistinguishable from its first frame.
- **A lit trail** (last-N cells lightened) — rejected by the owner after seeing it:
  it changed the colours too much and hid the field. The piece has **no trail**.

Clean-room: nothing is taken from any implementation.

## The mechanism

### The program and the letters

A **program** is a string over `{L, R, U, D}`, length 2..12. Each tile carries a
**pointer** `i` into the program. The letters are the **ant's own compass**:

```
L  turn left   (heading + 3) mod 4
R  turn right  (heading + 1) mod 4
U  keep going  — the ant's "up" is straight ahead
D  turn back   (heading + 2) mod 4
```

`F` and `B` are accepted as aliases for `U` and `D` when parsing, so `turmite`-style
strings still read. **`U` is NOT a U-turn here** — the probe shipped that reading for
one round and the owner caught it; `D` is the U-turn.

### The step

Headings are `0 E, 1 S, 2 W, 3 N` (canvas y-down; `HEAD = [[1,0],[0,1],[-1,0],[0,-1]]`).
A step has two phases on a clock `prog ∈ [0,1)` that advances at `speed` cells/s:

1. **Arrive** (`prog = 0`). Read `letter = program[tile.i]`, compute `nh = turn(h, letter)`
   and the destination `(nx, ny)` one cell along `nh`, toroidally. Start the tile's
   colour tween from its current colour toward `colour(program[(tile.i + 1) mod n])`.
2. **Dwell** (`prog < DWELL`, `DWELL = 0.75`). The ant sits on the tile. The tile's
   colour eases (`easeInOut`) from old to new over the dwell; the ant's heading angle
   eases from `h·90°` to `nh·90°` over the same clock (shortest arc; a `D` resolves
   to a single +180° sweep). Both **finish before the hop begins**.
3. **Hop** (`DWELL ≤ prog < 1`). The ant glides from `(x, y)` to `(nx, ny)` along the
   grid, eased. At `prog = 1`: commit `tile.i = (tile.i + 1) mod n`, set the tile's
   colour to its target exactly, move the ant, and arrive again.

Multiple ants share one grid and interact only through the tiles (an ant that
advanced a pointer sends the next arrival a different way). Each ant has its own
clock and heading; there is no collision logic. Ants are stepped in index order, so
two ants arriving on one tile in the same frame commit in a fixed order — determinism
holds.

`prog` starts at **0**, not 1 — the probe started at 1 and took one spurious step on
load.

**Verified in the probe (2026-09-15):** a hand-traced `RL` returns the ant to its
origin after four `R`s with its original heading and turns left on the fifth step;
`LRRRRRLLR` ran 20,000 steps against an independent reference with zero divergence in
position or heading, and every visited tile's pointer equalled its visit count mod 9.
The shipped step gets the same two tests, plus a **golden vector** (first 64
positions of a fixed program/seed) so a transposed line fails rather than reshuffles.

### The starting field

A `field` enum decides what the tiles hold at `setup`. All are seeded (`seed`, canon).
The letters present in the program are its **classes**; the field assigns each tile a
class, and the tile's pointer is the **first** index in the program holding that
letter (so `LRRRRRLLR` has two classes and every tile starts on index 0 or 1).

- **`regions`** *(default)* — a Voronoi patchwork: `k` seed points (`k = 14`,
  scaled by area so a phone gets fewer) each with a class; a tile takes its nearest
  seed's class. Large calm territories the ant streams across, then eats into.
- **`noise`** — fractal value noise, the way `ablation` builds its picture:
  `makeNoise3D(seed)` (`framework/rng.ts`), 3 octaves, cut by **quantile** into as
  many bands as there are classes so every letter is present in equal mass. Bands
  and blobs rather than polygons. This is the "noise like ablation has" the owner
  asked for; `ablation/field.ts`'s `buildField` does exactly this and is already
  imported by `salvage`, so this is its **third consumer** — per `CLAUDE.md` it is
  hoisted to `framework/field.ts` as part of this work, with `ablation` and
  `salvage` re-pointed (no behaviour change; the shared chunk already exists).
- **`uniform`** — every tile on index 0. The classic turmite start; the emergent
  structure is clearest here, at the cost of a blank opening.
- **`random`** — a random class per tile. Kept because it is one line and someone
  will want it; the description carries the honest note that the pattern cannot be
  seen on it (**Provenance**).

`field`, `program`, `columns`, `ants` and `seed` are **structural**: `update()`
returns `false` on any change so the host re-runs `setup`. Colours and `speed` apply
live.

### Grid and sizing

`columns` (integer, 12..96, default 48) is the tile count across; rows follow from the
canvas aspect (`round(height / cell)`); the cell is `width / columns` in CSS px. The
cell is **derived from the viewport, never a knob** (Salvage #319: a cell-size knob
restarted the piece per input event and its visible effect was a rounding accident).
A resize rebuilds the grid — structural, same as `turmite`'s `resize`. The gutter is
`clamp(1, cell × 0.06, 3)` px of `background`.

The grid is a **torus** in both axes. The hop across a seam is drawn as a straight
glide off one edge and on at the other (no wrap-around sweep across the screen — the
probe skips the segment).

### Colour

Four **role colours**, one per letter — `colorL`, `colorR`, `colorU`, `colorD` —
as discrete `ui:'color'` fields in a `ui:'group'` (canon: distinct semantic roles get
discrete fields, not a `colorList`). Defaults are the mockup's: L `#3468c4` blue,
R `#ce543a` vermilion, U `#2ca080` green, D `#964ec4` violet. `background` is the
gutter and the ground, dark default `#07090e`.

A tile is drawn flat: `fillRect` in its current colour. **Only the tiles under ants
are ever mid-tween**; every other tile is exactly its letter colour. Transitions are
in RGB with `easeInOut` — with these hues the midpoints are muted but never muddy
(checked in the mockup; if a palette makes them muddy, tween in OKLab — a one-function
change, so not decided now).

### The ant

Drawn on top of its tile as the three vertices of a triangle, as **edge marks**, not
a filled shape: a **dash centred on the leading edge** (the head) and an **L-bracket
on each of the two trailing corners** (the feet). Stroke `max(2.5, cell × 0.09)` px in
`antColor` (default `#fffaf0`, one field, applies live). Dash half-length `0.5·r`,
bracket arms `0.6·r`, where `r` is half the tile inset by half the stroke.

The marks **rotate about the tile centre** during the dwell, following the eased
heading angle, and **glide with the ant along the grid** during the hop (owner: "the
ant flows along the grid cells themselves" — MUST). The ant is drawn *after* all
tiles; during a hop the tiles it crosses are ordinary tiles underneath it.

## Schema

```
program   z.enum(PROGRAMS)                default 'LRRRRRLLR'   ui:'hidden'  (driven by the Program preset group)
field     z.enum(['regions','noise','uniform','random'])  default 'regions'  ui:'segmented'  section 'Field'
columns   int 12..96                     default 48     ui:'slider'   section 'Field'
ants      int 1..6                       default 1      ui:'slider'   section 'Ants'
speed     number 0.25..12 step 0.25      default 1.5    ui:'slider'   section 'Ants'   (cells per second)
antColor  color                          default '#fffaf0'          section 'Color'
colors    group { colorL, colorR, colorU, colorD }                  section 'Color'
background color                         default '#07090e'          section 'Color'
seed      int, randomizeOnFreshLoad, collapsed, section 'Advanced'
```

Every field carries `help`. `speed`'s help says what the owner said: *err on zen, not
frantic*. There is no `dwell` knob; `DWELL = 0.75` is a constant in `waymark.ts`.

`program` is a hidden enum over curated strings, exactly as `turmite`'s `rule` is —
`SchemaForm` has no free-text control (its `controlFor` switch is `slider | number |
segmented | select | toggle | color | colorList | image`), and adding one is framework
work outside this piece. A free-text program editor is filed as a follow-up.

**Curated programs** (the `Program` preset group; names are working):

```
LUUR         Meander      — the owner's original string; drifts, then turns
RL           Langton      — chaos, then a highway (on `uniform`)
LRRRRRLLR    Fractal      — turmite's default; textured territories
LRUD         Compass      — every letter once
LLRR         Spiral       — filled square spirals
RRLL         Bloom        — symmetric growth
LURD         Wander       — long straight runs broken by turns
```

These are **claims to be checked in Chrome on each field**, not facts; a program that
does nothing legible on `regions` at the default speed within two minutes is dropped
before ship, and the list may end shorter.

**Preset groups:** `Program` (above), `Palette` (three or four four-colour sets +
background; the mockup's as the default, opening on a named option — #311). `field`
is its own control, not a preset axis.

## Performance

A full redraw each frame: `columns × rows` `fillRect`s (1,440 at defaults; ~5,000 at
96 columns on an ultrawide) plus one small path per ant. Measured budget target
< 1.5 ms per frame at 96 columns on an M-series laptop; the piece is nowhere near a
GPU question. No offscreen cache: the win would be small and it complicates the tween.

Gallery tile: the same code at whatever size the tile is; `columns` is honoured, so a
tile shows ~48 tiny cells — legible enough, and cheap.

## Tests

Co-located, Vitest, with explicit timeouts on anything that loops (CI is several
times slower than local). Every threshold below gets a **mutation check** before it is
trusted — a test that stays green when the thing it guards is broken is deleted, not
kept.

- `program.test.ts` — parsing: alphabet, aliases `F→U`/`B→D`, rejection of anything
  else; `turn()` for all four letters × four headings.
- `step.test.ts` — the two probe facts (`RL` four-step return; `LRRRRRLLR` 20k-step
  reference agreement, pointer = visits mod n); the golden vector; torus wrap on all
  four edges; two ants on one tile commit in index order; `prog` starts at 0 (mutant:
  start at 1 → first position differs).
- `field.test.ts` — each generator is deterministic per seed; every class present;
  `noise` bands are equal-mass within tolerance; `uniform` is all index 0; pointer =
  first index of the class's letter.
- `tween.test.ts` — the tile under the ant reaches its target colour **exactly** at
  `prog = DWELL` and does not change after; the heading angle is monotone over the
  dwell and takes the short arc (`N→W` is −90°, not +270°); `D` sweeps +180°.
- `waymark.test.ts` — `setup`/`frame`/`resize`/`update` against the framework's mock
  context: structural vs live fields route correctly; a resize keeps the seed; the
  gallery smoke.
- The framework sweeps (`contract`, `codecSweep`, `seedContract`, `presetSweep`,
  `diversionMeta`, `accessibleName`) pick the piece up automatically.

## Files

```
src/diversions/waymark/
  meta.ts        identity (four strings)
  schema.ts      the schema above + PROGRAMS
  program.ts     parse, turn, aliases
  field.ts       the four generators (noise via framework/field.ts)
  step.ts        Ant, Tile, arrive/depart/tick — pure, no canvas
  render.ts      tiles + ant marks — takes a 2D ctx
  presets.ts     Program + Palette groups
  index.ts       defineDiversion, spreads ...meta
  *.test.ts      as above
src/framework/field.ts        hoisted from ablation/field.ts (third consumer)
docs/mockups/2026-09-15-waymark*.{html,png}
docs/gallery.md               one entry (the count guard enforces it)
```

## Open

- **The name.** `Waymark` is a working title (a waymark is the sign on a trail that
  tells the walker which way). Player-facing → owner's pick before ship; the slug
  follows the name.
- **Palette hues and `speed` default** are tuning; the mockup's values are the
  starting point, chosen by looking, not final.
- **The star vs. the pace.** At 1.5 cells/s the structure that reads at once at 12
  cells/s takes ~20 minutes to appear. That is the owner's stated preference (zen
  over frantic) and the piece is built to it; the `Program` list is pruned against
  it (above). If it turns out no program is legible at the default within a few
  minutes, the honest fix is the default speed, not a trick.
- **Letter glyphs on tiles / a heading glyph** — discussed, parked; filed as a
  follow-up, not in scope.
- **Free-text program editor** — needs a `ui:'text'` control in `SchemaForm`; filed
  as a follow-up.
- **Saturation.** Over a long run the field becomes fine texture everywhere and the
  territories are gone. That is the piece running its course, not a defect; a
  reseed-on-saturation is *not* planned. Revisit only if a long run reads as noise
  rather than texture.
