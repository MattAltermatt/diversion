# Ablation — the circulating fleet

**Date:** 2026-08-15
**Slug:** `ablation`
**Status:** shipped 2026-08-15
**Supersedes:** parts of `2026-08-07-ablation-design.md` — §4 "Supply, spacing and
queue", §5 "The scheduler", §8 "Schema". Everything else in that document still
stands, in particular §1 (the outermost-survivor rule), §2 (the picture), §3
(geometry and the erosion front) and §6 (the cycle).

A turret is no longer built and consumed. It is minted once per picture and stays:
it rides a shift, rotates out at the gate, recharges, queues, and comes back. The
crew is permanent and the pictures are temporary — which the original spec said in
its closing line and did not implement.

---

## 1. What changes, in one table

```text
                       shipped today                    this design
---------------------  -------------------------------  ------------------------------
lifecycle              minted -> rides -> destroyed     minted once -> rides -> rotates
                                                        out -> queues -> rides -> ...
population governed    arrivalRate (a trickle) capped   fleet (a fixed crew), capped on
by                     by capacity                      track by capacity
leaves the track when  charge out / blank lap / lap cap  unchanged
what happens then      gone                             back of the queue, at full charge
colour, Mixed mode     drawn per-turret from the        allocated at picture start in
                       EXPOSED front at mint time       proportion to the WHOLE picture,
                                                        then fixed for the turret's life
colour, Unison mode    -                                every turret takes the engine's
                                                        current target on rotation
colour exhausted       n/a                              the turret retires (Mixed only)
spacing default        0 (one bunched pack)             1 (evenly spread)
```

Issues: **#281** (even spacing), **#282** (unison targeting), **#283** (this fleet
model, which subsumes both).

---

## 2. The fleet

`Fleet` is the total number of turrets in existence. `Turrets on track` (the field
formerly labelled "Lasers at once") is how many of them may ride at once. The
difference stands in the queue, and that is the whole point — a standing queue is
what makes the schedule readable, and under a closed loop with `fleet == capacity`
a rotating turret would find its own slot free on the same frame and never
visibly queue at all.

Every turret is in exactly one of three places:

| place | meaning | drawn |
|---|---|---|
| `track` | riding, may fire | on the track, brightness = charge remaining |
| `queue` | waiting for a slot, at full charge | dot trailing back from the gate |
| `retired` | its colour is gone for this picture | dot trailing back from the far corner |

### Rotation

The three triggers are unchanged from the shipped piece and are still evaluated on
a lap boundary, which is to say at the gate: **charge exhausted**, **a lap with no
strike**, **the lap cap**. What changes is only the destination. A rotating turret:

1. leaves the track at the gate — the point every turret enters at, so nothing ever
   appears or disappears mid-track;
2. is restored to full charge;
3. takes a new band if the mode says so (§3, §4);
4. joins the **back** of the queue, or the retired row if its band is extinct.

`Charge` therefore stops being a life span and becomes a **shift length** — how many
cells one turret destroys before rotating out. That is also the fleet's churn rate,
and therefore how fast Unison mode converts to a new colour (§4).

