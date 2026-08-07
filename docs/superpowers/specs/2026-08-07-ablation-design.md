# Ablation — design spec

**Date:** 2026-08-07
**Slug:** `ablation`
**Kind:** `2d`
**Status:** approved, not yet implemented

A quantized contour-map picture sits in the middle of a black screen. A rectangular
track floats just outside it, carrying lasers that each hunt one colour. A laser
strikes the outermost surviving cell of whatever column it is passing, dims as it
discharges, and ejects dark. The picture is peeled from the outside in until nothing
is left; the track goes quiet; a new picture resolves in and the track floods again.

---

## 1. The load-bearing idea

A laser may only ever hit the **outermost surviving cell** along its beam. That single
restriction is the whole piece:

- Lasers cooperate without being told to. A laser tuned to the outer band must peel
  that band before the band underneath is exposed to anything tuned to it. The picture
  comes apart in **layers**, not in random holes.
- Combined with "one shot per column, then move on" (§4), a laser physically cannot
  drill. The erosion front is therefore a *receding surface* and spreads sideways,
  because sideways is the only direction available to it.

The rejected alternative — beam passes through and takes the first *matching* cell,
ignoring non-matches — drills tunnels and produces swiss cheese. Do not implement it.

---

## 2. The picture

A smooth noise field quantized into exactly as many bands as the palette has colours.

- **Nested by construction.** Around every local extremum of the field the bands sit
  inside one another — cross any contour and the index moves by exactly one step. There
  is no seed that produces a badly-layered picture, which is why this is the only
  generator shipping. (The *global* picture is several such nested stacks side by side,
  and whichever bands happen to reach the border are exposed at t=0. That is the
  interesting case, not a defect: the outer bands peel away and reveal the stacks
  beneath, at different rates in different regions.) Hand-authored geometry, landscape
  strata and radial ornament were all considered and deferred (§11).
- **Quantize by quantile, not by equal width.** Splitting the field's value range into
  equal slices leaves the extreme bands nearly empty on most seeds — the palette's first
  and last colours would barely appear. Ranking cells and cutting at equal *counts*
  guarantees every band is present and roughly equally massed, which is both a better
  picture and the thing that makes "palette length is the band count" honest.
- A cell stores a **palette index**, never an RGB. Matching is `cell.idx === laser.idx`
  — no tolerance radius, no fuzz, no two lasers overlapping ambiguously. This is what
  lets a laser be drawn in exactly its target swatch so the pairing reads without a
  legend.
- **Palette length is the band count.** A two-stop palette is a stark black-and-white
  map; twenty-four stops is a slow topographic dissolve. One knob covers the whole
  range with exact control over which colours, and it matches gallery schema canon
  (a piece cycling many colours uses one `ui:'colorList'` field labelled `Palette`).
- **Each new picture is a fresh field in the same palette.** Config stays the source of
  truth; the palette never changes out from under a chosen setting. Variety comes from
  the field regenerating, which is unlimited.

### Rendering

The grid lives in a **persistent backing buffer patched only where cells die**. At cell
size 16 this costs nothing; at cell size 4 (~60,000 cells) or 2 (~240,000) it is the
difference between viable and unshippable — redrawing every cell every frame is not.

---

## 3. Geometry

- **Track:** a rectangle, offset outward from the picture bounds by a gap.
- **Beam:** perpendicular to travel, pointing inward. On the top edge beams point down,
  on the right edge left, and so on.
- **Picture:** fills the canvas minus the track margin, so its aspect is the window's.

The gap does two jobs for free:

1. Each track edge runs from `pictureEdge − gap` to `pictureEdge + gap`, so the first
   and last stretch of every edge is past the picture's corner and its beams hit
   nothing. **Corner dead zones fall out of the offset** — there is no corner logic to
   write, and the turn gets a visible beat instead of a hard snap.
2. Every beam crosses a stretch of empty space before it lands, so a strike has room to
   read as a strike.

Circle and rounded-rectangle tracks were considered. A circle must enclose the
picture's *diagonal*, which shrinks the picture badly (~565px square on a 1200×800
canvas). Rectangle keeps the picture big. Track shape may become a knob later; it is
not one at ship.

### The erosion front

With axis-aligned beams the front is **four integer arrays**:

