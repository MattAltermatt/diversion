# Salvage: a drone colony dismantles a picture and carries it home

**Date:** 2026-09-01 · **Status:** design approved in brainstorm, revised after the review panel, not built
**Working title:** *Salvage* (`salvage`). The player-facing name is the owner's call
and can change before ship without touching anything but `meta.ts` and the folder.

> **Revision 2 (same day).** The first draft was reviewed by a contract reviewer, a
> perf reviewer and a naysayer, and the owner then cut the rebuild half. What changed
> and why is in §*Revision notes* at the end; the body below is the design as it now
> stands.

## What it is

A pixel-art sprite sits on one side of the arena. A colony of small spider drones
starts blank, wanders, and takes the picture apart **from the outside in**, piece by
piece, carrying each piece across the field to a nest on the other side, where the
pieces heap up into a mound. When the picture is gone the mound fades, the next sprite
fades in, and the colony starts over.

The point of the piece is **anticipation**: watching the colony commit before it acts.
Three cues carry that, and the design exists to keep all three readable:

1. **Colour-coded trails, laid on the way in.** A tinted drone lays a trail in its
   colour both walking *to* its piece and carrying it home. So a trail reaches the
   picture ahead of the next lift: a thickening red trail means red parts are going.
2. **Gathering crews.** A piece too heavy for one drone sits there with drones latched
   on, pulsing, until enough arrive. A cluster forming around a slab means that slab
   is next.
3. **Colour waves.** Trails recruit blank drones, and once a colour is flowing its
   trail wins recruitment over a chance touch, so the colony sweeps the picture one
   colour at a time; when a colour runs dry its drones go blank and immune and
   re-recruit to the next. "Red is nearly gone, which colour takes over?" is the
   long-form question. A headless test asserts a dominant colour actually forms.

Brainstorm decisions, in the order they were made: the agents are the appeal, not the
object → pieces are **carried to a pile** (mass conserved) → agents are **crawlers**
(trails) rather than fliers, drawn as spider drones with the glyph as a knob → the
object is the **sprite roster and upload** shared with Ablation → the pick rule is
**edge-only**, which falls out of pieces being impassable and drones pathfinding around
them → layout is **picture on one side, nest on the other** → the rebuild half was cut
so the piece is all destruction.

How it differs from Ablation, which also takes a picture apart: Ablation's agents ride
a track and fire beams; the picture recedes but nothing moves. Here every removed piece
**travels**, the mound is a second thing to watch, and the colony's colour allegiance is
emergent.

## Scope

Ships: the `salvage` diversion (`kind: '2d'`), its schema, one preset group, co-located
tests, and a `docs/gallery.md` entry (the count guard hook goes 137 → 138).

Does not ship (each is a later slice on the same mechanism): rebuilding the picture
from the mound; nest placements other than *Opposite* (Corner has no room for the mound
at any sprite size, Random needs a clearance model); flying drones with a tag beam;
physics for the mound; interaction (`onPointer`). Three drone glyphs ship; more is
cosmetic backlog.

## Reuse

