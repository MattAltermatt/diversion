# Waymark — design spec

**Issue:** [#398](https://github.com/MattAltermatt/diversion/issues/398) · **Date:** 2026-09-15 (revised the same day after the spec panel — see **Panel round 1**) · **Slug:** `waymark` · **Kind:** `2d` · **Size:** S–M

A grid of flat coloured tiles fills the screen. One ant walks it, slowly. Every tile
holds a letter of a short program — `L`, `R`, `U`, `D` — and its colour *is* that
letter. When the ant lands on a tile it reads the letter, turns as told, and the tile
moves on to the next letter of the program; the ant sits there while the tile's colour
eases to its new letter, then hops to the next tile. Over minutes the ant's route
carves texture into a field of territories, and the texture is the piece.

**What this is, said plainly:** the machine is a turmite (Langton's ant generalised —
the same family as `turmite`, which ships as an xscreensaver port). What is new is
everything the eye sees, and it was found by probing, not argued: a *pre-seeded*
field of territories instead of a blank grid, one large, slow, legible walker instead
of a bitmap filling at 900 steps a second, colour that means the letter rather than
the visit count, transitions in place of pops, and a program chosen so that **every
dwell is a visible change**. The naysayer's case that this is "a render mode on
turmite" is recorded below and was put to the owner; the owner's direction is a piece
of its own, and `turmite` stays a faithful port.

The mockup is `docs/mockups/2026-09-15-waymark.html` (standalone; URL knobs in its
header) with captures beside it — **re-captured after the panel**, at the program and
field rules this spec states. It is the visual contract: where this document and the
mockup disagree, that is a defect in one of them, not a choice.

## Provenance

- **Turmites** — Langton (1986); the multi-state generalisation is Rucker's and Pegg's
  "turmites". `src/diversions/turmite/turmite.ts` is the in-repo reference for the
  *step* (`applyTurn`, `parseRule`). Its letter table is **not** ours: there `U` is a
  U-turn and `N` is straight; here `U` is straight and `D` is the U-turn (below). No
  claim is made that turmite rule strings read unchanged.
- **Rotor-router / Eulerian walkers** (Priezzhev et al. 1996; Holroyd, Levine,
  Mészáros, Peres, Propp, Wilson 2008) — what the *absolute*-direction reading of the
  letters turns out to be. Probed 2026-09-15 and rejected: on a uniform start every
  cell in a row says the same thing, so the walker runs full rows and full columns
  (scan-lines); random starts give staircases.
- **Random per-cell start** — rejected by capture: the emergent pattern is a
  *departure from order*, and a noise field has no order to depart from. (The panel
  sharpened this: with two classes, `random` is `regions` at a finer spatial
  frequency, and the two converge over hours. The distinction is coarseness, not
  kind; `random` is kept as an honest option, not a default.)
- **A lit trail** (last-N cells lightened) — rejected by the owner after seeing it:
  it changed the colours too much and hid the field. The piece has **no trail**.
- **`LRRRRRLLR` as the default program** — rejected by arithmetic after the panel:
  5 of its 9 letter transitions are same-letter (R→R, L→L), so the piece's one
  animated beat, the dwell tween, was a no-op more than half the time. The curated
  programs are now constrained so that no two consecutive letters (cyclically) are
  equal, and the default is `LRUD`.

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

`F` and `B` are accepted as aliases for `U` and `D` when parsing (a plain convenience;
nothing in the gallery emits them). **`U` is NOT a U-turn here** — the probe shipped
that reading for one round and the owner caught it; `D` is the U-turn.

### The step

Headings are `0 E, 1 S, 2 W, 3 N` (canvas y-down; `HEAD = [[1,0],[0,1],[-1,0],[0,-1]]`).
Each ant has a clock `prog ∈ [0,1)` advancing at `speed` cells per second. **The
framework's `dt` is in milliseconds** (`useAnimationLoop.ts`, clamped at 50 ms), so
the advance is `prog += (dt / 1000) × speed` — the mockup's loop hands seconds, and a
literal port runs 1000× too fast (CLAUDE.md carries this gotcha for a reason).

1. **Arrive** (`prog = 0`). Read `letter = program[tile.i]`, then **immediately
   commit** `tile.i = (tile.i + 1) mod n`. Compute `nh = turn(h, letter)` and the
   destination `(nx, ny)` one cell along `nh`, toroidally. Start the tile's display
   tween from its *current displayed colour* toward `colour(program[tile.i])` (the
   letter it now holds).
2. **Dwell** (`prog < DWELL`, `DWELL = 0.75`, a constant in `step.ts`). The ant sits
   on the tile. The tile's displayed colour eases (`easeInOut`) from old to new over
   the dwell; the ant's heading angle eases from `h·90°` to `nh·90°` over the same
   clock (shortest arc; a `D` resolves to a single +180° sweep). Both **finish before
   the hop begins**.
3. **Hop** (`DWELL ≤ prog < 1`). The ant glides from `(x, y)` to `(nx, ny)` along the
   grid, eased. At `prog = 1` the ant is on the next tile and arrives again.

**The commit is atomic at arrival and the tween is display only.** The panel traced
the earlier read-at-arrive / commit-at-depart version with two ants: the second read
a letter the first had already consumed, and a tile ended blue while its pointer
said R. With the commit at arrival, a second ant arriving mid-dwell reads the *new*
letter, advances the pointer again, and retargets the tween from wherever the colour
currently is — the state is always right; only the picture is catching up.

Multiple ants share one grid and interact only through the tiles. Each ant has its
own clock and heading; there is no collision logic. Ants are stepped in index order.

**Placement does not commit.** An ant placed at setup or by the `Ants` slider is *aimed*
along its heading (destination one cell ahead, no read) and reads
its first tile when it arrives after one hop. (Plan panel, 2026-09-15: a committing
placement advanced a tile per slider tick and per resize.)

`prog` starts at **0**, not 1 — the first probe started at 1 and took a spurious step.

**Verified in the mockup (2026-09-15):** a hand-traced `RL` returns the ant to its
origin after four `R`s with its original heading and turns left on the fifth step;
`LRRRRRLLR` ran 20,000 steps against an independent reference with zero divergence,
every visited tile's pointer equal to its visit count mod 9; and after the atomic
change, an in-page check at `prog = 0.02` found the pointer already advanced and the
chosen heading consistent with the letter just read.

### The starting field

A `field` enum decides what the tiles hold at `setup`. All are seeded (`seed`, canon).
The letters present in the program are its **classes**; a field assigns each tile a
class, and the tile's pointer is the **first** index in the program holding that
letter — so **colour is state**: two tiles that look alike start alike. (The first
mockup seeded raw indices instead; the captures were retaken under this rule.)

Every generator is a **pure function of `(col, row, seed)`** — this is what lets a
resize extend the field consistently (below).

- **`regions`** *(default)* — a Voronoi patchwork at the mockup's density: 14 seeds per
  1,440 tiles (14 at the default 48×30; capped so 96 columns on a laptop gets ~24, which
  is **half the density** — a sparser look by design; floored so at least four seeds are
  on screen at 24 columns, with every letter among them), each with a class; a tile takes
  its nearest seed's class, with distance wrapping in x. **Baked:** the seeds are drawn once over a virtual band `3 × max(rows, cols)` rows
  tall — any aspect to 3:1, so a landscape bake rotated to portrait still has seeds —
  and rows appended by a resize meet seeds that were always there. Large calm
  territories the ant streams across, then eats into.
- **`noise`** — fractal value noise, the way `ablation` builds its picture:
  `makeNoise3D(seed)` from `framework/rng.ts`, 3 octaves, feature size `cols / 4`,
  roughness 0.4, cut by **quantile** into as many bands as there are classes so
  every letter is present in equal mass. Bands and blobs rather than polygons. This
  is the "noise like ablation has" the owner asked for. It is **~30 lines in
  `waymark/field.ts`**, not a hoist of `ablation/field.ts`: that module carries
  Ablation's `alive` bookkeeping and a 4,096-bin histogram because Ablation quantises
  250k cells; at ≤ 5k cells a sort is free, and the hoist would have touched five
  import sites in two shipped pieces for a non-default option.
- **`uniform`** — every tile on index 0. The classic turmite start; the emergent
  structure is clearest here (`…-uniform-10min.png` is the star).
- **`random`** — a random class per tile. Kept because it is one line and someone
  will want it; its `help` says the pattern is hard to see on it.

### Renewal

A finite field that only ever gets carved is a piece that finishes and then pretends
not to (#361, closed wontfix the morning this was written). Turmite answers it with a
coverage reseed and a crossfade; Waymark does the same. The state keeps `touched`, the
set of tiles the ants have **visited** this generation (a bitmask and a count, set at
each arrival). When `touchedCount / (cols × rows) ≥ RENEW_AT` (`0.6`, constant), the
piece **crossfades over 4 s to a fresh field** — `generation + 1`, seeded from
`seed + generation`, same `field` kind — and the ants keep walking from where they
are. `renew` is a boolean field (default **on**) so the owner can watch a field to
the end if they want to. The owner confirmed renewal on (2026-09-15).

**Why "visited" and not "differs from the start" (plan panel round 2):** a program of
`n` letters returns a tile to its start pointer every `n` visits, so a "carved" measure
caps at `(n−1)/n` of the walked area — 50% for a two-letter program — and a 60%
threshold was unreachable for `RL` with the whole torus walked (measured: peak 55% over
two million steps). Visited is monotone and program-independent; every curated program
renews in 25–85 minutes at the default speed, and a test asserts it for each.

### Grid and sizing

`columns` is the tile count across, as a **segmented** choice `24 | 32 | 48 | 64 |
96` (default 48), not a slider: it is structural, there is no debounce between a
control and `update()`, and a slider would rebuild the field on every tick of a drag —
the other half of the Salvage #319 complaint the cell-size rule already answers. One
click, one rebuild. Rows follow from the canvas aspect (`round(height / cell)`); the
cell is `width / columns` in CSS px and is **derived, never a knob**. The gutter is
`clamp(1, cell × 0.06, 3)` px of `background`.

**A resize carries state.** The field generators are pure in `(col, row, seed)`, and
`columns` is fixed, so a height change simply evaluates the generator for the new
rows: existing rows keep their pointers, appended rows are generated fresh, removed
rows are dropped. A dwelling ant is untouched (its `y` clamped to the new row count,
its destination re-aimed on the torus); an ant mid-hop snaps to its destination tile
with `prog = 0` and arrives — the one commit a resize may make. Twenty minutes
of carving must not be lost to a fullscreen toggle or a phone's URL bar — the
`AnimationHost` calls `resize` for both.

The grid is a **torus** in both axes. The hop across a seam is drawn as a straight
glide off one edge and on at the other (no sweep across the screen).

### Colour

Four **role colours**, one per letter — `colorL`, `colorR`, `colorU`, `colorD` — as
discrete `ui:'color'` fields in a `ui:'group'` named `colors` (canon: distinct
semantic roles get discrete fields). Defaults: L `#3468c4`, R `#ce543a`, U `#2ca080`,
D `#964ec4`. `background` is the gutter and the ground, dark default `#07090e`. The
territories are separated by hue, not luminance (L and D are 1.07:1) — a deuteranope
reads those two as one territory; accepted for a generative piece, noted so nobody
"fixes" the approved look by spreading luminance.

**Tiles store a pointer, never a colour.** The renderer resolves `colour(letter)` from
the *live* config through a small cache rebuilt in `update()` — at most four
`fillStyle` strings for the whole field, so a live edit to `colorL` recolours every
placed tile on the next frame (turmite needed a `bgDirty` repaint flag for exactly
this; storing the pointer makes the problem not exist) and the per-frame cost is
`fillRect` only, no string building. Only the tiles under ants are ever mid-tween;
those resolve `lerp(from, to, ease(t))` per frame — a handful of tiles at most.

**The tween is in OKLab.** The RGB midpoint of the default blue and vermilion is
`#816e7f`, a grey-mauve, and every visible transition passed through it. OKLab keeps
the midpoint a colour. `rgb ⇄ OKLab` is ~20 lines in `step.ts` and the mockup ships it.

### The ant

Drawn on top of its tile as the three vertices of a triangle, as **edge marks**, not
a filled shape: a **dash centred on the leading edge** (the head) and an **L-bracket
on each of the two trailing corners** (the feet). Stroke `max(2.5, cell × 0.09)` px in
`antColor` (default `#fffaf0`, one field, applies live). Dash half-length `0.5·r`,
bracket arms `0.6·r`, where `r` is half the tile inset by half the stroke.

The marks **rotate about the tile centre** during the dwell, following the eased
heading angle, and **glide with the ant along the grid** during the hop (owner: "the
ant flows along the grid cells themselves" — MUST). The heading-angle function lives
in `step.ts` beside the colour tween (pure; testable without a canvas). The ant is
drawn *after* all tiles.

## Schema

```
program    z.enum(PROGRAMS)  default 'LRUD'        ui:'hidden'     label 'Program'
field      z.enum(['regions','noise','uniform','random'])  default 'regions'
                                                  ui:'segmented'  label 'Start field'  options = the enum, section 'Field'
columns    z.union of literals 24|32|48|64|96  default 48
                                                  ui:'segmented'  label 'Columns'      options = [24,32,48,64,96], section 'Field'
renew      boolean  default true                  ui:'toggle'     label 'Renew'        section 'Field'
ants       int 1..6  default 1                    ui:'slider'     label 'Ants'         section 'Ants'
speed      number 0.25..12 step 0.25  default 1.5 ui:'slider'     label 'Speed'        section 'Ants'   (cells per second)
antColor   color  default '#fffaf0'               ui:'color'      label 'Ant'          section 'Color'
colors     group { colorL 'Left', colorR 'Right', colorU 'Straight', colorD 'Back' }
                                                  ui:'group'      label 'Letters'      section 'Color'
background color  default '#07090e'               ui:'color'      label 'Background'   section 'Color'
seed       int, randomizeOnFreshLoad, collapsed   ui:'number'     label 'Seed'         section 'Advanced'
```

Every field carries `help`. `speed`'s help says what the owner said: *err on zen, not
frantic*. `renew`'s help says what it does and when.

**Live vs structural.** `program`, `field`, `columns`, `seed` → `update()` returns
`false` (full `setup`). `ants` is **reconciled in place**: growing appends ants at
seeded positions, shrinking drops the last — the field is untouched (CLAUDE.md's
population rule; a drag on `ants` must not restart the piece). `speed`, `renew`, all
colours → live.

`program` is a hidden enum over curated strings, as `turmite`'s `rule` is —
`SchemaForm` has no free-text control (`controlFor`: `slider | number | segmented |
select | toggle | color | colorList | image`). A free-text editor is **#399**.

**Curated programs** (the `Program` preset group; the invariant is that no two
cyclically-consecutive letters are equal, so every dwell is a colour change — a test
asserts it over the list, with `LUUR` declared as the one exemption because it is the
owner's string):

```
LRUD   Compass   — default; every letter once, every dwell a change; the uniform star
LURD   Wander    — long runs broken by turns; a different texture on regions
RL     Langton   — two colours, chaos then a highway on uniform
LRLU   Weave     — three letters, no D
LDRU   Switchback
LUUR   Meander   — the owner's original string; one U→U no-op in four, kept and named
```

`LLRR`/`RRLL` are gone (mirror images of each other, measured identical). These are
still **claims to be checked in Chrome on each field**; a program that does nothing
legible on `regions` at the default speed within two minutes is dropped before ship.

**Preset groups:** `Program` (above) and `Palette` — four options, each patching
`{ colors, background, antColor }` (one key-set per group, #311), opening on a named
option. **Every option's `antColor` is ≥ 3:1 against all four tiles** — computed in a
test, because two of the first blind picks hid the ant (1.21:1, 1.45:1). `field` and
`columns` are their own controls, not preset axes.

## Performance

A full redraw each frame: `columns × rows` `fillRect`s with one of ≤ 4 cached styles
(1,440 at defaults; ~5,000 at 96 columns on an ultrawide) plus a lerp and one small
path per ant. **The budget is measured, not asserted:** a headless bench over the real
`step.ts` + `render.ts` against the framework's mock context at 96 columns, run before
ship, with the number written into the plan; the target is < 1.5 ms per frame on an
M-series laptop and the fallback, if it misses, is an offscreen tile cache invalidated
per commit. No offscreen cache is planned otherwise.

Gallery tiles: `LazyPreview` mounts a host only once a tile settles within the
near-viewport margin (160 ms debounce), and `AnimationHost` pauses `frame()` the
moment its tile leaves the viewport — so the concurrent count is what's on screen,
not 141. A tile honours `columns`, so it shows ~48 tiny cells.

## Tests

Co-located, Vitest, explicit timeouts on anything that loops (CI is several times
slower than local). Each test below names the **mutation that must kill it**; a test
that stays green under its mutation is deleted, not kept.

- `program.test.ts` — parsing: alphabet, aliases `F→U`/`B→D`, rejection of anything
  else; `turn()` for all four letters × four headings (mutant: swap L/R). The curated
  list satisfies the no-consecutive-equal invariant (mutant: add `LLRR`).
- `step.test.ts` — the probe facts (`RL` four-step return; `LRUD` 20k-step reference
  agreement, pointer = visits mod n); a **golden vector** of the first 64 positions
  (mutant: transpose two lines in `arrive`); torus wrap on all four edges; `prog`
  starts at 0 (mutant: 1 → first position differs); **`dt` in ms** (a frame with
  `dt = 1000/60` at `speed 1.5` advances `prog` by `0.025`; mutant: drop `/1000`).
  **Two ants, concrete:** A arrives on tile T holding `R` at frame 0; B arrives on T
  at frame 1 while A dwells — B's heading must be `turn(hB, program[i+1])`, the
  letter *after* A's commit, and T's final pointer is `i+2` (mutant: commit at depart
  → B turns on `R` and the test fails).
- `field.test.ts` — each generator is deterministic per seed and pure in
  `(col,row,seed)` (extending rows leaves existing rows byte-identical — mutant: seed
  the rng per call); every class present; `noise` bands equal-mass within 2%;
  `uniform` all index 0; pointer = first index of the class's letter (mutant: raw
  index → a tile starts on index 5 of `LRRRRRLLR`).
- `tween.test.ts` — at `prog/DWELL = 0.25` the displayed colour is exactly
  `lerpLab(from, to, 0.125)` (mutant: linear → `0.25`; ease-in-only → `0.0625`); it
  equals `to` exactly at `prog = DWELL` and afterwards; the heading angle at the same
  point is `h0 + Δ × 0.125`; `N→W` sweeps −90°, not +270°; `D` sweeps +180°. OKLab
  round-trips the four defaults within 1/255 (mutant: drop the cube root).
- renewal (in `step.test.ts`) — `touchedCount` equals the number of tiles visited at
  least once and two arrivals on one tile touch it once (mutant: count visits); 300
  ticks from zero do not renew (mutant: threshold over the program length); **every
  curated program renews within 20,000 steps on regions 48×30** (mutant: a
  differs-from-start measure → `RL` never renews); crossing `RENEW_AT` starts a
  crossfade and the new field differs from the old (mutant: reseed with the same
  seed → identical); ants survive it.
- `waymark.test.ts` — `setup`/`frame`/`resize`/`update` against the framework's mock
  context: structural vs live routing (mutant: make `colorL` structural → the test
  sees a re-setup); a live `colorL` edit changes the next frame's `fillStyle` for an
  untouched tile (mutant: cache colours per tile at setup); a resize to more rows
  keeps every existing pointer and every ant (mutant: rebuild); the gallery smoke.
- The framework sweeps (`contract`, `codecSweep`, `seedContract`, `presetSweep`,
  `diversionMeta`, `accessibleName`) pick the piece up automatically.

## Files

```
src/diversions/waymark/
  meta.ts        identity (four strings)
  schema.ts      the schema above + PROGRAMS
  program.ts     parse, turn, aliases, the no-consecutive-equal invariant
  field.ts       the four generators, pure in (col,row,seed); noise via framework/rng makeNoise3D
  step.ts        Ant, Tile, arrive/hop/tick, DWELL, RENEW_AT, ease, antAngle, OKLab — pure, no canvas
  render.ts      tiles + ant marks + crossfade — takes a 2D ctx and the colour cache
  presets.ts     Program + Palette groups
  index.ts       defineDiversion, spreads ...meta
  *.test.ts      as above
docs/mockups/2026-09-15-waymark*.{html,png}
docs/gallery.md               one entry (the count guard enforces it)
README.md                     the "N diversions" headline (the same guard enforces it)
```

No framework changes.

## Panel round 1 (2026-09-15)

Two reviewers and a naysayer read the first draft against the codebase and the
mockup. What survived and changed the spec:

- **Default program** `LRRRRRLLR` → `LRUD`; curated list constrained to
  no-consecutive-equal letters. (Naysayer, measured: 56% no-op dwells.)
- **Atomic commit at arrival**; tween display-only. (Naysayer traced the stale read.)
- **`regions` seeds classes, not raw indices**; the mockup was wrong and the captures
  were retaken. (Both reviewers.)
- **Tiles store pointers; colours resolve from live config** — live palette edits
  reach every tile; no per-tile strings. (Reviewer 1.)
- **`dt` is milliseconds** — stated, with a test. (Reviewer 1.)
- **`columns` → segmented**; **`ants` reconciled live**. (All three, via #319.)
- **Resize carries state** via pure generators. (Naysayer; Salvage's `regrid` precedent.)
- **Renewal** added, default on, flagged for the owner. (Naysayer; #361.)
- **No hoist** of `ablation/field.ts`; ~30 lines locally. (Naysayer; reviewer 2 counted
  five import sites.)
- **OKLab tween.** (Naysayer: `#816e7f`.)
- **Tests rewritten with named mutations** — the first draft's tween test could not
  tell eased from linear. (Reviewer 1.)
- Dropped: the claim that turmite strings "still read"; `LLRR`/`RRLL` (mirrors); the
  stale `uniform` capture from the trail revision; `DWELL` "in `waymark.ts`" (no such
  file). Added: labels and `options` in the schema block; README count line; Palette
  patch shape.

Not adopted: **fold into `turmite`** — `turmite` is a faithful xscreensaver port and
the owner wants this as its own piece; the honest cost note stands (the step is the
same machine, the presentation is the work). **Don't build** — the owner's call, made.

## Open

- ~~The name~~ — **Waymark**, settled by the owner 2026-09-15: a waymark is the blaze on
  a trail that tells the walker which way; every tile here is a sign the ant reads,
  obeys, and rewrites for the next pass.
- ~~Renewal~~ — confirmed on by the owner; the measure is "visited", see §Renewal.
- **Palette hues and the `speed` default** are tuning; the mockup's values are the
  starting point, chosen by looking, not final.
- **The early phase.** At 1.5 cells/s the ant changes ~90 tiles a minute; on `regions`
  the eye has a composition from the first second and a visible dwell every step,
  but the *territory-scale* change takes ten-plus minutes. That is the owner's stated
  preference (zen over frantic). If the default reads as static in the Chrome verify,
  the honest fix is the default speed, not a trick.
- **Letter glyphs on tiles / a heading glyph** — **#400**, parked.
- **Free-text program editor** — **#399**.