Recharging happens instantly on rotation rather than gradually while queued. The
alternative was tempting — waiting dots visibly brightening is a second slow thing
to watch — but brightness is alpha over a near-black ground, so a freshly-returned
turret would be an invisible dot, and the *colour* of a waiting dot is the actual
readout ("three cream dots means cream is about to take a beating"). Trading a
legible readout for a brightening animation is the wrong way round (invariants #1,
#2, #5).

### Release

Unchanged from the shipped gate: FIFO, with the gate held for `spacing × (perimeter
/ capacity)` of travel between releases. The default for `spacing` moves from 0 to
**1** (#281) so the crew rides evenly spread around the whole perimeter rather than
as one bunched pack.

The start-of-picture flood survives for free: at picture start the entire fleet is
in the queue, and the gate releases it on the spacing interval.

**Shipped correction — the gate was quantizing every opening to a whole frame.**
Neither this design nor `2026-08-07-ablation-design.md` anticipated a bug found
during implementation: `gateClear` was decremented and then clamped with
`Math.max(0, s.gateClear - ds)`, and a release re-*assigned* the interval
(`s.gateClear = gateInterval(s)`) rather than accumulating the leftover travel past
zero. Clamping the sub-frame remainder away rounds every opening up to a whole
frame's worth of extra spacing, so "evenly spread" was never actually even — measured
at speed 400 / capacity 12, openings landed 126.7px apart against a 121.3px ideal,
leaving a 51px gap beside a 142px one, 58% off even, before a single rotation had
even happened. The fix carries the overshoot by *subtracting* `ds` without a floor
and *adding* the interval on release (`s.gateClear -= ds`, `s.gateClear += gateInterval(s)`
in `ablation.ts`), clamping only the idle case (`s.gateClear < 0` while the gate is
blocked by a full track or empty queue, so unused credit can't bank into a burst).
This means the original spec's even-spacing claim — carried forward from
`2026-08-07-ablation-design.md`'s §4, and repeated unmeasured until Task 7's guard
test — was never actually true even at `spacing = 1`, independent of any churn from
rotation. The generalizable lesson is in `CLAUDE.md` under "Gotchas learned."

---

## 3. Mixed mode — the crew is proportional to the map

At picture start the fleet is allocated across bands in proportion to the **whole
picture**, not to the exposed front: 50% of the map blue means 50% of the turrets
blue. A turret then keeps that band for its whole life in this picture.

Allocation is `total[band]^k` normalised, where `k` is `Targeting bias`, distributed
by **largest remainder** so the counts sum exactly to the fleet size.

- `k = 0` — equal turret count per band regardless of mass
- `k = 1` — strictly proportional (the default; this is what makes the 50/50 example
  literally true)
- `k > 1` — piles onto the biggest band

`Targeting bias` therefore keeps its job and changes its subject: it used to temper
each turret's individual draw, and now it tempers the crew's composition. Its
default moves from 0.5 to **1.0**.

### The floor, which is a correctness requirement not a nicety

**Every band gets at least one turret**, and `Fleet` is clamped up to
`palette.length` at runtime. This is not balance. Nothing but a turret tuned to band
*b* will ever destroy a cell of band *b*, so a band allocated zero turrets survives
forever, the picture never reaches zero cells, and the piece hangs permanently —
no new picture, no quiet beat, just a frozen remnant and a track going round. The
largest-remainder pass reserves one turret per band before distributing the rest.

`Fleet`'s slider minimum cannot itself express this, since it depends on
`palette.length`, another field. So the clamp is resolved at runtime where both are
visible, in the same spirit as `resolveMatrix` in particle-life-gpu.

**Shipped correction — `crew()` must count only cells that are still ALIVE.** It is
called on a live `Fleet` / `Targeting` edit and on resize, not just at picture start,
and counting every cell there resurrects extinct bands in `bandAlive`. Both retirement
tests key on `bandAlive[band] === 0`, so one slider drag mid-picture switched
retirement off for the rest of the picture *and* allocated turrets to colours that
were already gone — turrets that can never fire, so they blank-lap and cycle forever
holding track slots. Measured at 3.5% remaining: dragging `Fleet` 20 → 21 reset
`bandAlive` from `[39, 7, 4, 41, 81, 0]` to all-820. Filtering on `field.alive` fixes
the allocation and the retirement test together, and changes nothing at picture start.

The other direction needs no clamp and no warning: a fleet smaller than `Turrets on
track` simply means the whole crew rides at once and the queue stands empty, which
is a legitimate setting rather than a misconfiguration.

### Idle turrets: measured, not feared

Fixing a turret's colour from the whole picture raises the obvious worry that
turrets assigned to buried bands sit useless until their layer surfaces. Measured
against the real field builder at the live window's grid (117×73), 5 seeds × 2
palette lengths:

```text
                exposed bands   share of each band's cells on the front at t=0
6 bands, s1-s5      6/6          2.0% - 6.8%
12 bands, s1-s5    12/12         0.6% - 10.2%
```

Every band is exposed at picture start on every seed — which follows from §2 of the
original spec, since the picture is several nested stacks side by side and every
band reaches the border somewhere. No turret starts idle. Bands do differ by up to
13× in how much surface they currently offer, so a turret can go quiet for a while;
under a circulating fleet that costs a blank lap and a rotation rather than a death.

### Retirement

When a turret's band is **extinct in the field** (not merely unexposed — an
unexposed band resurfaces as the layer above it is peeled, an extinct one never
does), the turret retires at its next rotation and takes no further part in this
picture.

Because bands are equal-mass by quantile, retirement cascades toward the end, and
the fleet visibly thins as the map completes. That is the intended arc. It also
means the quiet beat at the end of a picture is now something you can see coming:
the retired row fills up as the map empties out.

---

## 4. Unison mode — the whole crew hunts one colour

The engine holds one `lockBand`. **The whole fleet is crewed onto it at picture
start**, and every turret that rotates out afterwards takes it.

That first clause was missing from the design and had to be added after the mode was
seen running. Applying the lock only in `rotate` meant a freshly crewed picture wore
the proportional *Mixed* split and converged to one colour only as turrets cycled — so
Unison was indistinguishable from Mixed on load, and at low `Track speed` it never
converged at all (a lap at speed 2 runs about 25 minutes). "All the turrets are that
colour" has to be true from the first frame, not eventually.

- **Chosen** by weighted random draw from the **exposed** histogram — the existing
  `temperedPick(hist, k, rand)`, unchanged, with the same `Targeting bias`. At the
  default `k = 1` a front of `deep-blue 44% · teal 27% · sage 19% · cream 10%` picks
  deep-blue 44% of the time and cream 10% of the time. Weighted, not deterministic:
  a big mass usually wins but a sliver gets its turn.
- **Released** when `exposedHist[lockBand] === 0` — the colour is no longer on the
  outside edge. Note this is *exposure*, not extinction: the crew can and will
  return to a colour later, when peeling the layer above it brings that colour back
  to the surface.
- **Applied on rotation only.** A turret already riding keeps hunting the old colour
  until its shift ends; a turret already queued keeps the colour it queued with.

That last rule is the one that produces the beat you actually watch. The engine
switches, and the change appears first as a *new colour entering the back of the
queue* while the track is still working the old one. The crew converts over the next
couple of laps as turrets cycle through.

The cost is honest and should be checked by eye at verify: a turret released with a
now-dead colour rides a full blank lap before it rotates. At shipped defaults on a
1320×880 window (perimeter 3976 px, speed 140 px/s) a lap is **28 s**, so a full
conversion runs roughly two laps ≈ 1 minute against a ~16 minute picture. At faster
settings it is proportionally quicker, since a lap and a picture scale together.

Retirement (§3) is effectively Mixed-only: a Unison turret always takes a currently
exposed band, so it never holds a dead colour except in the final moments, when
everything retires together.

**Shipped correction — this had to be enforced, not assumed.** Two separate defects
made Unison retire in bulk, and review measured each with the other's fix in place:

- The lock was refreshed *after* rotation, so a turret crossing the gate on the frame
  its colour died took the stale, now-dead band. At capacity 2 this retired **18 of
  20 turrets in a single frame with 13.6% of the picture still standing.** The lock
  refresh now runs before rotation.
- The queue's retirement sweep applied in both modes. In Unison the queue is
  homogeneous — every waiting turret carries the same lock — so the frame that colour
  went extinct the whole queue retired at once: **8 turrets at capacity 12, 6 at
  capacity 14** (the shipped `Strip Mine` preset), with 4–13% of the map left. The
  sweep is now Mixed-only; a Unison turret keeps its dead colour for one blank lap and
  picks up the new lock on rotation, which is the lag described above.

Both are needed. Each fix alone leaves the other's regime broken, so the guarding test
sweeps capacity 2, 12 and 14 rather than one configuration.

### Why this is not just `Targeting bias` turned up

A high `k` leans each turret's *independent* draw toward the biggest exposed mass.
It stays stochastic and per-turret, minority colours keep leaking through, and the
focus drifts continuously as the histogram shifts. Unison is a hard lock held until
the colour actually leaves the surface. The two are different mechanisms and both
are worth having.

---

## 5. Drawing the two rows

The queue is already drawn by walking **backwards** along the track from the gate at
negative `s` and offsetting outward (`render.ts:213-222`). The retired row is the
same routine anchored at `perimeter / 2` — the bottom-right corner, diagonally
opposite the gate at the top-left.

- **Pending** trails back from the gate corner, each dot in its turret's own band
  colour.
- **Retired** trails back from the opposite corner, in the same colours at a
  **smaller radius**.

Two readouts, each legible at a glance, neither diluting the other: what is about to
happen on one side, what is finished on the other. Both are cleared and the fleet
re-crewed at each new picture.

**Shipped correction — the rows are told apart by SIZE, not by alpha.** Dimming the
retired row was the design's first answer and it is wrong on these palettes. Measured
over each preset's own background, a retired dot at alpha 0.3 composites to:

```text
palette        band:   1     2     3     4     5     6
Bathymetric  opaque  2.28  3.65  5.08  8.66 11.91 15.64
             @0.30   1.17  1.30  1.42  1.71  1.95  2.23
Ember        @0.30   1.12  1.21  1.35  1.56  1.83  2.22
Ultraviolet  @0.30   1.13  1.20  1.31  1.49  1.73  2.18
```

The darker **half** of every ramp lands at 1.12–1.5, well under the ≥ 1.88 floor §7 of
the original spec commits to — and retirement fills from the dark bands first, so the
row went most invisible exactly when it carried the most information (invariants #2
and #5). Reaching 1.88 on the darkest stop needs alpha 0.82–1.00 depending on the
palette, so alpha cannot carry a "dimmer" signal here at all. Both rows now draw
**opaque**; retired draws at 0.55× the radius. Note the darkest stop has only 2.28 to
give even at full opacity — there is no headroom to spend on transparency.

Each row is also capped to a quarter of the perimeter: the dot pitch shrinks when
`fleet` is large, so a 128-turret crew on a small viewport cannot run one row through
the other's anchor.

---

## 6. Schema

```text
section    field           change
---------  --------------  -------------------------------------------------------
Turrets    fleet           NEW. int, slider 2-128, default 20. Total turrets.
                           Clamped up to palette.length at runtime (§3).
Turrets    arrivalRate     REMOVED. Superseded by `fleet`.
Turrets    capacity        unchanged; label "Lasers at once" -> "Turrets on track"
Turrets    targeting       NEW. z.enum(['Mixed','Unison']), default 'Mixed'.
Turrets    spacing         default 0 -> 1 (#281)
Turrets    targetingBias   default 0.5 -> 1.0; help rewritten (it now tempers the
                           Mixed allocation and the Unison lock draw)
Turrets    charge          unchanged; help rewritten as shift length
(section)  'Lasers'        -> 'Turrets'
```

`z.enum`, not a TS `enum` — `erasableSyntaxOnly` is on and TS enums are banned
(TS1294). No `showWhen` is needed anywhere: `Targeting bias` is meaningful in both
modes, which is precisely why reusing `temperedPick` for the lock draw was the right
call rather than inventing a second selection rule.

**Shipped correction — `options` shape.** This design assumed `ui:'select'` consumed
`{value, label}` objects, by analogy with other list-shaped meta. `SchemaForm`'s
Select control actually consumes a plain `string[]`; the shipped field reads
`options: ['Mixed', 'Unison']`, not an array of objects. Checked against a sibling
`ui:'select'` field before writing it, per the plan's Task 3 note.

**Codec impact.** Field *names* are unchanged except for the removed `arrivalRate`
and the two new fields, so the only links affected are ones that predate today. An
old link's `arrivalRate` key is dropped and `fleet` / `targeting` fall back to their
defaults, which is exactly the per-field degradation the codec is built for. The
piece went live 2026-08-15 and no shared links exist yet.

### Presets

The `Demolition` group moves from `arrivalRate` to `fleet` and gains `targeting`.
Its option named **Focused** is renamed — with a targeting mode sitting next to it
in the same section, "Focused" reads as a mode name and invites exactly the wrong
inference. A Unison-flavoured option joins the group.

---

## 7. Vocabulary

"Laser" describes a disposable projectile. These are a permanent crew that rotates
through shifts, so the UI, the help text and the docs say **turret** throughout, and
the code follows: `lasers.ts` → `turrets.ts`, `Laser` → `Turret`, `state.lasers` →
`state.track`.

The rename is mechanical and lands in its own commit so the behavioural diff stays
readable. **No schema field name changes**, so every shared link still decodes.

---

## 8. Modules

| file | change |
|---|---|
| `turrets.ts` (was `lasers.ts`) | rename only; track geometry and `advance` unchanged |
| `scheduler.ts` | gains `allocateFleet(totalHist, k, fleetSize)` (largest remainder, floor of 1 per band); keeps `temperedPick` unchanged for the Unison lock |
| `ablation.ts` | `step()` rebuilt around a persistent pool and three places; `arrivalDebt` / `minted` retired; `lockBand` added |
| `render.ts` | queue holds turrets rather than band indices; retired row added |
| `schema.ts` | §6 |
| `presets.ts` | §6 |
| `field.ts`, `front.ts` | untouched |

State shape: one `turrets: Turret[]` pool is not enough on its own, because
rendering and release both need ordering. Three arrays of `Turret` objects —
`track`, `queue`, `retired` — with turrets moved between them. A turret's identity
is the object; its place is which array holds it.

---

## 9. Tests

New, beyond the existing suite which must stay green:

- **allocation** — counts sum to the fleet size exactly; every band gets ≥ 1 even
  when `fleet < bands` (clamped) and when one band is a rounding sliver; `k = 0`
  gives equal counts and `k = 1` gives proportional ones.
- **rotation** — a turret leaving the track reappears at the back of the queue at
  full charge; the fleet's total headcount is invariant across a whole picture
  (`track + queue + retired === effectiveFleet`, asserted every step).
- **retirement** — a turret retires only on extinction, never on mere unexposure;
  a retired turret never returns within the picture and every turret is re-crewed
  at the next one.
- **no-deadlock keystone** — run a full picture at `fleet = palette.length` and at
  a fleet with a one-cell band; assert `aliveCount` reaches 0. This is the test that
  protects §3's floor. Mutation-check it by deleting the floor and confirming it
  fails.
- **unison** — every turret minted or rotated carries `lockBand`; the lock changes
  only when its band leaves the exposed front; the lock may return to a band that
  resurfaces; a picture still reaches zero.
- **even spacing (#281)** — over a full picture at `spacing = 1`, the standing gaps
  between consecutive turrets in perimeter space stay even (bounded stddev, no
  clumping) across rotations and refills. This is the claim the shipped comment
  makes and nothing yet measures.
- **framework keystones** — codec round-trip and resilience, seed contract: unchanged
  and must stay green.

---

## 10. Deliberately not doing

- **Recharge over time while queued** (§2) — costs the queue's colour readout.
- **Retargeting a riding turret mid-flight** — makes the fleet recolour in one beat
  and kills the "new colour appears in the queue first" tell, which is the mode's
  whole visible signature.
- **Ejecting dead-colour turrets on a Unison switch** — frees slots faster, but
  throws away a full charge at every band change.
- **Per-turret standing positions on the track** — rejected in the original spec and
  still rejected: everything enters at the gate.
