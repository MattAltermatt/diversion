# Pool Navy — design spec

**Date:** 2026-09-21
**Slug:** `pool-navy`
**Kind:** `2d`
**Derived from:** the `ship-arena` prototype (`~/dev/MattAltermatt/ship-arena`)
**Probe:** branch `probe/escalation-arena` @ `7c152bc`, directory `probe/`.
`probe/RESULTS-FINAL.txt` is the **single canonical run** every number below is
quoted from — 16 files, 21 tests, all green.

> ## Revision 1 (2026-09-21) — a three-agent panel, and what it broke
>
> A reviewer, a plan-runner and a naysayer read this spec against the code and
> re-ran the probe. **The single largest finding was that its numbers came from
> three different vintages of a probe that kept changing underneath them.** Two
> sweeps had gone inert — traverse and rate of fire moved onto the weapon, so
> the knobs the sweeps drove were overwritten every step and printed
> byte-identical rows across a 9× range while reading as measurements. A third
> measurement averaged a cannon's time-to-impact together with a torpedo's
> lifetime cap and reported 43.9 m of flight in an 8 m pool.
>
> The fix was not to patch the prose. The probe was repaired, put in its final
> configuration, and run once; **every figure in this document is now quoted
> from that one file.** Sections 3.1, 4, 6, 7, 8 and 10 changed numerically.
>
> Also in this revision, from the panel:
> - **§4.2 is rewritten.** The dreadnought's control was a per-arrival
>   probability, which cannot express "occasionally" when lifetimes differ.
> - **§5.1's weapon shape was wrong** — a discriminated union that the probe's
>   flat record does not match and the plan's own tests cannot compile against.
> - **§5's "range is an axis" claim is withdrawn** and replaced with §5.3, a
>   measured law that explains why.
> - **§7.1 is deleted.** It was flagged as an unverified hypothesis and is now
>   also unfalsifiable as stated, since traverse is per-weapon.
> - **§9.2 and §11 are resolved** by owner decision.
>
> **Waves were prototyped and then cut** (owner, 2026-09-21). A boat-driven
> wave-equation field that yawed hulls and degraded gunnery works and is
> measured, but it is out of scope. It survives in the probe's history; see
> §13.

---

## 1. 🎯 The pitch

Toy warships in a swimming pool, fighting a war that never ends and keeps
drawing in new parties.

Six single-turret boats start as two sides of three. **Every time a ship sinks,
a replacement arrives flying a colour that has never been seen before** — and
after three such arrivals the next new colour begins. Nobody wins. The pool
holds six hulls forever, factions bleed out and are replaced, and the wakes
draw long sweeping arcs across the tile floor.

The interesting part is not the AI. It is that the water is real: hulls have
anisotropic drag, rudders only work when water flows over them, and turrets
physically cannot swing fast enough to track a close, fast target.

## 2. 🧭 Governing principle, inherited

> **When simulation and vibe disagree, simulation wins.**

Taken from the prototype's VISION and kept. When a mechanic could be made
prettier by departing from physical truth, find the real-world mechanism that
delivers the same look first. It has already paid twice in the prototype (turret
traverse replaced slow shells; a repair tender replaced a healing beam) and once
here (wall avoidance is helmsmanship, not a bounce coefficient — §6).

## 3. ⚙️ The escalation rule

This is the piece's one novel mechanic and everything else serves it.

- Open with **3 v 3**: faction 0 and faction 1.
- On **every** sinking, one replacement hull enters, flying **the current new
  faction**.
- The current new faction advances **every 3 arrivals**. Deaths 1–3 bring
  faction 2; deaths 4–6 bring faction 3; and so on without limit.
- Factions 0 and 1 are never reinforced. Neither is any later faction once its
  three hulls have arrived.

```
factionForDeath(n) = 2 + floor((n - 1) / 3)
```

### 3.1 What this produces — measured, not assumed

Every faction therefore gets **exactly three hulls**, so the population is a
conserved quantity and the piece is a **rolling window**: old colours go extinct
from the left while new ones enter from the right.

Measured over 60 runs (20 seeds × 3 pool sizes × 10 sim-minutes):