- **`framework/pictureStore.ts`** (bundled sprites, in-memory, versioned) and
  **`framework/imageStore.ts`** (the viewer's upload, `localStorage`, versioned), used as
  Ablation uses them, including the version-counter-in-state pattern for an async asset
  behind a sync `setup()`. The upload slot is shared with Ablation on purpose: one upload
  per browser, both pieces peel it, and both help strings say so. `image` is
  `local: true`; `picture` travels in the link; `seed` is pin-only.
- **`ablation/pictures.ts`** (the 26-sprite roster and seeded rotation) and
  **`ablation/quantize.ts`** (alpha-aware OKLab k-means with the per-background contrast
  floor) are imported **directly from the Ablation folder**. Hoisting them to the
  framework changes nothing about what gets bundled — a module shared by two lazy
  chunks lands in the precache either way (`chunkFileNames` keys on the facade, and a
  shared chunk has none), a few kB gzipped on the shell — so the move is deferred until
  a third consumer exists. The cross-folder import carries a comment saying exactly that.
- `quantize(..., fit = true, background, matte = false)`: the transparent surround
  stays **void**, and void is free space the drones walk through. (Ablation mattes;
  Salvage must not.)

## The arena

A cell grid at `cellSize` CSS px covering the canvas. Every cell is one of **free**,
**picture**, **mound**, **reserved** (a drop site claimed by a crew in flight). Only free
cells are walkable. Drones are points in continuous cell units; they do not block one
another.

**Layout.** The picture's bounding box is centred on the vertical midline at 27% of
the width; the nest seed cell sits at 73%. The picture is scaled to fit
`40% of the width × 70% of the height` in whole cells, aspect preserved. A **forbidden
mask** covers the picture's box plus a 2-cell margin and the arena's outer 2-cell
border: no drop site may touch it, so the mound can never grow into the picture's
footprint, and a free corridor always rings the arena. On `resize` the arena is rebuilt
from scratch (same seed, same picture): a rescale would leave drones standing inside
walls, and a resize is rare.

**Reachability.** A flood from the arena's border over free cells marks every
**reachable** cell; it is recomputed after every lift, drop and build (rare events, one
grid pass each). A piece is **exposed** when one of its cells is 4-adjacent to a
reachable free cell. That single rule is the whole edge-only behaviour, and it also
means a hole inside an uploaded picture (a ring, a letter O) is neither a place drones
spawn nor a surface they can peel from — the free cells in it are not reachable.

## Pieces

The picture is quantized at **block** resolution, not cell resolution: for a bundled
sprite a block is one source pixel; for an upload a block is a `k × k` cell square with
`k` chosen so the picture is at most 48 blocks wide. Each block becomes `k × k` grid
cells. Pieces are cut in block space: 4-connected regions of one palette index, BFS-grown
from the block with the fewest unassigned same-colour neighbours until they reach
`chunkSize` blocks. Seams therefore follow the artist's pixel grid, a piece is never a
one-cell sliver, and masses still vary — a 1-block chip goes solo, a 12-block slab needs
a crew. A piece's **mass** is its block count; `strength` is in blocks.

Piece boundaries are drawn as a 1px line at 60% of the ground colour over the piece
colour, so the pieces are visible *before* they move. Visible pieces are half the
anticipation.

## Drones

The colony has `min(drones, max(10, reachableCells / 6))` drones, so a gallery tile with
a few hundred free cells is not drone soup. Each has a position, heading, a **tint**
(palette index or blank), a per-colour **immunity expiry**, a piece to **avoid** (the one
it just gave up on), and a state:

```text
Blank      wandering; recruitable
Seeking    tinted; either waiting for a target (in the pick queue) or walking a path to one
Latched    at the piece, waiting for enough carriers
Carrying   part of a crew moving a piece along a path to its drop site
```

**Wander (Blank).** Constant speed, heading drifts by seeded jitter, reflects off
walls and impassable cells. Two things recruit a blank drone, checked each step:

1. **Trail first:** the trail at its cell is above `TRAIL_RECRUIT` and it is not immune
   to that colour → adopt it. Trail beats touch so a flowing colour keeps recruiting —
   that is what makes the waves.
2. **Touch:** otherwise, an exposed piece it is not immune to is 4-adjacent → adopt that
   piece's colour.

Adopting puts the drone in the **pick queue**.

**Pick a target.** At most `PICK_BUDGET` picks run per frame (the queue drains over a
few frames, so a phase flip or a colour drying up costs a bounded amount per frame).
A pick first lists candidates — exposed pieces of the drone's colour, not the avoided
one, not one already moving — and only if there are any runs one BFS from the drone's
cell over free cells. Score = path distance − `CREW_PULL` × (the piece has a waiting crew
that still needs carriers). Lowest wins; path distance, never straight-line. **No
candidates at all means the colour is exhausted:** the drone goes blank with immunity.

**Walk and lay trail.** A seeking drone deposits its tint at its cell each step while
walking, so the trail arrives at the picture ahead of the lift.

**Latch and lift.** Carriers needed = `min(ceil(mass / strength), max(1, floor(colony / 2)))`
— clamped to the population so any piece is always liftable. Arriving at a target that is
no longer eligible (taken, or no longer exposed) counts as stolen; three in a row → blank
with immunity. When the crew is full it lifts: the piece's cells go free (exposing
neighbours), a drop site is found and **reserved**, and the crew paths as one from where
it stands to a free cell adjacent to the site. If the crew has not filled within
`WAIT_TIMEOUT` seconds the waiters release, mark the piece as **avoided**, and re-queue;
a drone with nothing else to pick goes blank with immunity. If no drop site exists the
piece is put back and marked to retry in a few seconds.