| array | meaning |
|---|---|
| `topFront[col]` | topmost surviving row in that column |
| `bottomFront[col]` | bottommost surviving row in that column |
| `leftFront[row]` | leftmost surviving column in that row |
| `rightFront[row]` | rightmost surviving column in that row |

A strike is an index read plus an advance past any already-dead cells (killed by a
laser on another edge). Amortised O(1) — each cell is skipped at most once per
direction. This is what makes small cell sizes real.

---

## 4. Laser rules

```
1. A laser rides the track. It is drawn in its target colour, and its
   brightness is charge-remaining / charge-max — fresh is blazing,
   nearly-spent is a dull ember, spent is dark.

2. As it travels it passes over cell columns. On reaching the CENTRE of
   a column it looks inward at the outermost surviving cell there.

3. Match  -> a quick bolt fires, that cell dies, charge -= 1.
   No match -> nothing at all. No bolt, no cost, silence.

4. Either way that column is now spent for this laser. It cannot punch
   deeper. It resets on crossing into the next column.

5. A dying cell shrinks toward its own centre while draining to black,
   rather than popping out.

6. Charge exhausted -> the dark laser rides on to the gate and ejects.
```

Consequences worth protecting:

- **There is no fire-rate parameter.** A laser fires at most once per cell-width of
  travel, so rate is `speed / cellSize`. Speed is the single tempo knob and the
  visuals can never desync from it. Turning it down slows travel and demolition
  together, so the composition at any instant is unchanged and only the pace moves.
  **This requires sub-stepping**: the lane test resolves only the lane a step ENDS in,
  so one long step per frame silently drops every lane centre it flew over. Measured
  before the fix: 31 shots per 100 lanes passed at cell 4 / speed 400, and exactly
  **zero** at cell 2 / speed 600, where the step length and the lane pitch resonate so
  the centre is forever just out of reach. Advance in increments of at most half a
  cell.
- **Bolt reach is unlimited.** The target is the outermost survivor however deep it
  sits. Early bolts are short stabs across the gap; late in a picture's life a bolt
  lances across a lot of black to reach a survivor deep in the hollow. The shots
  visibly grow in reach over a run with nothing tuned to make that happen.
- **Misses are free and silent.** No charge, no bolt. Most lasers most of the time do
  nothing visible, which is what makes a strike read as an event.

**No aiming lines.** An earlier design had faint permanent beams tracing the erosion
profile; it was rejected as noise. The only beam ever drawn is the bolt of an actual
strike.

### Supply, spacing and queue

Two knobs govern the population. **Lasers at once** is how many ride simultaneously.
**Spacing** is how they are distributed:

- At **0** every laser enters at the gate, so they ride as one bunched pack and the
  picture is worked by a wave sweeping around the perimeter.
- At **1** the gate holds for `perimeter / capacity` of travel between releases. Since
  every laser moves at the same speed, they arrive already evenly spread and **stay**
  spread — two sit exactly opposite one another and work both halves at once; sixteen
  advance the erosion front around the entire perimeter simultaneously.

**Spacing is release timing, never position.** Every laser joins at the gate and
nowhere else. An earlier design gave each laser one of `capacity` standing positions
and placed it there directly; that produced the right formation but the wrong
behaviour — a new laser popped into existence part-way round the track, ahead of the
pack (measured: entering at s=2095 on a 4176 perimeter). Timing gets the same
formation with every arrival correctly entering at the top-left corner, and it needs
no per-laser slot state at all.

Entry carries a deliberate **sub-cell golden-ratio jitter**:
two lasers minted at an identical perimeter coordinate would be welded together for
life — same lane, same centre crossing, every frame — and would double-strike every
lane, breaking the one-shot-per-lane rule. The jitter is smaller than a cell, so it
never disturbs the formation.

When the track is at capacity, arrivals **wait in a drawn queue** just outside the gate
— each a dot in its own target colour. This is not decoration: an undrawn queue is
invisible state and trips UX invariant #2. It also doubles as a schedule readout —
three cream dots waiting means the cream is about to take a beating — and watching the
queue's colour mix drift as the picture erodes is a second, slower thing to follow.

The queue is **cleared, not launched**, once the picture is gone. Launching the backlog
at that point gives each new laser a full lap cap to burn with nothing to shoot, which
turns the intended quiet beat into minutes of black screen.

---

## 5. The scheduler