```text
afloat, min and max      exactly 6 in every sample of every run
live factions            2.86 (mean), 2.74–3.08 across seeds
sinkings                 4.17 / min — a new faction every ~43 s
mean gap between losses  14.1 s;  longest observed gap 66.5 s
factions per 10 minutes  14.3
hulls pinned on a wall   0.000 — see §6
```

⚠️ An earlier draft of this section said "stalls / deadlocks: none observed"
while §6 of the same document reported a stalled-hull fraction. Those were the
same runs contradicting each other. **"No deadlock" and "no hull stuck against
the tiles" are different claims**; at the final configuration both happen to be
true, and both are now stated as measured quantities rather than as an absence.

The population invariant is the keystone. **A test must assert it directly**
(`afloat === 6` on every step of a long run), because it is the property that
makes the piece endless, and nothing else in the design would fail loudly if it
broke.

## 4. 🚢 The roster

### 4.1 Hulls

The default hull is the prototype's **gunboat**, re-tuned. Owner-directed
changes from the prototype, each one deliberate:

```text
                     prototype   pool-navy    why
hull length            0.25 m      0.25 m     unchanged
top speed              0.95 m/s    0.50 m/s   "they don't go nearly as fast"
hull HP                  45          90       "their hulls are more powerful"
damage / shell            4.0         2.5     "weapons aren't quite as powerful"
turret traverse        110 °/s      45 °/s    now a per-WEAPON figure (§5, §7)
rate of fire            1.5 /s      1.5 /s    unchanged
gun range               1.2 m       1.2 m     unchanged
playback tempo          1.00x       0.60x     "everything slowed down a bit"
```

### 4.2 The dreadnought

**Occasionally** a replacement is a dreadnought rather than a gunboat: bigger,
slower, far tougher, carrying its own heavy mount.

⚠️ **Do not copy the prototype's figure of 6 °/s.** Its `VISION.md` table says
`5 @ 6 °/s` and builds the whole project's headline claim on it — *"at 6 °/s it
mostly cannot hit a gunboat… that gap is the game"* — but `src/balance.ts`
ships `turretTraverseDegPerSec: 78`. At 78 a dreadnought needs only 30 °/s to
hold a gunboat at its own range, so it tracks comfortably and **the gap does
not exist in the prototype as shipped.** The prose and the code disagree; the
code is what ran. That contradiction belongs to `ship-arena` and should be
filed there.

⚠️ **Its stats must be rescaled.** They are calibrated against a 0.95 m/s
gunboat; dropped in unchanged beside a 0.50 m/s gunboat the dreadnought would
be **the fastest ship in the pool**, inverting the point of it.

### 4.2.1 "Occasionally" is a statement about the POOL, not about arrivals

The obvious control — a per-arrival probability — is wrong, and not obviously
so.

The population is pinned at six. By Little's law the standing count of a type
is `arrival rate × mean lifetime`, so when lifetimes differ an arrival
probability does **not** set the standing mix. A dreadnought is by design
long-lived and hard to kill, so at a 4–5× lifetime an 8 %-per-arrival roll
settles at roughly a quarter to a third of the pool.

Worse, the feedback is positive: more dreadnoughts → fewer sinkings → fewer
arrivals → **the escalation rule, the piece's only novel idea, slows toward a
stop.** That is an absorbing state reached by tuning.

**So the control is a standing-population cap: at most one dreadnought afloat.**
That is what "occasionally a dreadnought" actually means, it is stable by
construction rather than by tuning, and it cannot strangle the escalation. A
roll still decides whether a free slot gets filled.

## 5. 🔫 Weapons

> ### Revision 2 (2026-09-21) — the roster is EIGHT, by owner direction
>
> §5 and §5.2 below describe four mounts with the other four backlogged. The
> owner asked for more ("any other weapons you can think to add? add them"), so
> **flak, railgun, mortar and depth charge were promoted out of §5.2 and ship as
> rollable mounts.** The roll is the content: with four types the repetition is
> visible within a couple of minutes.
>
> ⚠️ **Their figures are AUTHORED, not measured.** The original four carry probe
> numbers; these four carry reasoning only, and the probe was frozen before they
> existed. Treat every constant in them as a first guess — `railgun` in
> particular has 3.4 m of reach in a 5.3 m pool and traverses at 7 °/s, which
> §7's own sweep puts near 6.6% on-bearing. Measure them before quoting them.
>
> Two further corrections in the same pass:
> - **`missile.hitsAnyone` is `false`**, matching the table below. It shipped
>   `true` briefly, which took away the torpedo's stated reason to exist.
> - `mortar` and `depthCharge` DO hit anyone, deliberately — they are area
>   weapons, and the torpedo remains the only *aimed* round that can strike a
>   bystander.
>
> The backlog in §5.2 now holds only **rocket barrage**.