**Carry.** The crew walks its path at drone speed × `min(1, strength / mass)` floored
at 0.4, so a heavy slab lumbers. The piece is drawn lifted at the crew's anchor with a
slow bob; carriers are spread around its outline; each carrier deposits the cargo's
colour at its cell. On arrival the crew lowers the piece onto the reserved site over
`SETTLE` seconds and the cells become mound.

**Drop site.** The free placement nearest the nest seed (Chebyshev rings, walked edge by
edge) where every cell is free, none is forbidden, and the piece touches the heap (or
covers/touches the seed while there is no heap). Reserved cells count as heap so several
crews in flight extend one mound.

**Going blank.** Colour exhausted at pick time, three stolen targets, or `SEEK_TIMEOUT`
seconds seeking without latching. Each grants immunity to the colour just dropped for
`immunity` seconds; immunity is per colour. **Every phase flip clears all immunities
and blanks every drone**, so a new picture starts from a clean colony.

## Trails

One **colour grid** (`Int16Array`, −1 = none) plus one **strength grid**
(`Float32Array`), not a field per colour. A deposit of colour *k* reinforces a matching
cell, or contests a foreign one (subtracts; on crossing zero the cell flips to *k*).
Decay is exponential so `trailFade` is a half-life in seconds. Trails are recruitment
and display only — there is no gradient following — and reading the recruiting colour
at a cell is one array read. Cleared when the picture changes (the palette indices no
longer mean the same colours).

Drawn additively through one `ImageData` at grid resolution, scaled up with smoothing
off, under the pieces and drones. Trails are the brightest thing on the field after the
picture; they are the prediction.

## The loop

```text
dismantle  → all pieces on the mound and no crew in flight
rest       → REST seconds; nothing is eligible; drones wander
fadeOut    → mound alpha 1 → 0 over FADE; then the mound is cleared and all trails wiped
swap       → the next picture is built (generation + 1 in the rotation; an upload
             repeats itself). If its store is still cold, stay here with drones wandering
             a blank arena until it lands.
fadeIn     → picture alpha 0 → 1 over FADE, then dismantle
```

Phases are explicit states; nothing keys control flow on a render alpha. At `swap` every
drone goes blank with immunities cleared, keeps its position, and any drone now standing
inside the new picture's cells is nudged to the nearest reachable free cell.

## Rendering (2d)

Draw order: ground → trails → mound layer → picture layer → lifted pieces → drones.
The picture and mound are two **offscreen layers** at canvas resolution, drawn once and
patched only when a piece is lifted or dropped (the sim records dirty piece ids); each
frame is one `drawImage` per layer at its alpha. Offscreen canvases are created lazily by
the renderer and never touched by the sim, so every sim test is DOM-free; where no 2D
offscreen context exists (jsdom) the renderer draws the pieces directly.

Drones: **glyph** (`Spider` default, `Ant`, `Dot`), ~1.5 cells across; body in the
adopted palette colour, blank drones a dim neutral grey; a latched drone pulses; each
glyph is one `beginPath` … one `stroke` per drone. Carried pieces bob a quarter cell.
`globalAlpha` is set explicitly on every draw path.

## Schema

- **Picture:** `source` (`Pictures | Yours`), `picture` (select, shows for Pictures),
  `image` (`ui:'image'`, `local`, shows for Yours), `colors` (2..12, default 6),
  `cellSize` (4..24, default 10).
- **Colony:** `drones` (10..400, default 120), `strength` (blocks one drone carries,
  1..24, default 4), `chunkSize` (max blocks per piece, 1..48, default 12), `immunity`
  (0..120 s, default 20), `tempo` (0.1..4, default 1), `glyph`.
- **Trails:** `trailFade` (half-life, 2..120 s, default 25), `trailGlow` (0..1, 0.6).
- **Color:** `background` (default `#07080c`), applied live as a palette re-stretch.
- **Advanced:** `seed` (pin-only, collapsed).

