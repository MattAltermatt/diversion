# Ablation — two controls: on track, and in queue

**Date:** 2026-08-15
**Slug:** `ablation`
**Status:** shipped 2026-08-15
**Supersedes:** `2026-08-15-ablation-fleet-design.md` §2 "The fleet" (the `Fleet`
field and its clamp) and its §8 schema rows for `fleet`. Everything else in that
document stands — the rotation triggers, the retired row, the Unison lock, the
proportional allocation, and the render layout are all unchanged.

`Fleet` is removed. The turret count is now set by the two numbers a viewer can
actually count on screen, and the total is derived from them.

---

## 1. Why the old pair was confusing

There are three quantities and only two of them can be independent:

```text
total  =  on track  +  in queue  ( +  retired, which is emergent )
```

The shipped pair was **(total, on-track cap)**. Three problems, all structural:

1. **The queue had to be read as a subtraction.** The queue is the thing drawn on
   screen — a trail of dots from the gate — and it was the one quantity with no
   control. `Fleet 20 / Turrets on track 12` meant "8 dots", worked out in the head.
2. **Half the space was degenerate.** Once `fleet <= capacity` the queue was empty
   and the cap stopped mattering: `fleet 12 / track 12` and `fleet 12 / track 40`
   are the same piece. Three settings, two outcomes.
3. **The floor was silent.** `resolveFleet` raised `fleet` to `palette.length`, so
   the slider could read 6 while 12 turrets existed, with nothing on screen saying so.

## 2. The controls

| field | label | range | default | meaning |
|---|---|---|---|---|
| `capacity` | Turrets on track | 1–64 | 12 | how many ride at once |
| `queued` | In queue | 0–64 | 8 | how many wait outside the gate |

Both are directly countable against the picture, which is the entire reason they
are the controls and the total is not. `queued: 0` is legal and means *no reserve* —
a turret rotating out is released again immediately.

The same pair serves **both** targeting modes. A mode-dependent pair (total + queue
in Mixed, track + queue in Unison) was considered and rejected: it is the same
two-of-three either way, so the only effect is that a slider changes meaning when
the segmented control flips.

## 3. The one real difference between the modes: the floor

`resolveFleet(capacity, queued, minTotal) = max(capacity + queued, minTotal)`.

- **Mixed** passes `minTotal = palette.length`. Mixed allocates the crew per band,
  and nothing but a turret tuned to band `b` destroys a cell of band `b` — so a band
  that draws zero turrets is **immortal**, the picture never reaches zero cells, and
  the piece hangs on a frozen remnant with the track going round. This is a
  correctness requirement, not balance.
- **Unison** passes `minTotal = 1`. The whole crew is minted onto one lock band and
  the lock is re-picked from whatever is exposed, so no colour can go uncovered.
  `capacity 2 / queued 0` therefore means **exactly two turrets** — honoured, not
  raised. This is the mode's whole behavioural difference at this layer.

**The floor's surplus lands in the queue, never on the track.** "Turrets on track"
is the number counted against the track, so it is never raised out from under the
viewer. Palette 6 / track 1 / queue 0 gives one turret riding and five waiting.

The floor cannot live on either slider's `min`: it depends on `palette.length` and
on `targeting`, both different fields. It is resolved in `fleetTarget()`, where all
three are visible.

**Known residue, accepted.** The floor leaves a small degenerate zone of its own: in
Mixed at `capacity 1` with 6 colours, `queued` 0 through 5 all produce the same piece,
because the floor absorbs them. The slider moves and nothing on screen changes — which
is the shape of the very problem §1.2 sets out to kill, just shrunk from half the space
to a corner of it. It cannot be removed without removing the floor, and the floor is a
correctness requirement, so the help text carries it instead.

## 4. A live fleet edit reconciles in place

The shipped code re-crewed on a `Fleet` edit — `crew()` clears the track, so the
whole ring popped back to the gate. That was tolerable for `Fleet`. It is not
tolerable now, because `capacity` feeds the total, and `capacity` is the slider most
likely to be dragged. `resizeCrew()` therefore reconciles without clearing:

- **Per band, not by tail.** It computes the desired split with the same
  `allocateFleet` used at picture start (basis: `bandAlive`, so the split still
  describes what is left on screen) and trims or mints against it. A blind tail trim
  can take the last turret hunting a live colour — the §3 deadlock, entered by the
  back door.
- **Trims the retired row first**, then the queue. Never the track: nothing may
  appear or disappear mid-track.