Each vessel carries **one randomly chosen weapon type**. The roster is the
content — with two types the repetition is visible within a minute.

```text
type       traverse    range    projectile            the axis it owns
--------   ---------   ------   -------------------   ---------------------------
cannon     fast        short    fast tracer           baseline
laser      instant     medium   none — a beam         DWELL: damage accrues only
                                                      while bearing is held, so
                                                      breaking lock is the counter
missile    very slow   long     slow, TURNS in        guidance turn rate — can be
                                flight                out-turned, and then misses
torpedo    slow        long     very slow, straight   hits ANYONE it meets, and
                                line, long-lived      leaves a wake. Friendly fire.
```

Torpedo earns its place by being the only weapon that can hit a third party,
which turns a two-ship duel into something the whole pool has an opinion about.

### 5.1 The data shape (decided, not asked)

A weapon is **declared data on the vessel**, as the prototype's `Ability` is —
one flat record, every field present on every kind:

```ts
export interface WeaponSpec {
  readonly kind: 'cannon' | 'laser' | 'missile' | 'torpedo'
  readonly traverseDegPerSec: number
  readonly rangeM: number
  /** Shots per second. Unused by `laser`, which is continuous. */
  readonly rateOfFirePerSec: number
  /** Per shell for the discrete weapons; per SECOND for `laser`. */
  readonly damage: number
  /** Projectile speed, m/s. `laser` has none. */
  readonly speedMs: number
  /** Degrees per second the PROJECTILE can turn. 0 = unguided. */
  readonly turnRateDegPerSec: number
  /** Seconds a projectile lives. 0 = resolves at fire time. */
  readonly lifeSec: number
  /** Does it hit whatever it meets, including friendlies? */
  readonly hitsAnyone: boolean
}
```

Measured values, from the canonical run:

```text
kind      traverse   range   RoF/s   damage   proj speed   turn   life   hits anyone
cannon      45 d/s    1.2 m    1.5     2.5      28 m/s      -      -         no
laser       95 d/s    1.0 m     -      2.6/s     -          -      -         no
missile     12 d/s    2.2 m    0.5     6.0      1.2 m/s   25 d/s   6.0 s     no
torpedo     20 d/s    2.5 m   0.35     8.0      0.9 m/s     -      3.2 s    YES
```

⚠️ **An earlier draft declared a discriminated union.** It gave the missile no
`lifeSec` — the one field that lets a missile expire unspent, which is the
entire guidance mechanic — and omitted `hitsAnyone`, which is the torpedo's
reason to exist. Flat is what the probe runs and what the tests assert against.

⚠️ **`missile.turnRateDegPerSec` is 25, not 60.** A missile is out-turnable
only when its own turn radius exceeds a hull's 0.75 m. At 60 °/s its radius is
1.15 m and it misses **1.0 %** of the time — the guidance axis does not exist.
At 25 °/s the radius is 2.75 m and it misses **11.7 %** in the mixed roster.

This is a **seam**: the richer roster in §5.2 preserves every field.

### 5.1.1 Two damage models, not one

⚠️ **The spec originally stated only one, and that was wrong.** `cannon` and
`laser` resolve **at fire time** and cannot miss — the cannon's sprite flies
only so the eye can follow it. `missile` and `torpedo` resolve **on impact**,
because a round that can be out-turned, or that can strike a bystander, must be
able to arrive somewhere other than where it was aimed. Both are required.

### 5.2 Backlog, explicitly NOT v1

**Mine / depth charge** (stationary, arms on a delay — interacts with the
standoff orbit), **flak** (knife range, wide tolerance, high rate), **railgun**
(glacial traverse, huge range and damage — the dreadnought's natural
armament), **rocket barrage** (unguided cone salvo). File as issues.