Every field carries `help`. There is no `Palette` colorList and no `Palette` preset
group: the palette is the picture's. **Presets** (`Crew`): `Calm` (the defaults),
`Swarm` (`drones` 320, `strength` 8, `immunity` 5, `trailFade` 10), `Heavy lifting`
(`drones` 80, `strength` 2, `chunkSize` 24, `trailFade` 40). Calm must match the
defaults (#311).

`update()` applies live: `tempo`, `immunity`, `trailFade`, `trailGlow`, `glyph`,
`strength`, `drones` (reconciled in place: blank drones trimmed first, carriers finish
their crew), `background`. `colors`, `cellSize`, `chunkSize`, `source`, `picture`,
`image`, `seed` rebuild.

## Tests

Pure modules with co-located tests: `chunks` (block partition: every block once, cap
respected, connected, deterministic; expansion to cells), `grid` (reach flood: a hole is
unreachable), `nav` (BFS around an obstacle, path reconstruction, approach cell), `trails`
(half-life, contest/flip, recruit read), `mound` (first drop on the seed, later drops
touch the heap, forbidden mask respected, null when full), `recruit`/`crew` (trail beats
touch, immunity, pick-queue budget, crew size and clamp, timeout releases and avoids,
stolen → blank, retiring drones leave). A headless **full-cycle test** at a realistic
picture-to-arena ratio runs to `generation === 1` and asserts termination, an empty
mound at swap, and seed determinism. A **wave test** at defaults samples the tinted
drones over the middle of a dismantle and asserts the modal colour holds at least 40%.

Performance ceiling is measured in Chrome at 400 drones, `cellSize` 4, 1440×900.

## Open calls the owner may want to move after seeing it run

- Blank-drone grey and seam darkness.
- `strength` 4 / `chunkSize` 12: how often a crew forms.
- `immunity` 20 s: how strongly the colony sweeps by colour.
- The 27% / 73% split. The name.

## Revision notes

**Revision 3 (same day, after the code review and the first watch).** Three changes
the owner asked for on seeing it run: **drones walk over the mound** (a dropped piece is
a floor, not a wall — only the picture and a site a crew is about to lower a piece onto
block the way; the reachability flood, pathing and wander all use that predicate), the
**default colony is smaller and slower** (60 drones, strength 3, 3 cells/s, an 8 s rest
and 3 s fades), and **idle drones drift toward the picture** — a gentle heading pull that
switches off within a few cells of its box, on top of the random walk, so they browse its
edge instead of milling around the mound. And from the review: a store version bump
caused by *another* sprite landing (the prefetch of the next one, Ablation's tile on the
same page) no longer rebuilds the arena, because the arena key carries the image id; a
cold store is retried on a version bump or a 5 s timer, never per frame; a tiny upload
at a large cell size falls back to the downsample branch instead of overflowing the
grid; "nothing pickable right now" is separated from "colour exhausted", and only
exhaustion earns immunity; the render layers are keyed on geometry only (a palette
change repaints, never reallocates). The per-drone BFS was the frame-budget cliff at
the ceiling (twelve full-grid floods in one frame, 50–85 ms): targeting now uses **one
multi-source distance field per tint**, shared by every drone of that colour and rebuilt
lazily after a lift or drop, with a **deterministic work budget** — at most one field
flood and one lift per frame — so a seed replays identically on any machine and the
worst frame at 400 drones / cell size 4 measured 8–15 ms. The drop-site search rejects
anchors outside the heap's bounding box before walking cells, checks fit before contact,
and starts near the last site's ring when the piece is no smaller than the one that set
it.


Findings that survived the panel and what they changed: the mound could grow into the
picture's footprint (→ forbidden mask, realistic-ratio test); the rebuild's reverse-order
guarantee was not what the code enforced and enclosed slots would have teleported (→ the
owner cut the rebuild); immunity fired at the phase flip and locked out the biggest cohort
(→ flips clear immunity); a released crew re-latched the same piece forever and crew
size was unclamped (→ avoid + clamp); an upload with a hole trapped drones and breached
edge-only from inside (→ reachability); trails only ever trailed behind a removal and
nothing made a colour wave form early (→ deposit on the way in, trail beats touch, wave
test); per-frame redraw of every cell and seam, 12 trail fields scanned per frame, BFS
cascades on exhaustion, a per-frame fetch on a cold sprite, ring search O(r³) on failure
(→ layers, single-field ImageData trails, candidates-before-BFS + pick budget, version
gate, edge-walked rings + retry); absolute drone count on a tile (→ density clamp);
pieces straddling pixel boundaries (→ block-space partition); `background` structural
where Ablation applies it live (→ live); the hoist settled nothing (→ deferred).