When a laser is minted its colour is drawn by **weighted random sample from a histogram
of what is exposed right now** — never from the whole picture, and never "pick the top
colour."

Sampling from the exposed front rather than the whole picture is what makes deadlock
structurally impossible. There is always something exposed, so there is always a valid
target, so the track can never stall and the picture is guaranteed to reach zero. It
also gives the erosion an arc for free: early lasers eat the outer masses, late ones
hunt scraps in the pockets, because that is what is exposed.

### Tempering

A strictly proportional draw starves minority colours — 5% of twelve lasers is 0.6, so
that colour is usually simply absent, which is the boring version. Weights are tempered
by one exponent `k` (`p^k`, renormalised) before the draw:

```
exposed front:   brown 62%   ochre 21%   cream 12%   red 5%

k = 0.0  Even         25.0%      25.0%      25.0%     25.0%
k = 0.5  (default)    43.4%      25.2%      19.1%     12.3%
k = 1.0  Proportional 62.0%      21.0%      12.0%      5.0%
k = 2.0  Dominant     86.3%       9.9%       3.2%      0.6%
```

At `k = 0.5` with twelve lasers riding that is roughly 5 brown, 3 ochre, 2 cream,
2 red at any moment — the picture is clearly being worked on, but there is always a
minority colour doing something odd off in a corner. This is deliberately **not**
surgical. A laser draws its colour from what is exposed *at mint time*, rides, and may
well arrive to find that colour already gone. Those misses are the texture.

Tempering also kills residue: with minority colours always under some pressure, nothing
survives as a stubborn permanent speck and the picture actually finishes.

### Anti-clog

A laser whose colour goes extinct before it reaches it never fires, never spends charge,
and therefore never ejects — it would occupy a track slot forever. Every laser
therefore carries a **lap cap**: after L laps it ejects regardless of remaining charge.
Charge stays exactly "strikes remaining"; the cap is a safety that rarely fires,
because a well-matched laser burns its charge in well under one lap.

---

## 6. The cycle

The picture runs to **empty**, and the emptiness is deliberate.

As the last cells go there is nothing left to tune new lasers to, so arrivals stop. The
queue drains. Stragglers already on the track finish their laps carrying charge they
will never spend, and eject. The track turns dark and quiet for a beat — still turning,
nothing to shoot. Then a new field resolves in and the track floods with fresh bright
lasers at once.

The rhythm is emergent: full → working → thinning → quiet → full. No timer, no fade
curve, no transition to tune. It also sets the frame for the whole piece — **the
machine is permanent, the pictures are temporary.**

Cutting over at a ~85% threshold with the next picture fading in over the ruins was
considered and rejected: it makes the transition something to hand-design and tune, and
it costs the moment of stillness, which is arguably the most zen thing here.

---

## 7. Background

Flat, near-black (schema canon: a `ui:'color'` field named `background`, dark default).

A strike therefore reveals nothing — the cell drains to black and is gone.