**Waves** (cut by the owner, 2026-09-21, after prototyping). Boats inject into
a wave-equation field; the local surface slope shoulders each hull and slews
it; because turret bearing is hull-relative, a slewing deck drags the gun off
target with no aiming model at all. It works and is measured — gunnery quality
falls from 41.5 % to 32.7 % on-bearing at a plausible sea state — and it costs
0.043 ms/frame. Out of scope for v1; the code is in the probe's history.

### 5.3 ⚠️ Range is a FIRE GATE, not a positioning axis

An earlier draft claimed reach as one of the four differentiating axes. **That
claim is withdrawn**, because the piece cannot express it.

Making the standoff weapon-aware was implemented and measured. It moves the
kill rate 4.20 → 4.22 / min and the actual fighting range 1.21 → 1.27 m, against
declared reaches of 2.2 m and 2.5 m. The reason is that **engagement range is
set by crowding, not by the standoff circle**:

```text
fleet                     commanded standoff   ACTUAL mean range
ALL missile (reach 2.2 m)           1.65 m              1.21 m
ALL cannon  (reach 1.2 m)           0.90 m              1.21 m
```

Both converge on the same number from opposite sides. What predicts it is the
mean nearest-neighbour distance for N hulls in area A:

```text
pool            area     0.5·√(A/N)   measured   error
kiddie         16.0 m²       0.82 m     0.94 m     15 %
backyard       36.0 m²       1.22 m     1.24 m      1 %
competition    92.2 m²       1.96 m     1.80 m     -8 %
```

A naive captain chases its **nearest** enemy and never retreats — retreating is
a stated non-goal (§13) — so the shorter-reach hull dictates the range the
moment the two meet. Reach cannot be a positioning axis without kiting.

**Consequence, stated plainly:** the four weapons differentiate on traverse,
guidance, friendly fire and lethality — which they measurably do — and **not**
on reach. The one real lever on how close-quarters the fighting looks is the
**pool size**, which is a config field.

## 6. 🧱 Wall avoidance — a REQUIRED mechanism the prototype lacks

This is the single most important thing to carry across, and it is easy to miss
because it does not exist in the source material.

`rudderTorque` scales with `max(0, vForward)`. The captain steers only at the
nearest enemy. So a hull that drives into a wall loses way, loses **all** rudder
authority, and full throttle pins it there permanently.

```text
backyard, canonical run            stalled >3 s   mean speed / top
no avoidance                          67.5 %           0.22
helm-level avoidance, 1.5 / 2.2       33.5 %           0.42
       "          "   2.25 / 4.0        1.3 %           0.59   ← ship this
```

And at the **final** roster — four weapons, missile at 25 °/s, the tuned hulls —
the 20-seed × 3-pool sweep reports **0.000** pinned and a worst pin of **0.0 s**.
The defect is gone, not merely reduced. ⚠️ That is a property of the whole
configuration, not of the avoidance constant alone, so the regression test must
pin the *mechanism* (remove `avoidWalls`, the test goes red) rather than only
the shipped number.

The fix belongs at the **helm** layerThe fix belongs at the **helm** layer (how you drive), beside `standoffCourse`,
not at the captain layer (who you attack). Ordered heading is bent away from any
wall inside a margin of `TURN_RADIUS_HULLS × length × 2.25`, with gain 4.0.

Two measured facts to carry, because both cost a wrong turn to learn:

- **Wider margin is monotonically better for stalls.** Capping the margin to a
  fraction of the pool was tried and is strictly worse (backyard 1.8 % → 13.1 %,
  kiddie 10 % → 42 %). The only real bound on the margin is the **look** — a
  margin is a no-go zone, and too wide means the ships stop using the ends and
  the pool reads smaller than it is.
- **Longer fights make this worse, not better.** Raising HP from 45 to 90 alone
  took stalls from 14 % to 35 %, because ships hold the standoff orbit ~25 s
  instead of ~8 s. Any future change that lengthens engagements must re-check
  this number.

## 7. 🎯 Gunnery, and what is actually true about it

The prototype's accuracy model in full: **damage resolves at fire time, there
is no spread roll and no hit chance.** Every shell that leaves a barrel lands. A
turret either bears closely enough to fire or it does not. That is what keeps a
seed reproducible, and it is kept. (Missiles and torpedoes resolve on impact —
§5.1.1 — and *can* miss, but not by rolling a number.)