- **The rest sheds at the gate.** A surplus that is all on the track comes off one
  turret at a time in `rotate()`, which simply does not requeue it. `rotate` keeps a
  turret that is the **last one covering a live band**, so the shed cannot deadlock
  the picture either; sitting above target for another shift is harmless and it
  converges.
- Consequence worth knowing: the total sits **above** target until the shed catches
  up, and by more than one lap's worth if the slider is worked back and forth — each
  intermediate value mints for under-covered bands while another band's surplus is
  still riding. The bound is **`target + track.length`**, and `track.length` is capped
  by the *largest capacity ever applied* in this picture, not the current one — so a
  drag that visits a high capacity on its way down raises the ceiling for the rest of
  the picture. Two independent 10-minute jittered-drag probes measured peaks of 148
  against a nominal 72, and 137–144 against a nominal 128; both converged exactly, and
  a monotone 64 → 1 drag settled in 16–19 simulated seconds. Bounded and
  self-correcting, and the only cost is a few extra dots in the queue and retired rows
  for a shift. Correct, but do not describe it as instant.
- A `targeting` change still full-re-crews: it changes what colour *every* turret
  should carry at once, and reconciling that in place would mean inventing a rule
  for which turrets keep their colour.

Reconciling in place is also, unexpectedly, the cheaper path. There is no debounce
anywhere between the slider and `update()` — `Slider` uses the native `input` event and
`ConfigScreen.update` runs synchronously — so **every intermediate value of a drag runs
this code**. `crew()` rescans `field.idx` (402,083 cells at `cellSize: 2`), which cost
**1.15 ms per pointermove** on the old `Fleet` slider, about 7% of a frame budget for
the config apply alone. `resizeCrew` measures 0.0013 ms in the same regime.

`state.minted` is a monotonic mint counter, reset only by `crew()`. The sub-cell
entry jitter walks a golden-ratio sequence keyed on it, and a resize must **continue**
that sequence — restarting it hands a new turret an existing turret's offset, and two
turrets released in the same frame (which is every release at `Spacing 0`) are welded
together for life.

## 5. Codec, presets, links

- **Codec-safe.** `urlCodec` ignores non-schema params (`urlCodec.ts:259`), so a
  stale `?fleet=20` link decodes cleanly minus that field. Nothing else changes: keys
  are field names, and `capacity` keeps its name.
- **Presets keep their fleets exactly.** Every `Demolition` option already sat at
  `fleet ≈ 1.6 × capacity` — a queue fraction all along — so each translates with no
  re-tuning. `Steady` is still 20 turrets: 12 riding, 8 waiting.

```text
preset        was (cap, fleet)   now (track, queue)
------------  -----------------  ------------------
Patient        5,  9              5,  4
Steady        12, 20             12,  8
Sentinels      2,  6              2,  4
Ring          16, 26             16, 10
Swarm         40, 64             40, 24
Relentless    14, 24             14, 10
Strip Mine    14, 22             14,  8
```

- `Spacing`'s gate interval is still `spacing * perimeter / capacity` — unchanged.
- The queue count is a **starting** number, not an invariant: as colours run out,
  queued turrets drain into the retired row. The help text says so.

## 6. Tests

New block `track and queue as the two controls`, plus a Unison floor case in
`the circulating fleet`. Every guard below was mutation-checked — the mutant was
introduced, the suite was run, and the failure confirmed:

| guard | mutation that must fail the suite |
|---|---|
| headcount is `track + queue` | — (pinned directly, swept over 5 splits) |
| floor exists | `resolveFleet` returns `capacity + queued` |
| floor is Mixed-only | `minTotal = bands` unconditionally |
| floor lands in the queue | floor raises `capacity` |
| resize is in-place | `resizeCrew` → `crew` |
| resize is per band | blind tail trim + blind top-up |
| shed keeps a band's last turret | shed unconditionally on over-target |
| capacity feeds the total | `applyConfig` watches `queued` only |
| jitter counter survives a resize | `minted` reset per mint |

Two of those escaped the first pass and are worth recording, because both are the
same shape — **a guard that fires later than the test looks**:

- The **shed** runs in `rotate()`, laps after `applyConfig` returned, so a test that
  inspects state at the edit never reaches it. The fix runs until the headcount is
  down to target and asserts coverage there — while pinning `pictures === 0`, since a
  completed picture re-crews and would restore coverage for free.
- The **capacity-feeds-total** path was invisible because every other test moved both
  sliders at once, and the `queued` change alone triggered the reconcile.