**Every palette ramp must stop short of the ground.** Quantization is by quantile, so
each band is an equal share of the picture: a near-black darkest stop makes a *sixth*
of every map indistinguishable from destroyed space, and the lasers hunting that band
invisible on that same ground — invisible objects doing invisible work (invariants #1,
#2 and #5). Shipped ramps measure ≥ 1.88 WCAG contrast for the darkest stop against
its own background, and ≥ 1.31 between adjacent bands.

**Seam left clean for the deferred alternative.** "What is under a dead cell" stays a
single lookup that today returns the background colour. The layered version — where the
*next* picture is already underneath and every strike excavates a fragment of it — is a
change inside that one function, not a data reshape. Deferred, not designed out (§11).

---

## 8. Schema

All defaults below are **placeholders to be settled by eye in Chrome**, not values to
argue about before anything is on screen.

| section | field | ui | notes |
|---|---|---|---|
| Picture | `cellSize` | slider | ~2–40. Smaller = finer picture and a much longer demolition. |
| Picture | `featureSize` | slider | Big lazy blobs ↔ crenellated ridges and islands. |
| Picture | `roughness` | slider | Octave weighting of the field. |
| Color | `palette` | colorList | Label `Palette`. **Its length is the band count.** |
| Color | `background` | color | Label `Background`, dark default. |
| Lasers | `capacity` | slider | **Lasers at once** — how many ride simultaneously (1–64). |
| Lasers | `spacing` | slider | 0 = one bunched pack entering at the gate; 1 = evenly spread standing positions that stay even. |
| Lasers | `arrivalRate` | slider | How fast lasers show up at the gate. |
| Lasers | `charge` | slider | Cells one laser can destroy before going dark. |
| Lasers | `speed` | slider | Track speed — also sets fire rate (one shot per cell of travel). |
| Lasers | `targetingBias` | slider | Even ↔ Proportional ↔ Dominant (the `k` of §5). |
| Lasers | `trackOffset` | slider | Gap between the track and the picture. |
| Advanced | `seed` | number | `randomizeOnFreshLoad: true`, `collapsed: true`. |
| Advanced | `lapCap` | number | Anti-clog safety (§5). |

Every non-obvious field carries persistent `.meta({ help })`. `Advanced` starts
collapsed via `collapsed: true` on `seed`, per canon.

### Presets

Two independent groups:

- **Palette** — Bathymetric, Ember, Monochrome, Verdigris, Ultraviolet, **Mariners**
  (the old-school 1977–86 royal-blue-and-gold identity the gallery already shares
  across Flow Field, Squiral and Particle Life; re-spaced for contour work, since a
  straight navy→royal→sky→gold→cream→silver ramp bunches at the light end).
- **Demolition** — `capacity` / `spacing` / `charge` / `arrivalRate` / `targetingBias`
  moved together: Patient, Steady, Sentinels (2 opposed), Ring (16 evenly spread),
  Swarm, Focused.

### Live-apply

`update(state, config, size)` applies visual params without reallocating: palette
colours, background, speed, arrival rate, charge, bias, track offset, lap cap. Returns
false (forcing teardown + `setup`) only for structural changes: `cellSize`,
`featureSize`, `roughness`, `seed`.

---

## 9. Modules

| file | responsibility | purity |
|---|---|---|
| `field.ts` | noise → quantized palette-index grid | pure, deterministic |
| `front.ts` | the four erosion-front arrays; strike / kill | pure, O(1) amortised |
| `lasers.ts` | pool, track parameterisation, lifecycle, queue | pure |
| `scheduler.ts` | exposed histogram + tempered weighted draw | pure |
| `render.ts` | backing buffer, dying-cell animation, bolts, track, queue | draw only |
| `ablation.ts` | state assembly + per-frame step | orchestration |
| `schema.ts` | Zod schema + presets | — |
| `index.ts` | `defineDiversion` | — |

`lasers.ts` owns the mapping from a scalar perimeter position to `{x, y, edge, beam
direction, column index}` — every other module deals in that resolved form.

---

## 10. Tests

Co-located `*.test.ts`, per repo convention.

- **field** — same seed → identical grid; every palette index appears, with roughly
  equal cell counts (the quantile guarantee); **local nesting** — no two orthogonally
  adjacent cells differ by more than one band index, which is the property that makes
  the picture peel in layers.
- **front** — a strike removes exactly the outermost survivor; fronts stay monotonic;
  a laser cannot strike the same column twice without leaving it; a cell killed from
  one edge is correctly skipped by the opposite edge's front.
- **scheduler** — the histogram counts only exposed cells; tempering matches the table
  in §5 at k = 0, 0.5, 1, 2; an extinct colour is never returned; a draw always succeeds
  while any cell survives.
- **lifecycle** — a laser ejects at zero charge; the lap cap ejects a laser that never
  fires; the queue fills at capacity and drains below it.
- **cycle** — reaching zero cells regenerates the field; no lasers are minted while the
  grid is empty.
- **framework keystones** — codec round-trip and resilience; the seed contract.
- **perf guard** — the backing buffer is patched, not rebuilt, on a strike.

---

## 11. Out of scope

- **Real images as targets** — tracked in **#278**. Cells already store a palette index,
  so a real picture needs only a quantization step on load; the blockers are the URL
  codec's full-snapshot contract and the absence of binary assets in the repo. Bundled
  set first, upload second.
- **Layered reveal** — the next picture already underneath, so a strike excavates rather
  than erases. Seam kept clean (§7). Revisit if flat black reads thin in the third act.
- **Other generators** — hand-authored nested geometry, landscape strata, radial
  ornament. Add once the mechanic has been judged against the contour field.
- **Track shape as a knob** — circle / ellipse / rounded rectangle.