**Firing tolerance is not a lever.** Sweeping `bearingToleranceDeg` from 0.5° to
10° moves the kill rate non-monotonically within noise. Do not tune it.

**Traverse is a strong lever, and this is the sweep that measures it.** Cannon
only, so one mount is being varied rather than four:

```text
cannon traverse   on-bearing when able to fire   shots/min   sunk/min
        45 d/s                         62.9 %         235        6.30
        27 d/s                         35.5 %         154        4.00
        18 d/s                         22.6 %         107        2.80
        11 d/s                         12.5 %          69        1.60
         7 d/s                          6.6 %          48        1.10
```

```text
cannon rate of fire   shots/min   sunk/min
           1.50 /s        114.4       4.30
           1.05 /s         86.7       3.40
           0.75 /s         70.4       2.80
           0.45 /s         49.6       2.40
           0.30 /s         40.1       2.00
```

⚠️ **Both of these sweeps were previously inert and printed identical rows
across their whole range while reading as measurements.** Traverse and rate of
fire had moved onto the weapon, and the knobs the sweeps drove were overwritten
on every step. They are now multipliers applied at the point of use. Any future
knob added here must be checked the same way: **a sweep whose rows do not move
is a broken sweep, not a flat response.**

45 °/s is the cannon's shipped figure. It is where the bearing gate binds
meaningfully — a turret with a chance to fire is on bearing 63 % of the time,
not ~100 % — which is what makes traverse an axis the other three mounts can
differ along.

## 8. 💥 Making projectiles legible

A shell flies for 20 ms — **2 rendered frames**, moving 49 px between them,
drawn as a 1.8 px dot. That is a strobe, not a projectile. Three fixes, all pure
rendering with no simulation consequence (`shellSpeedMs` is commented in the
prototype as "this is rendering"):

- **Tracer, not a point.** Draw the ground the shell has covered — a gradient
  streak from muzzle to current position with a hot head. ~13× the ink and
  continuous rather than strobing.
- **Impact splash**, 0.25 s expanding ring. ~12× the shell's own dwell, so it is
  the thing the eye actually catches. Every splash is damage landing, since
  there are no misses.
- **Muzzle flash**, 0.09 s stub at the gun, so it is readable *which* ship fired.

⚠️ At the mixed roster's 112 shots/min these are ~2 tracers a second across six hulls. Once
visible, this may read as busy; the traverse drop in §7 reduces it to 229.

## 9. 🖼️ Look

Inherited toy-vector aesthetic: flat pool blue with a faint tile grid, a white
pool edge, filled wedge hulls in faction colours, visible turret stubs, tapering
wakes, white splash dots. Drawn entirely in code, no assets.

**Wakes are instrumentation, not decoration** — they are how you see the hull
slipping sideways against its own track, and in practice they are the most
beautiful thing on screen. Wake opacity tracks condition, so a limping ship
leaves a short stubby track beside a healthy one's long clean arc.

### 9.1 Faction colours must be generated, not listed

Factions are unbounded, so a fixed palette cannot work. Golden-angle hue walk
(`h = i × 137.508°`) keeps consecutive arrivals far apart on the wheel. Hues
landing near the water's own hue (202°) are **lifted in lightness rather than
skipped**, so the sequence stays deterministic in the faction index.

Only 2–3 factions are alive at once, so the constraint is far weaker than
"143 distinguishable colours" — it is "the three on screen must separate".

### 9.2 The gallery tile is a CAMERA, not a second world

A 0.25 m hull in an 8 m pool is 3 % of the width — roughly **8 px on a gallery
tile**. Six of those plus hairline wakes is mush.

**Resolved (owner, 2026-09-21): tile-specific composition, built as a camera.**
The tile renders a zoomed viewport onto the busiest part of the pool; the play
screen renders all of it. Same simulation, same physics, same numbers — hulls
read on a tile because they are magnified, not because they are different
boats.

⚠️ The tempting reading of "tile-specific composition" is a smaller pool with
fewer hulls, and that is a **second tuned world**: the wall margin is a multiple
of the turn circle, and the probe measures materially different outcomes across
its three pool sizes (§5.3's crowding law is exactly this). A second world
would need its own measured bounds and its own regression tests, forever. One
world, one camera.

## 10. 🎛️ Damage slows a hull

Engine spaces flood and the plant comes off the board. Speed falls with
condition on a curve **solved** to pass through an owner-named point — "by 20 %,
they are limping along":

```
s(h) = floor + (1 − floor) · h^p      p solved so s(0.2) = limpSpeed
```

```text
condition   speed of top    condition   speed of top
 100 %        100.0 %         20 %         25.0 %   ← the named point
  75 %         69.3 %         10 %         21.2 %
  50 %         44.8 %          0 %         19.5 %   ← floor
```

A **straight line cannot do this**, and that is why the shape is a curve: a line
is pinned at both ends, so dragging 20 % condition down to a limp drags the
zero-condition floor with it, straight into the speed below which the rudder
stops biting — and §6's defect returns in a different costume. The floor is
therefore **not a look choice**: it is `3 × WAY_FRACTION`, derived from the
stall threshold.

Measured visibility (375 lives): a hull lives 43 s and spends **5.8 s below
20 % HP** and 36 % of its life below half, so the limp is genuinely on screen.

**Cost, and it is real:** a slower ship is an easier turret target, so this is a
death spiral worth +12 % on the kill rate (measured across the tuning rounds).

## 11. 📐 Framework contract

- `kind: '2d'`, DPR-scaled, sim works in CSS pixels.
- Folder needs **both** `meta.ts` (eager identity) and `index.ts` (lazy impl);
  a folder with only `index.ts` silently vanishes from the gallery.
- One Zod schema is the single source of truth (config form + URL codec + type).
- Schema UX canon (#256): `Palette` colorList, `background` dark default,
  `Color` section, `Advanced` section collapsed, `seed` with
  `randomizeOnFreshLoad: true`.
- Live-editable knobs go through `update(state, config, size)`; structural ones
  (ship count, seed) return false and re-run `setup`.
- There is **no debounce** between a slider and `update()` — every intermediate
  value of a drag runs it.

### ⚠️ The one that will silently break everything

**The framework's `dt` and `t` are MILLISECONDS** (`useAnimationLoop.ts`, clamped
at 50 ms). The prototype's are **seconds**. Porting the fixed-step accumulator
without converting runs the piece **1000× too fast**, and nothing catches it:
pure-logic tests drive functions with literals and never call `frame()`, and the
smoke sweep only asserts that a draw happened.

The tempo knob must **integrate** (`clock += dt/1000 × tempo`), never multiply
the framework's `t` — `update()` applies live on every intermediate value of a
drag, so `t × tempo` teleports the whole field under the cursor.

### Naming

**Resolved (owner, 2026-09-21): `Pool Navy`, slug `pool-navy`.** Two-word
hyphenated slugs are already normal here (`soap-film`, `flock-vs-hunter`,
`parquet-deformation`).

## 12. ✅ What must be tested

Keystones, in priority order:

1. **Population invariant** — `afloat === 6` at every step of a long multi-seed
   run. This is the property that makes the piece endless.
2. **Faction schedule** — `factionForDeath` gives exactly three hulls per
   faction and never repeats or skips.
3. **No stall** — longest gap between sinkings is bounded across seeds.
4. **Wall pin** — stalled-ship fraction stays under a measured bound; this is a
   regression test for §6 and it must **mutation-check** (removing avoidance
   must fail it).
5. **Damage curve** — `s(0.2) === limpSpeed` exactly, and `s(0) > WAY_FRACTION`
   by the stated margin.
6. **Codec round-trip** and **seed determinism**, per the repo keystones.

⚠️ Every threshold in this spec was **measured off running probe code**, not
authored in prose. Thresholds added during implementation must be measured the
same way and then **mutation-checked** — a bound that no mutation can kill is
either a loose bound or, more often, the wrong metric.

## 13. 🚫 Non-goals

- Not player-driven. Nobody steers.
- Not smart AI. Captains stay naive by directive: nearest enemy, chase, kill. No
  intercept prediction, no kiting, no focusing a weak target, no retreating.
- No win condition, no banner, no restart. The piece does not end.
- No Box2D. `integrator.ts` applies the identical force model; walls and hull
  contact are ~40 lines.
- Not photoreal. No sprites, no water shader.
