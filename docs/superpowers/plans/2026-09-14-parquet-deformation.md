# Parquet Deformation Implementation Plan (#383)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship `src/diversions/parquet-deformation/` — a square lattice whose *edge curve* is a function of
position, so the tiling is quietly different everywhere and drifts slowly through its own catalogue forever.

**Architecture:** The tiling machinery collapses to one thing — an edge curve, a polyline from `(0,0)` to
`(1,0)` with a perpendicular offset. `curve.ts` owns the geometry (resample, interpolate, place an edge,
assemble a tile) and the parameter field. Three generators (`organic.ts`, `grid.ts`, `ifs.ts`) each produce a
**keyframe stack** — an array of curves from "straight" to "fully evolved". `render.ts` turns a stack plus a
config into pixels. `index.ts` wires them. Every generator is a pure function over numbers, so every guarantee
in the spec is testable with no canvas.

**Tech Stack:** Canvas 2D (`kind: '2d'`), Zod 4, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-parquet-deformation-design.md`

**Mockup (validated, owner-approved — it runs):** `docs/mockups/2026-09-14-parquet-deformation.html`
Captures: `2026-09-14-parquet-organic-amp17.jpeg` is the approved look. ⚠️ That capture was taken at
`span 7, size 110, amp 1.7, detail 30, palette 'Two-tone parquet'` — **not** at the mockup file's own
initial state (`span 11, size 86, detail 22, 'Ink on cream'`), which is what the file reads if opened cold.
Reviewer A flagged four defaults as unexplained drift from the capture; three of the four (`rampWidth 7`,
`detail 30`, the Slate/Two-tone palette) in fact match it. Only `tileSize` moved, 110 → 96, and it moves
back below.

---

## Revision 2 — 2026-09-14, after the plan panel

Two reviewers and a naysayer read the spec and Revision 1. **Fourteen must-fixes**, four of them defects
that no gate in this repo would have caught. Recorded here rather than silently patched, because several
overturn statements the spec still makes.

## Revision 5 — 2026-09-15, Task 0 and Task 1 EXECUTED

The document rounds were stopped after three without a clean one; the plan had become a 2,000-line
codebase that had never run, and the rate of defects introduced by its own fixes was rising. Tasks 0 and 1
were executed for real instead. Measurements, all from this machine:

**Task 1 — `curve.ts` + `curve.test.ts`, 32 tests green.** Both mutation checks bite, and the second one
settles an argument the panel could not:

```text
mutation                          result
--------------------------------  --------------------------------------------------
negate the reversed offset        19 of 32 fail — all 18 keystone cases + the
                                  placeEdge reversal test
read the TILE CENTRE, not the     vertical (shared by horizontal neighbours): 9/9 FAIL
edge midpoint                     horizontal (shared by vertical neighbours):
                                    Ramp PASSES, Radial + Diagonal FAIL
```

That second row is the whole justification for the two-axis keystone: **Ramp-horizontal — the only case
Revision 1 tested — survives the mutation completely.** The plan predicted this split; it is now measured
rather than asserted, and Revision 4b was right to stop stating it as fixed (it moved twice).

**Task 0 — the frame budget, and the assumption it was built on was wrong.**

Headless geometry, 1920x1080, `tileSize 34` (the slider's minimum, ~2,100 tiles/frame), two-generation
cache:

```text
field      mean     max      built/frame   cache
Ramp       3.29 ms  18.56    445           1,565 entries   ~8.0 MB
Radial     4.84 ms  14.34    515           2,028 entries  ~10.4 MB
Diagonal   2.01 ms   6.72    279             925 entries   ~4.7 MB
per-frame cache 15,920 builds over 10 frames vs cross-frame 2,040 — a 7.8x win
```

⚠️ **The two-generation swap is load-bearing for MEMORY, not just speed.** A first cut of the bench copied
the previous generation forward instead of promoting on hit, and Radial's cache reached **18,100 entries,
92.7 MB** for one diversion. Starting each generation empty bounds it at ~2x the visible tiles: **92.7 MB
-> 10.4 MB**. `npm run size` cannot see runtime heap, so nothing else would have caught that.

**And the ctx half — the half Task 0 was accused of assuming — measured against the running mockup:**

```text
config                   median   max      note
tile 110, fill + line      2.0 ms   2.1    the shipped default; 8x headroom
tile 34,  fill + line     14.5 ms  19.6    UNCACHED (the mockup rebuilds every tile)
tile 34,  fill only       14.5 ms  14.7
tile 34,  line only       14.6 ms   ~
```

**Fill-only, line-only and both cost the same.** So `ctx.fill('nonzero')` and `ctx.stroke()` of a
640-vertex self-intersecting polygon are *not* the bottleneck — **path construction is**, and that is
exactly what the outline cache eliminates. The round-2 objection that Task 0 "measures the half that was
never in doubt and assumes the half that is" was reasonable and is now falsified: it measured the right
half. The shipped renderer's 3.3 ms cached geometry plus a near-free ctx walk clears 16 ms at the worst
tile size, and the default has 8x headroom.

---

## Revision 3 — 2026-09-14, after panel round 2

Round 2 was **not clean**. Reviewer B reimplemented the plan's own code blocks and ran them rather than
reasoning about them, which is what caught most of this; Reviewer A and the naysayer independently found
the same two defects in the aperiodicity fix. **Four of the findings were hard test failures on code
Revision 2 had just written**, i.e. Tasks 1 and 2 would have gone red at their own "Expected: PASS" step
with a frozen implementation and no instruction for which side gives.

1. **`kneeIndex` did not compute what its own doc said, and worked by accident.** It was
   `findIndex(v >= max(L) * 0.99)` — "first stage within 1% of the peak". That returns 12 on the measured
   stack **only because that stack peaks at 12 and then declines**; on a stack that grows monotonically it
   returns the last stage, i.e. no knee at all, silently, with every test green. Verified both cases.
   Rewritten to a growth-rate test. Its test asserted `k > 2 && k < length - 4`, admitting **3 through 44** —
   two owner-approved numbers (the knee mapping, `rampWidth 14`) hang off this, so it now pins a band AND
   requires the knee to cut at least half the stack, which is what catches "no knee".
2. **The swing term destroyed the Ramp memo collapse, and the test certified it intact.** `paramAt` gained
   a `y·sinθ` term, so a column no longer shares one outline — except at `phase = 0`, which is exactly the
   state `createState` produces and the state the test rendered. Measured: 1 distinct index down a column
   at phase 0, **5-6 at phases 0.5, 2.0 and 7.3**. The cache is now cross-frame with `amplitude` and
   `tileSize` in the key, and the test asserts both truths.
3. **The swing does not do what Revision 2 claimed.** At any instant θ is constant, so the field is still a
   plane wave, merely rotated by ≤6.9° — the spatial period is unchanged at `2·span`. What actually removed
   the on-screen repeat was doubling `rampWidth` to 14 (1344 px → 3080 px). Every claim to the contrary is
   corrected, including the gallery entry. The rotation is also now about the view centre, not the lattice
   origin, or the aperiodicity would be zero along the top row and grow downward. The Radial branch used θ
   (radians) as a length scaled by `span`, which is incoherent and scaled with an unrelated knob; it is an
   anisotropy now.
4. **The organic step-clamp test failed unmutated.** Measured max per-keyframe displacement **0.11304**
   against a `CEILING` of 0.085 — because the comparison was between *resampled* keyframes, where a point
   slides along the curve as it lengthens. The clamp was working; the measurement was wrong. It now reads
   the simulation's own per-iteration step through a probe.
5. **The keystone's 3-entry test LUT made two tests meaningless.** All four of tile (3,4)'s midpoints
   bucket into the same bin, so the non-vacuity assertion **failed**, and Step 7's mutation was undetectable
   under Ramp and Radial while failing under Diagonal — the stated expectation was wrong in both
   directions. 64 entries; the corrected expectation is recorded.
6. **`ORGANIC_REP` became an unused import** when the probe replaced the ceiling derivation — the exact
   TS6133 failure Revision 2 fixed in `curve.test.ts`, relocated one file.
7. **The grid path was unbounded in x.** Measured `x ∈ [-1, 7]` against a 0..6 lattice on 2 of 4 seeds, so
   an edge overshot its own tiling vertices *along* the edge. Bounded and asserted.
8. **`GRID_REACH`'s doc called half a lattice unit "the tangency limit"** while `amplitude` multiplied
   straight past it for every scheme — 0.85 units at the shipped default. The comment was the thing that
   was wrong; corrected, with the overlap question routed to the now-explicit nonzero fill rule.
9. **`Task 0` was cited as the mitigation for an accepted risk and did not exist.** Written: it settles the
   frame budget headlessly before the renderer's shape freezes. The naysayer also showed one of Task 6's
   named fallback remedies — adaptive per-keyframe resampling — is structurally impossible, since
   `lerpCurve` requires equal lengths; that is now stated as a `Curve`-contract change, not a tweak.
10. **Both accepted-risk entries were rewritten.** The first answered only the 300px half of its objection
    and deferred the rest to an unexamined venue; the full-screen question is now answered on the record,
    including the honest cost. The second answered "which scheme is the default" rather than "how many
    ship"; the fidelity-to-a-paper argument is withdrawn and the real reason stated.
11. **Smaller:** the repulsion loop gained the four 90°-rotated copies it needed (a horizontal edge meets
    vertical edges in a 4⁴ tiling, and the sim modelled only translations); `update()` no longer rebuilds
    the 256-entry LUT on every colour pick and slider tick; `Math.round` dropped from the detail mapping,
    which quantised Detail to two outcomes under Fractal; the fractal default moved to a 4-segment rule so
    it has three generations rather than two; the segmented-options test reads meta through the framework's
    own accessor instead of a cast that may not compile; both benches loosened so they cannot flake CI;
    test counts corrected (30 / 12 / 16).

**Still accepted, unchanged:** the amplitude post-multiply's anisotropic scaling of the sim's clearance —
see the risk list, which now carries the arithmetic.

---

**Fixed in this revision:**

1. **`showWhen: { notEquals: … }` does not exist.** `fieldMeta.ts:29` declares only
   `equals: string | string[]`; `SchemaForm.tsx:70-75` reads only `.equals`. With `notEquals` the field has
   a truthy `showWhen` and `equals === undefined`, so `shown = (cur === undefined)` is **false in every
   scheme** — the Amplitude slider would have been invisible everywhere, including at its own default. The
   array form is supported and already used by `phyllotaxis/schema.ts:89`. Revision 1's "if it doesn't
   exist, drop the showWhen" fallback was a worse answer than the one that exists; deleted.
2. **Never `Path2D`.** `src/test-setup.ts` defines no `Path2D` and `diversionSmoke.test.ts` sweeps every
   diversion's `setup()` with **zero exemptions**, so Revision 1's renderer would have turned the whole
   gallery's smoke sweep red at Task 5. A per-file `vi.stubGlobal` cannot reach it — vitest isolates files.
   At least eight shipped diversions carry an explicit *"no Path2D — jsdom lacks it"* comment
   (`hyperbolic-tiling/render.ts:6`, `vines/render.ts:9`, `forest/render.ts:13`,
   `differential-growth/render.ts:68`, …). **The memo now caches the point array, not a path object** —
   which is what the approved mockup does — and the geometry-rebuild saving, the only part ever measured,
   is unchanged.
3. **`ui:'segmented'` discards `label`.** `Segmented.tsx:26` maps `{value,label} → o.value` and renders the
   value. Revision 1's buttons would have read `organic | grid | fractal` and `both | fill | line`.
   `fieldMeta.ts:9-12` says so outright — *"a value/label split there would be a lie"* — and zero of the 139
   diversions use the object form here. **No test catches it**: `diversionMeta.test.ts:223` normalises both
   forms before comparing to the enum. Fixed by making the enum values the display strings, per
   `ablation/schema.ts:13-15`. This changes the URL values and every `=== 'organic'` comparison, so it is
   fixed here rather than improvised during execution.
4. **`family` is replaced by three `showWhen`-gated enums.** The spec's `ui:'select'` with
   "options depend on scheme" is **unbuildable** — `meta.options` is static and nothing in `SchemaForm`
   repopulates a select from a sibling. Revision 1's int slider was worse: it renders a bare number (the
   viewer never sees "Wild"), and position 3 silently clamped onto position 2 under organic — the #319
   dead-slider-position failure verbatim. Now `organicFamily` / `gridVariant` / `fractalRule`, each a real
   enum with real names, each gated on `scheme`. Leaf names stay unique, so the codec is unaffected.
5. **The Detail slider was inert under Fractal, and `seed` did nothing there.** `ifsKeyframes(rule, 5)`
   returns at most 6 curves; `buildLut`'s `top = Math.min(stack.length - 1, detail)` is therefore 5 for all
   43 slider positions. `render.test.ts` could not see it — it parses the default config, which is organic.
   Fixed by capping `detail`'s effective range to the actual stack length per scheme and adding a per-scheme
   test that `buildLut(stack, min) ≠ buildLut(stack, max)`.
6. **IFS generations 4 and 5 cannot be represented at 160 points.** 'Puzzle bump' has 7 segments, so vertex
   counts run 2 → 8 → 50 → 344 → 2402 → 16808, all resampled to `CURVE_POINTS`. That is the exact chord-cut
   failure `curve.ts`'s own comment warns about. Revision 1's guard was also placed *after* the push, so it
   never prevented the 16,808-point generation, and its comment said 4096 where 7⁴ = 2401. Generations are
   now capped per rule by segment count.
7. **`reach` is dropped.** It was invented for this plan, never mocked, and its default of 3 sits exactly at
   the mockup's own hard bound (`Math.abs(p[1]) > N * 0.5`, i.e. 3 rows at `N = 6`) — the tile-tangency
   limit — with a slider top of 4 past it. Worse, the spec justified it by claiming a plain scale is wrong
   for `grid`, presented as measured; the mockup applies `S.amp` to **every** scheme (`edgeTo` is
   scheme-agnostic) and the owner approved `2026-09-14-parquet-grid-amp18.jpeg`, which is that. The
   observation that grid's keys lose their squareness under a scale is real and stays in the help text;
   the unmocked mechanism does not ship. **Amplitude covers all three schemes**, as mocked.
8. **The gap-free keystone tested the trivially-true axis.** It compared *vertical* neighbours under
   `ramp`, where `paramAt` depends on `x` alone — so both tiles share all four parameters and the test
   proved only the reversal bookkeeping that `placeEdge`'s own test already proves. Reviewer B verified the
   indices are correct and the curves non-trivial, so the case is kept; the **horizontal** neighbour case is
   added, and it is the one that fails if an edge reads the tile centre instead of its own midpoint.
   Parameterised over the amplitude slider's bounds, which the spec asked for and Revision 1 omitted.
9. **Two mutation checks that the mutation survives.** Task 3's deletion of the simple-path guard cannot
   fail "stays inside the declared reach" (a different, untouched line enforces that bound) nor "grows
   monotonically" (removing a check admits *more* moves). And Task 2's step-clamp test bounded the measured
   displacement by `ORGANIC_MAX_STEP * 12` — **the very constant under test** — so it scales with any
   mutation and can never fail. That is `feedback-test-must-not-reread-impl-variable` verbatim. Both
   rewritten to bound against absolute numbers, with `pushAround` exported so "an illegal move is rejected"
   is testable at all.
10. **"grows monotonically in arc length" is false by the algorithm's design.** `pushAround` accepts
    `on.length` of 3, which replaces 3 edges with 1 and *shortens* the path by 2 grid units — and that is
    the third of Kaplan's Figure 2 moves, which the spec requires. The test would pass or fail on the seed.
    Replaced with total growth plus the simple-path / pinned-endpoint assertions the spec actually asks for.
11. **`curve.test.ts` imported `lerpCurve` and never used it.** `noUnusedLocals` is on and
    `typecheck-on-edit` runs a project-wide `tsc -b` after every write, so Task 1 Step 4 would have reported
    a failure in `curve.ts` for a defect in its test. A real `lerpCurve` test is added instead of dropping
    the import — `buildLut` depends on it.
12. **`render.test.ts`'s "detail does NOT re-simulate" could not fail.** It assigned `st.lut` by hand rather
    than calling the code that decides whether to regenerate, so it passed against an implementation that
    re-simulates on every tick. Pointed at `update()` and at `structural()` directly.
13. **The count-guard narrative was wrong in both directions.** `diversion-count-guard.sh` fires on
    `docs/gallery.md` and the root `README.md` **as well as** `index.ts`, and compares folder count to entry
    count on each — so docs-first gives 139 folders vs 140 entries and index-first gives 140 vs 139. **Two
    exit-2s are unavoidable in either order.** It is also `PostToolUse`, so it cannot "block the write" as
    Revision 1 claimed. Rewritten to say plainly: expect the guard to report drift on the first two writes
    and go quiet on the third.
14. **Neither benchmark was runnable.** `npx tsx` is not a dependency (it would prompt for a network
    install) and the `node -e` fallback evaluates as CommonJS, where top-level `await` is a syntax error.
    Task 6's perf snippet assigned `t0` and `id`, read neither, returned nothing, and resolved before its
    120 frames elapsed. Both replaced with real commands and pass/fail thresholds. The spec's *"benchmark
    `reach` before shipping"* gate had no task at all; `reach` is gone, but `gridVariant` is still
    structural, so the gate moves to it.

**Accepted risks (the naysayer's objections that are NOT being fixed):**

- **"At 300px it reads as `abstractile`, and at full screen as `crystal`."** Round 2 rejected the first
  version of this entry for answering only the 300px half, and it was right: the rejection relocated the
  whole burden of distinctness to full screen and then said nothing about full screen. Both halves, then.
  **At 300px:** six tiles cannot exhibit a function, so the gallery tile shows an ornate two-tone
  tessellation. Accepted — `penrose`, `crystal` and `quasicrystal` are mutually indistinguishable at 300px
  too, and the tile is an invitation. **At full screen:** what a viewer sees is a lace tiling whose cell
  changes shape continuously across the frame, panning at ~32 px/s with a slow shear. That is not
  `crystal`, whose motif is a rigid isometric copy in every cell by definition — the entire content of the
  17 wallpaper groups is that the motif does not change. Here no two cells on screen are the same shape.
  What IS true, and is the honest cost: at any single instant the field is a plane wave, so the pattern is
  spatially periodic with a period of `2 × rampWidth × tileSize` px, and the motion is dominated by
  translation rather than by tiles evolving in place. At the shipped defaults that is **3080 px**, so it
  does not close on a 1920 screen. **But it is reachable on ordinary hardware from the piece's own
  sliders:** the period falls below 1920 px whenever `tileSize` drops under ~68 px at the default ramp
  width, and the slider's minimum is **34**, which gives 952 px — **three pixel-identical columns on a
  1920 screen**, matching checkerboard parity included. (An earlier draft located this on a 5K display
  instead, and got that wrong too: 5K at DPR 2 is 2560 CSS px, less than 3080, so it does not close there
  at all.) **That is the acceptance**, and it is a larger one than "a tile is only an invitation".
- **"Ship grid-keys only."** Objection: it is the scheme whose gradient reads, it deletes the O(n²) sim and
  the amplitude semantics, and its paths have ~30 vertices rather than 160. Round 2 rejected the first
  version of this entry on three counts, two of which land. (a) The owner call settles *which scheme is the
  default*, not *how many ship* — correct, and conceded. (b) "Kaplan's three schemes are the paper's
  contribution" is fidelity-to-a-paper reasoning, which this repo's porting ethos explicitly does not
  accept — also conceded. (c) "The perf half is folded in, see Task 0" was a reference to a task that did
  not exist — **Task 0 is now written**, and it settles the frame budget before the renderer's shape is
  frozen. So the honest rejection is narrower than the first one: three schemes ship because three
  *generators* are 300 lines of pure, separately-tested functions over numbers, they share one renderer and
  one schema, and the cost the objection prices — the O(n²) sim — is paid by the default scheme regardless
  of whether the other two exist. Cutting Fractal and Grid keys would save two test files and roughly 120
  lines, not the expensive part.
- **The organic self-avoidance is established at amplitude 1 and then multiplied by up to 2.0 at render
  time.** Round 2's objection 4, partly fixed and partly accepted. **Fixed:** the repulsion loop now
  includes the four 90°-rotated copies — the vertical edges a horizontal edge actually meets in a 4⁴ tiling
  — which it did not before, so the sim no longer grows through its perpendicular neighbour by
  construction. **Accepted:** `amplitude` remains a post-multiply in `placeEdge`, so the clearance the sim
  computes is scaled anisotropically (the `v` extent grows with the knob, the `u` positions do not), and at
  the shipped 1.7 the clamp of `|v| ≤ 0.48` reaches `±0.816`, i.e. 0.316 tile-widths past a neighbouring
  tile's centre line. Cheaper alternative: bound `amplitude` at ~1.04 so the reach can never exceed half a
  tile. Rejected because the owner drove the slider to 1.7 and approved what it renders, and because
  overlap here is not a tiling failure — the edges still match, so the tiling is still gap-free; it is an
  interlock, which is what Escher tilings look like. What it IS is a rendering question, which is why the
  fill rule is now specified rather than left to the default.
- **Nothing else from the naysayer is being accepted as a risk** — its remaining objections are either
  fixed above or escalated to the owner below.

**Decided by the lead, 2026-09-14, after the owner said "I have no idea" to both questions.** Putting
numbers to an owner in the abstract was the wrong move twice; both were resolved by building them into the
mockup and looking. Captures are indexed in `docs/mockups/README.md`.

- **Ramp mapping: to the knee, at `rampWidth 14`.** The organic stack is capped at the last stage that
  still adds arc length (auto-detected, 12 of 48 keyframes) so the ramp spans only the range that visibly
  changes. At the old `rampWidth 7` that compresses into alternating bands; at **14** it is the Huff read in
  the organic vocabulary — plain rounded octagons at one edge, progressively knotting through the middle,
  full lace at the other, and the field stays as rich as the capture the owner approved.
  Reference: `docs/mockups/2026-09-14-parquet-organic-knee-wide.jpeg`. The knee is *computed*, never a
  constant: hard-coding "12" would silently stop tracking if any organic force constant moved.
- **Drift: a full traverse in ~48 s.** The shipped constant is `DRIFT_RATE = 0.0021`, so at the default
  `drift 10` the phase advances **0.021 phase-units/s** — a traverse (Δφ = 1) in 47.6 s, and an exact loop
  absent the swing (Δφ = 2) in 95 s. An earlier draft of this bullet said "0.042 phase-units/s", which is
  double the shipped rate and inconsistent with the ~48 s in its own sentence; and it compared a Δφ = 2
  loop against a Δφ = 1 traverse to claim a 3.3× regression where like-for-like it is 1.7× (160 s → 95 s).
  Against the mockup's own default the traverse goes 21 s → 48 s, i.e. **2.3× slower**, which is "a bit";
  Revision 1's 7.7× was not. Something visibly changes within ~15 s and nothing ever hurries. **Set `DRIFT_RATE` so the
  default `drift` yields 0.042/s, and state the default in traverse-seconds in the help text, never in
  slider ticks.** This is still a tuning literal — it ships as the default and the owner may move it after
  seeing it run, which is the point at which it becomes theirs.
- **The 160 s exact loop is resolved by the above** only in the sense that it becomes ~48 s, i.e. worse.
  The real fix is structural and is now **in scope for Task 1**: `paramAt` takes a slow secondary term so
  the field never returns to a previous state. Cheapest form that does not disturb the gap-free guarantee —
  it is still a pure function of position and phase, so both tiles sharing an edge still agree — is a second
  incommensurate drift on the field's orientation. The naysayer is right that filing it does not fix a
  property of the shipped default.

**Escalated to the owner — decided above after "I have no idea", so nothing in this plan is blocked.**
What remains the owner's is the *verify*: all three numbers (knee mapping, `rampWidth 14`, ~48 s traverse)
ship as defaults and are re-judged in Task 6 against the running piece, where changing them is one line.

---

## Global Constraints

- Node 24. `npm test`, `npm run lint` (`--deny-warnings`), `npx tsc -b --noEmit`, `npm run build`,
  `npm run size`, `npm run check:pwa`, `npm run check:preload`, `npm run check:cache` must all pass.
- A diversion folder needs **both** `meta.ts` and `index.ts`, or it silently vanishes from the gallery with
  no type error and nothing thrown. `contract.test.ts` is the only thing that catches it.
- Tests co-located as `*.test.ts`. `erasableSyntaxOnly` **and** `verbatimModuleSyntax` are on: no `enum`, and
  type-only imports must say `import type`.
- **Write every `src/` file with the Write/Edit tools, never a shell heredoc or a script.** Five PostToolUse
  hooks (`test-on-edit`, `lint-on-edit`, `typecheck-on-edit`, `codec-keystone-guard`, `diversion-count-guard`)
  fire on `Edit|Write` only. A script-written file is invisible to all of them and the breakage surfaces
  later, out of context.
- `typecheck-on-edit` runs a project-wide `tsc -b` after **every** `src` write and exits 2 on failure — so
  write in dependency order, or the tree is red between writes.
- `codec-keystone-guard` matches `*/src/diversions/*/schema.ts` and, by basename, `presets.ts`. Writing
  either runs the full codec/preset sweep. Expect a pause; it is not a hang.
- **`diversion-count-guard` fires on `*/src/diversions/*/index.ts`, `docs/gallery.md` AND the root
  `README.md`, comparing the folder count to the entry count on each.** So during Task 5 it reports drift
  **whichever order you write in** — docs-first gives 139 folders vs 140 entries, index-first gives 140 vs
  139. **Two exit-2s are unavoidable; they are the transition, not a failure.** It is `PostToolUse`, so it
  cannot block a write — it only prints to stderr afterwards. It goes green on the third write.
- **Never `Path2D`.** `src/test-setup.ts` defines none and `diversionSmoke.test.ts` sweeps every
  diversion's `setup()` with zero exemptions, so one `new Path2D()` on the draw path turns the whole
  gallery's smoke sweep red. Eight shipped diversions carry the comment (`hyperbolic-tiling/render.ts:6`,
  `vines/render.ts:9`, `forest/render.ts:13`, `differential-growth/render.ts:68`, …). A per-file
  `vi.stubGlobal` cannot help: vitest isolates files. Draw with `beginPath`/`moveTo`/`lineTo`.
- **`ui:'segmented'` renders the option's VALUE, never a label.** `Segmented.tsx:26` maps
  `{value,label} → o.value`; `fieldMeta.ts:9-12` says a value/label split there "would be a lie", and zero
  of the 139 diversions use the object form. So a segmented enum's **values are the display strings** —
  `z.enum(['Organic', 'Grid keys', 'Fractal'])` with `options` mirroring them, per `ablation/schema.ts:13`.
  Those strings therefore travel in the URL and appear in every comparison and preset patch.
- **`showWhen` supports only `equals`, which may be a string OR an array** (`fieldMeta.ts:29`,
  `SchemaForm.tsx:70-75`; the array form is live in `phyllotaxis/schema.ts:89`). `notEquals` is silently
  ignored and hides the field in every state.
- The framework's `dt` and `t` are **milliseconds**, clamped at 50 ms (`useAnimationLoop.ts`). `t` is
  accumulated clamped dt, not wall clock.
- **There is no debounce anywhere between a slider and `update()`.** `Slider` uses the native `input` event
  and `ConfigScreen.update` runs synchronously, so every intermediate value of a drag runs the code.
- Owner-set against the running mockup, 2026-09-14, **not to be second-guessed**: default scheme is
  **Organic** and default amplitude **1.7**. A test that fails against those means the test is wrong.
  The drift default is **not** in this category — see Revision 2, which retracts an earlier framing of it
  as settled. It is a tuning literal expressed in traverse-seconds (~48 s), and the owner may move it.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `meta.ts` | `{id, title, description, kind}` — four strings, no imports. |
| `schema.ts` | The Zod schema. Single source of truth for form, codec and `Config` type. |
| `curve.ts` | Geometry + parameter field: `resample`, `lerpCurve`, `placeEdge`, `buildTilePath`, `triWave`, `paramAt`. No generators. |
| `organic.ts` | `organicKeyframes`, `kneeIndex` — Pedersen & Singh growth. The default scheme. |
| `grid.ts` | `gridKeyframes`, `pushAround` — Kaplan §3 rectilinear path pushing. |
| `ifs.ts` | `ifsKeyframes`, `IFS_RULES`, `maxGenerations` — Kaplan §4. |
| `presets.ts` | `deformationPresets`, `palettePresets`. |
| `render.ts` | `createState`, `rebuildStack`, `buildLut`, `structural`, `renderParquet`. |
| `index.ts` | `defineDiversion` wiring: `setup`/`frame`/`resize`/`update`. No `teardown` — nothing to free. |

Tests: `curve.test.ts`, `organic.test.ts`, `grid.test.ts`, `ifs.test.ts`, `render.test.ts`, `schema.test.ts`.

**TDD, red first, in every task** — including Task 4, which Revision 1 inverted for `schema.ts` and
`render.ts`. Note `test-on-edit.sh` runs only the *co-located sibling*, so writing `render.ts` before
`render.test.ts` makes that hook silently no-op on the write.

---

### Task 0: Settle the frame budget BEFORE the renderer's shape is frozen

The spec calls per-frame cost "the open perf question" and Revision 1 answered it last, after every line
of code was written. That is the trap: the honest remedies are all render-architecture changes, so a bad
answer at the end rewrites Task 4 with the owner waiting on a verify. This task answers it first, against
the one thing that genuinely gates the rest — `curve.ts` — and nothing downstream is designed until it has.

**Files:** create `curve.ts` (Task 1's version; this task only needs `buildTilePath` + `paramAt`), and a
throwaway `scratch/parquet-bench.test.ts` **outside** `src/diversions/` so it is deleted at the end.

- [ ] **Step 1: Write the bench**

It measures the thing that actually costs: building and walking tile outlines at the **bottom** of the
`tileSize` slider, which is where the worst case lives — 60 x 35 = **2,100 tiles** at 1920x1080, each 640
points, each both filled and stroked under the default render mode. Revision 1's estimate of "~200 tiles,
~128k points" was taken at the *default* tile size and understated the worst case by ~10x.

```ts
import { describe, it, expect } from 'vitest'
import { buildTilePath, paramAt, resample, CURVE_POINTS, type Curve } from '../src/diversions/parquet-deformation/curve'

const LUT: Curve[] = Array.from({ length: 256 }, (_, i) =>
  resample([[0, 0], [0.3, 0.2 * (i / 255)], [0.6, -0.15 * (i / 255)], [1, 0]], CURVE_POINTS))

function frame(w: number, h: number, s: number, field: 'Ramp' | 'Radial' | 'Diagonal', phase: number, cache: Map<string, Float32Array>) {
  const cols = Math.ceil(w / s) + 2, rows = Math.ceil(h / s) + 2
  const cx = cols / 2, cy = rows / 2
  const pts: number[] = []
  let built = 0, drawn = 0
  const q = (t: number) => Math.round(t * 255)
  for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
    const b = q(paramAt(field, i + 0.5, j, cx, cy, 14, phase))
    const r = q(paramAt(field, i + 1, j + 0.5, cx, cy, 14, phase))
    const t = q(paramAt(field, i + 0.5, j + 1, cx, cy, 14, phase))
    const l = q(paramAt(field, i, j + 0.5, cx, cy, 14, phase))
    const key = `${b},${r},${t},${l}`
    let o = cache.get(key)
    if (!o) {
      pts.length = 0
      buildTilePath(pts, 0, 0, [LUT[b], LUT[r], LUT[t], LUT[l]], 1.7)
      o = new Float32Array(pts.length)
      for (let k = 0; k < pts.length; k++) o[k] = pts[k] * s
      cache.set(key, o)
      built++
    }
    drawn += o.length / 2
  }
  return { built, drawn }
}

describe('parquet frame budget', () => {
  for (const field of ['Ramp', 'Radial', 'Diagonal'] as const) {
    it(`${field} at tileSize 34, 1920x1080`, () => {
      const cache = new Map<string, Float32Array>()
      let phase = 0.4
      const t0 = performance.now()
      const N = 30
      let last = { built: 0, drawn: 0 }
      let worst = 0
      for (let f = 0; f < N; f++) {
        const f0 = performance.now()
        last = frame(1920, 1080, 34, field, phase, cache)
        worst = Math.max(worst, performance.now() - f0)
        phase += 0.021 / 60
      }
      const ms = (performance.now() - t0) / N
      console.log(`${field}: mean ${ms.toFixed(2)} ms, MAX ${worst.toFixed(2)} ms, ${last.built} built on the last frame, ${last.drawn} points walked`)
      // Assert on the WORST frame, not the mean: frame 0 builds every outline
      // cold and 29 cheap frames hide it in an average, while the worst frame is
      // exactly what a cache generation-swap reproduces in flight.
      // The bar is loose because this file matches vitest's default include and
      // therefore runs in CI until Task 6 deletes it — same reasoning as the two
      // in-src benches. The real judgement is made from the logged figure.
      expect(worst).toBeLessThan(200)
    })
  }

  it('a PER-FRAME cache is measurably worse than a cross-frame one', () => {
    let perFrame = 0, crossFrame = 0
    let phase = 0.4
    for (let f = 0; f < 10; f++) { perFrame += frame(1920, 1080, 34, 'Ramp', phase, new Map()).built; phase += 0.021 / 60 }
    const shared = new Map<string, Float32Array>()
    phase = 0.4
    for (let f = 0; f < 10; f++) { crossFrame += frame(1920, 1080, 34, 'Ramp', phase, shared).built; phase += 0.021 / 60 }
    console.log(`outlines built over 10 frames — per-frame ${perFrame}, cross-frame ${crossFrame}`)
    expect(crossFrame).toBeLessThan(perFrame / 5)
  })
})
```

- [ ] **Step 2: Run it and record every number in the Revision log**

Run: `npx vitest run scratch/parquet-bench`

⚠️ **This bench measures geometry only — the half that was never in doubt.** The other half is ~1.34M
`lineTo`, 2,100 `fill('nonzero')` and 2,100 `stroke()` of a 640-vertex self-intersecting polygon per frame,
and nonzero-winding fill of a self-intersecting polygon is not cheap. Splitting a 16 ms budget between a
measured half and an assumed half is the Task 6 deferral wearing a lab coat.

- [ ] **Step 2b: Measure the ctx half against the mockup, which already runs**

`docs/mockups/2026-09-14-parquet-deformation.html` is a canvas implementation of this renderer. Open it in
Chrome at a maximised window, set `S.size = 34` and `S.scheme = 'organic'` via `evaluate_script`, and take
a `performance_start_trace` / `performance_stop_trace` over 5 s. Record scripting time per frame. That
answers the assumed half with the artefact the design came from, before a line of `src/` exists.

- [ ] **Step 3: Decide the render architecture from the measurement, not from a hunch**

- If geometry holds under 8 ms/frame for all three fields with the cross-frame cache: proceed, and Task 4's
  renderer is as written.
- If it does not: the fix is **not** lowering `CURVE_POINTS` (that reintroduces the chord-cutting the whole
  design guards against) and it is **not** "adaptive resample counts per keyframe" — `lerpCurve` requires
  `a.length === b.length` and `buildLut` lerps adjacent keyframes, so variable-length curves read past the
  end of the shorter array and `NaN` propagates through the entire render. Changing that means changing
  `Curve`'s contract, `lerpCurve`, `buildLut`, all three generators and `kneeIndex`. If it is needed, it is
  needed **now**, in this task, not at the end of the branch.
  The cheap levers in order: raise the `tileSize` minimum (it is a knob, not a contract); decimate collinear
  runs when writing the cached outline, which a rectilinear grid path benefits from enormously and costs
  nothing at draw time; only then touch `Curve`.

- [ ] **Step 4: Commit the decision, delete the scratch bench at the end of Task 6**

```bash
git add scratch/parquet-bench.test.ts docs/superpowers/plans/2026-09-14-parquet-deformation.md
git commit -m "parquet-deformation: settle the frame budget before the renderer"
```

---

### Task 1: Edge geometry, the aperiodic parameter field, and the gap-free keystone

**Files:** create `meta.ts`, `curve.ts`; test `curve.test.ts`.

**Interfaces — Produces:**
- `type Curve = Float32Array` (`2·N` values, `[u0,v0,…]`, `u` 0→1 along the edge); `CURVE_POINTS = 160`
- `resample(pts: number[][], n: number): Curve`
- `lerpCurve(a: Curve, b: Curve, s: number): Curve`
- `placeEdge(out: number[], ax, ay, bx, by, c: Curve, amp: number, rev: boolean): void`
- `buildTilePath(out: number[], i, j, edges: [Curve,Curve,Curve,Curve], amp: number): void`
- `triWave(u: number): number`
- `type FieldKind = 'Ramp' | 'Radial' | 'Diagonal'`
- `paramAt(kind: FieldKind, x, y, cx, cy, span: number, phase: number): number`
- `SWING`, `SWING_RATIO` (exported for the aperiodicity test)

- [ ] **Step 1: Write `meta.ts`**

```ts
import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'parquet-deformation',
  title: 'Parquet Deformation',
  description:
    "A field of tiles that is quietly not identical: the lattice is a plain grid of squares, but the shape of its edges is a function of where you are on the plane, so squares loosen into curling lace across the screen and back again. After William Huff's 1960s studio exercise, built on Craig Kaplan's curve-evolution schemes.",
  kind: '2d',
} as const satisfies DiversionMeta
```

- [ ] **Step 2: Write the failing test**

`curve.test.ts` — note every import below is used; `noUnusedLocals` is on and `typecheck-on-edit` runs a
project-wide `tsc -b` after each write, so an unused import reports as a failure in `curve.ts`.

```ts
import { describe, it, expect } from 'vitest'
import {
  CURVE_POINTS, SWING_RATIO, resample, lerpCurve, placeEdge, buildTilePath, triWave, paramAt,
  type Curve,
} from './curve'

const straight = (): Curve => resample([[0, 0], [1, 0]], CURVE_POINTS)
const bumpy = (): Curve => resample([[0, 0], [0.3, 0.2], [0.6, -0.15], [1, 0]], CURVE_POINTS)

describe('resample', () => {
  it('returns n points with the endpoints pinned', () => {
    const c = resample([[0, 0], [0.5, 0.4], [1, 0]], 32)
    expect(c.length).toBe(64)
    expect(c[0]).toBeCloseTo(0, 6); expect(c[1]).toBeCloseTo(0, 6)
    expect(c[62]).toBeCloseTo(1, 6); expect(c[63]).toBeCloseTo(0, 6)
  })
  it('spaces points by equal arc length', () => {
    const c = resample([[0, 0], [1, 0]], 5)
    for (let i = 0; i < 4; i++) expect(c[(i + 1) * 2] - c[i * 2]).toBeCloseTo(0.25, 6)
  })
})

describe('lerpCurve', () => {
  it('returns a at s=0, b at s=1, and the midpoint at s=0.5', () => {
    const a = straight(), b = bumpy()
    expect(Array.from(lerpCurve(a, b, 0))).toEqual(Array.from(a))
    expect(Array.from(lerpCurve(a, b, 1))).toEqual(Array.from(b))
    const m = lerpCurve(a, b, 0.5)
    for (let i = 0; i < a.length; i++) expect(m[i]).toBeCloseTo((a[i] + b[i]) / 2, 5)
  })
})

describe('triWave', () => {
  it('ping-pongs 0 to 1 to 0 with period 2 and no discontinuity', () => {
    expect(triWave(0)).toBeCloseTo(0, 6)
    expect(triWave(0.5)).toBeCloseTo(0.5, 6)
    expect(triWave(1)).toBeCloseTo(1, 6)
    expect(triWave(1.5)).toBeCloseTo(0.5, 6)
    expect(triWave(2)).toBeCloseTo(0, 6)
    expect(triWave(-0.25)).toBeCloseTo(0.25, 6)
  })
})

describe('paramAt', () => {
  // The whole point of the swing term: without it, advancing the phase by
  // triWave's period 2 returns the field to a previous state exactly, and a
  // screensaver meant to run for hours loops in well under a minute.
  it('does NOT repeat when the phase advances by triWave period', () => {
    // The threshold must exceed the RENDERING floor, not merely be non-zero:
    // t is quantised to 1/255 downstream, so a difference of 1e-4 is 39x below
    // anything a viewer could see and the test would pass on a bit-identical
    // picture. Sample away from y = 0, where the swing term vanishes entirely.
    const FLOOR = 2 / 255
    for (const y of [2, 6, 11]) {
      const a = paramAt('Ramp', 3.5, y, 4.5, 3, 14, 0.7)
      const b = paramAt('Ramp', 3.5, y, 4.5, 3, 14, 0.7 + 2)
      expect(Math.abs(a - b), `y=${y}`).toBeGreaterThan(FLOOR)
    }
  })

  // The rotation must be about the view centre, not the lattice origin, or the
  // aperiodicity is zero at the top of the screen and grows downward.
  it('swings about the view centre, so no row is a fixed point', () => {
    const at = (y: number, ph: number) => paramAt('Ramp', 3.5, y, 4.5, 3, 14, ph)
    expect(Math.abs(at(3, 0.7) - at(3, 2.7))).toBeGreaterThan(2 / 255)
  })
  it('the swing ratio is not a simple fraction, so the two periods never align', () => {
    for (let q = 1; q <= 12; q++) {
      expect(Math.abs(SWING_RATIO * q - Math.round(SWING_RATIO * q))).toBeGreaterThan(0.01)
    }
  })
  it('stays within 0..1 for every field and a wide phase sweep', () => {
    for (const k of ['Ramp', 'Radial', 'Diagonal'] as const) {
      for (let p = 0; p < 40; p += 0.37) {
        const v = paramAt(k, 17, -5, 4, 3, 14, p)
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('placeEdge', () => {
  it('reversed emits the same points in reverse order, offsets unchanged', () => {
    const c = bumpy(); const fwd: number[] = []; const rev: number[] = []
    placeEdge(fwd, 2, 3, 3, 3, c, 1, false)
    placeEdge(rev, 2, 3, 3, 3, c, 1, true)
    const n = fwd.length / 2
    for (let i = 0; i < n; i++) {
      expect(rev[i * 2]).toBeCloseTo(fwd[(n - 1 - i) * 2], 6)
      expect(rev[i * 2 + 1]).toBeCloseTo(fwd[(n - 1 - i) * 2 + 1], 6)
    }
  })
  it('starts at A and ends at B when forward', () => {
    const out: number[] = []
    placeEdge(out, 2, 3, 3, 3, bumpy(), 1.7, false)
    expect(out[0]).toBeCloseTo(2, 6); expect(out[1]).toBeCloseTo(3, 6)
    expect(out[out.length - 2]).toBeCloseTo(3, 6); expect(out[out.length - 1]).toBeCloseTo(3, 6)
  })
  it('amplitude scales the perpendicular offset and nothing else', () => {
    const a: number[] = []; const b: number[] = []
    placeEdge(a, 0, 0, 1, 0, bumpy(), 1, false)
    placeEdge(b, 0, 0, 1, 0, bumpy(), 2.5, false)
    for (let i = 0; i < a.length / 2; i++) {
      expect(b[i * 2]).toBeCloseTo(a[i * 2], 6)
      expect(b[i * 2 + 1]).toBeCloseTo(a[i * 2 + 1] * 2.5, 6)
    }
  })
})

describe('buildTilePath — the gap-free keystone', () => {
  // 64 entries, not 3. A 3-entry LUT buckets all of [0,1] into three bins, so
  // adjacent tiles resolve the SAME curve object whatever they read — which
  // makes the non-vacuity check below fail and makes the Step 7 mutation
  // undetectable under Ramp and Radial. Measured: at 3 entries all four of tile
  // (3,4)'s midpoints land in bin 2; at 64 they spread across 3.
  const LUT = Array.from({ length: 64 }, (_, i) => lerpCurve(straight(), bumpy(), i / 63))
  const idx = (t: number) => Math.round(t * (LUT.length - 1))
  const edgesFor = (k: 'Ramp' | 'Radial' | 'Diagonal', i: number, j: number, ph: number) =>
    [
      // cx = 4.5, not 4: see Step 7. An integer cx puts the mutation's two sample
      // tiles in mirror position about the Radial centre, where hypot is even and
      // the case becomes undetectable.
      LUT[idx(paramAt(k, i + 0.5, j, 4.5, 3, 7, ph))],
      LUT[idx(paramAt(k, i + 1, j + 0.5, 4.5, 3, 7, ph))],
      LUT[idx(paramAt(k, i + 0.5, j + 1, 4.5, 3, 7, ph))],
      LUT[idx(paramAt(k, i, j + 0.5, 4.5, 3, 7, ph))],
    ] as [Curve, Curve, Curve, Curve]
  const n = CURVE_POINTS

  // Vertical neighbours share their horizontal edge. NOTE under 'Ramp' this pair
  // is the WEAK case — paramAt has no y term there, so both tiles trivially share
  // all four parameters and only the traversal bookkeeping is under test. The
  // horizontal pair below is the one that fails if an edge reads the tile centre
  // instead of its own midpoint.
  const sharedHorizontal = (amp: number, k: 'Ramp' | 'Radial' | 'Diagonal', ph: number) => {
    const lower: number[] = []; const upper: number[] = []
    buildTilePath(lower, 3, 4, edgesFor(k, 3, 4, ph), amp)
    buildTilePath(upper, 3, 5, edgesFor(k, 3, 5, ph), amp)
    for (let i = 0; i < n; i++) {
      const lo = (2 * n + i) * 2   // lower tile, top run, emitted reversed
      const up = (n - 1 - i) * 2   // upper tile, bottom run, forward
      expect(lower[lo]).toBeCloseTo(upper[up], 5)
      expect(lower[lo + 1]).toBeCloseTo(upper[up + 1], 5)
    }
  }

  // Horizontal neighbours share their vertical edge, and under EVERY field the
  // two tiles compute four genuinely different parameters. This is the case the
  // "read t at the edge midpoint" rule exists for.
  const sharedVertical = (amp: number, k: 'Ramp' | 'Radial' | 'Diagonal', ph: number) => {
    const left: number[] = []; const right: number[] = []
    buildTilePath(left, 3, 4, edgesFor(k, 3, 4, ph), amp)
    buildTilePath(right, 4, 4, edgesFor(k, 4, 4, ph), amp)
    for (let i = 0; i < n; i++) {
      const l = (n + i) * 2              // left tile, right run, forward
      const r = (3 * n + (n - 1 - i)) * 2 // right tile, left run, emitted reversed
      expect(left[l]).toBeCloseTo(right[r], 5)
      expect(left[l + 1]).toBeCloseTo(right[r + 1], 5)
    }
  }

  // The spec asks for the guarantee at the slider's bounds, not just the default.
  for (const amp of [0.2, 1.7, 2.0]) {
    for (const k of ['Ramp', 'Radial', 'Diagonal'] as const) {
      it(`shared horizontal edge matches — ${k}, amp ${amp}`, () => sharedHorizontal(amp, k, 0.31))
      it(`shared vertical edge matches — ${k}, amp ${amp}`, () => sharedVertical(amp, k, 0.31))
    }
  }

  it('the parameters actually differ between horizontal neighbours (non-vacuity)', () => {
    const a = edgesFor('Ramp', 3, 4, 0.31)
    expect(new Set(a.map((c) => c[2 * 3 + 1])).size).toBeGreaterThan(1)
  })

  it('closes: the last point returns to the first', () => {
    const out: number[] = []
    buildTilePath(out, 0, 0, [bumpy(), bumpy(), bumpy(), bumpy()], 1.7)
    expect(out[out.length - 2]).toBeCloseTo(out[0], 5)
    expect(out[out.length - 1]).toBeCloseTo(out[1], 5)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/diversions/parquet-deformation`

Expected: **FAIL, but not on the import.** Task 0 already created `curve.ts` with `buildTilePath` and
`paramAt`, so the module resolves and its cases pass. The red bar here is the assertions Task 0 did not
need — `lerpCurve`, `triWave`, the swing tests, and the keystone. Add whatever Task 0 left out; do not
rewrite what it wrote.

- [ ] **Step 4: Write `curve.ts`**

```ts
/** An edge curve: 2·N values, [u0,v0,u1,v1,…]. `u` runs 0→1 along the edge,
 *  `v` is the perpendicular offset. Every edge in the tiling is one of these. */
export type Curve = Float32Array

/** Points per resampled curve. It must OUT-sample the most convoluted keyframe:
 *  at 96 the organic scheme's late curls got chords cut across them (measured in
 *  the mockup). Revisit only with a capture, never on a hunch. */
export const CURVE_POINTS = 160

/** Peak tilt of the parameter field's axis, in radians (~6.9°). */
export const SWING = 0.12
/** How fast the tilt oscillates relative to the phase. Deliberately not a simple
 *  fraction: triWave has period 2, so a rational ratio here would make the whole
 *  field periodic, and at the shipped drift that loop is ~48 s. */
export const SWING_RATIO = 0.2113
/** Lattice-space pivot for the Ramp/Diagonal swing. Constant, so the field is
 *  viewport-independent; offset far enough that no visible row sits on it. */
export const SWING_PIVOT_X = 0
export const SWING_PIVOT_Y = -18

export function resample(pts: number[][], n: number): Curve {
  const d = [0]
  for (let i = 1; i < pts.length; i++) {
    d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  }
  const total = d[d.length - 1] || 1
  const out = new Float32Array(n * 2)
  let j = 0
  for (let k = 0; k < n; k++) {
    const target = (k / (n - 1)) * total
    while (j < d.length - 2 && d[j + 1] < target) j++
    const seg = d[j + 1] - d[j] || 1
    const s = (target - d[j]) / seg
    out[k * 2] = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * s
    out[k * 2 + 1] = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * s
  }
  return out
}

export function lerpCurve(a: Curve, b: Curve, s: number): Curve {
  const out = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * s
  return out
}

/** 0→1→0, period 2. The triangle removes the seam a one-way ramp would leave,
 *  and it is Kaplan's own "tent" parameter space. */
export function triWave(u: number): number {
  const f = ((u % 2) + 2) % 2
  return f < 1 ? f : 2 - f
}

export type FieldKind = 'Ramp' | 'Radial' | 'Diagonal'

/**
 * The parameter field. Still a pure function of position and phase, so the two
 * tiles sharing an edge independently compute the identical value at its
 * midpoint — that is what makes the tiling gap-free by construction.
 *
 * The swing term tilts the field's axis on an incommensurate period, so the
 * picture never returns to an identical state: theta and the phase have no
 * common period, and the exact 95 s loop becomes a quasi-periodic wander whose
 * whole repertoire takes ~225 s to traverse.
 *
 * ⚠️ It does NOT remove the SPATIAL repeat, and nothing here should claim it
 * does. At any single instant theta is a constant, so this is still a plane wave
 * — just rotated by up to 6.9 degrees. Its spatial period is unchanged at 2·span
 * along the tilted axis. What fixed the visible repeat was doubling `rampWidth`
 * to 14: the horizontal period goes from 14·96 = 1344 px to 28·110 = 3080 px, so
 * a 1920 screen no longer shows a full period. Credit the span, not the swing.
 *
 * The tilt also has a second, unplanned benefit worth keeping: because t now
 * depends on y, adjacent tile ROWS sit ~2.2 LUT indices apart, so they step at
 * staggered times instead of a whole column snapping in unison. That disperses
 * the quantisation judder. It also destroys the Ramp column collapse the memo
 * used to rely on — see renderParquet, which caches across frames instead.
 */
export function paramAt(
  kind: FieldKind, x: number, y: number, cx: number, cy: number, span: number, phase: number,
): number {
  const s = span || 1
  const th = SWING * Math.sin(phase * SWING_RATIO * Math.PI)
  const co = Math.cos(th), si = Math.sin(th)
  let f: number
  // ⚠️ Ramp and Diagonal pivot on a LATTICE constant, not on the view centre.
  // Pivoting on (cx, cy) made the parameter field a function of the VIEWPORT —
  // and, through Math.ceil, a step function of it: the picture jumped ~9 LUT
  // indices per 110 px of width, a 1920 -> 1280 resize shifted a fifth of the
  // catalogue, the Config preview and the Play screen rendered different parts
  // of it from one URL, and `resize()`'s "no rebuild, no restart" comment became
  // false. That is the standing gotcha-viewport-independent-geometry-resize
  // failure. A lattice constant keeps every visible row well off the pivot (so
  // no row is a fixed point of the swing) and costs nothing.
  //
  // Radial legitimately uses cx/cy — rings belong centred on the view — and it
  // always did, so that is not a regression.
  const px = x - SWING_PIVOT_X, py = y - SWING_PIVOT_Y
  if (kind === 'Ramp') f = (px * co + py * si) / s
  else if (kind === 'Diagonal') f = (px * (co - si) + py * (si + co)) / (s * 1.35)
  // Radial has no axis to tilt. Rotating a ring field is the identity, so the
  // secondary term here is an ANISOTROPY: the rings breathe slightly elliptical
  // on the same incommensurate period. A phase-dependent centre offset (an
  // earlier draft) was worse than nothing — it is indistinguishable from panning
  // the camera, and its magnitude scaled with `span`, an unrelated knob.
  else {
    const e = 1 + th * 1.5
    f = Math.hypot((x - cx) / e, (y - cy) * e) / s
  }
  return triWave(f + phase)
}

/**
 * Place `c` along the edge A→B, appending 2·(c.length/2) numbers to `out`.
 *
 * ⚠️ A,B are always the edge's CANONICAL endpoints (left-to-right for a
 * horizontal edge, bottom-to-top for a vertical one). `rev` reverses only the
 * ORDER the points are emitted in — it does NOT negate the offset. Negating it
 * instead puts a straight chord across every tile, because the traversal then
 * starts at the wrong end. (Observed and fixed in the mockup.)
 */
export function placeEdge(
  out: number[], ax: number, ay: number, bx: number, by: number,
  c: Curve, amp: number, rev: boolean,
): void {
  const dx = bx - ax, dy = by - ay
  const n = c.length / 2
  for (let i = 0; i < n; i++) {
    const k = rev ? n - 1 - i : i
    const u = c[k * 2]
    const v = c[k * 2 + 1] * amp
    out.push(ax + u * dx - v * dy, ay + u * dy + v * dx)
  }
}

/**
 * Assemble tile (i,j) from its four edges, in order [bottom, right, top, left].
 * Bottom and right run forward; top and left are shared with the neighbour above
 * and to the left, so they are the SAME canonical placement, emitted reversed.
 */
export function buildTilePath(
  out: number[], i: number, j: number, edges: [Curve, Curve, Curve, Curve], amp: number,
): void {
  placeEdge(out, i, j, i + 1, j, edges[0], amp, false)
  placeEdge(out, i + 1, j, i + 1, j + 1, edges[1], amp, false)
  placeEdge(out, i, j + 1, i + 1, j + 1, edges[2], amp, true)
  placeEdge(out, i, j, i, j + 1, edges[3], amp, true)
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/diversions/parquet-deformation`
Expected: PASS, **31** tests (9 amp x field pairs x 2 axes = 18 keystone cases, plus 13 others).

- [ ] **Step 6: Mutation-check the keystone — a two-line edit**

In `placeEdge`, replace these two lines:
```ts
    const u = c[k * 2]
    const v = c[k * 2 + 1] * amp
```
with:
```ts
    const u = c[k * 2]
    const v = (rev ? -c[k * 2 + 1] : c[k * 2 + 1]) * amp
```
Run the suite. Expected: every `shared horizontal edge matches` and `shared vertical edge matches` case
FAILS. Revert.

- [ ] **Step 7: Mutation-check the midpoint rule — the reason the vertical pair exists**

In `curve.test.ts`'s `edgesFor`, change the four `paramAt` calls to all read the **tile centre**
(`i + 0.5, j + 0.5`).

**The invariant, which does not move:** all 9 `shared vertical edge` cases must FAIL. Horizontal
neighbours read genuinely different parameters under every field, so reading the tile centre must break
the shared vertical edge everywhere.

**Do not assert a specific pass/fail split for the horizontal cases — MEASURE it and record it.** That
split has moved twice already (once when the rotation pivot changed, once when it changed again), and a
stale one sent an executor chasing a phantom. `shared horizontal edge` under `Ramp` is expected to survive
the mutation, because Ramp barely varies in `y` — that surviving case is exactly why the vertical pair had
to be added at all.

⚠️ **One trap, measured:** `edgesFor` passes `cx = 4.5`, deliberately. At `cx = 4` the mutation's two
sample tiles (3,4) and (4,4) have centres at x = 3.5 and 4.5 — **mirror images about the centre** — and
`Math.hypot` is even in `px`, so Radial computes the *identical* value for both at any LUT size, at any
phase, forever, and that case can never detect the mutation. Any half-integer `cx` avoids it.

Revert.

- [ ] **Step 8: Commit**

```bash
git add src/diversions/parquet-deformation/
git commit -m "parquet-deformation: edge geometry, aperiodic field, gap-free keystone"
```

---

### Task 2: The organic generator and its saturation knee

**Files:** create `organic.ts`; test `organic.test.ts`.

**Interfaces — Produces:**
- `ORGANIC_REP = 0.075`, `ORGANIC_MAX_STEP = ORGANIC_REP * 0.18`, `ORGANIC_ITERS = 6` (all exported)
- `ORGANIC_FAMILIES: { name: 'Calm' | 'Restless' | 'Wild'; wobble: number }[]`
- `organicKeyframes(frames: number, wobble: number, seed: number): Curve[]`
- `kneeIndex(stack: Curve[]): number` — last stage that still adds arc length

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
// NOTE: ORGANIC_REP is deliberately NOT imported. It appears only in a comment
// below, and noUnusedLocals + typecheck-on-edit would fail the write of
// organic.ts for an unused import in its test file.
import {
  organicKeyframes, kneeIndex, ORGANIC_MAX_STEP, ORGANIC_ITERS, ORGANIC_FAMILIES,
} from './organic'
import { CURVE_POINTS, resample, type Curve } from './curve'

const arcLen = (c: Curve): number => {
  let s = 0
  for (let i = 1; i < c.length / 2; i++) {
    s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
  }
  return s
}

describe('organicKeyframes', () => {
  it('returns frames+1 curves, the first one straight', () => {
    const st = organicKeyframes(12, 0.006, 991)
    expect(st.length).toBe(13)
    expect(st[0].length).toBe(CURVE_POINTS * 2)
    for (let i = 0; i < CURVE_POINTS; i++) expect(Math.abs(st[0][i * 2 + 1])).toBeLessThan(0.02)
  })

  it('pins both endpoints in every keyframe — they are tiling vertices', () => {
    for (const c of organicKeyframes(20, 0.016, 7)) {
      expect(c[0]).toBeCloseTo(0, 4); expect(c[1]).toBeCloseTo(0, 4)
      expect(c[c.length - 2]).toBeCloseTo(1, 4); expect(c[c.length - 1]).toBeCloseTo(0, 4)
    }
  })

  it('convolutes — the curve ends up substantially longer than its chord', () => {
    // Threshold is deliberately loose: this asserts the sim DOES something, not
    // a tuned value. The exact figure is recorded in Step 6 after measurement;
    // if this fails, the implementation is wrong, not the number.
    expect(arcLen(organicKeyframes(30, 0.006, 991)[30])).toBeGreaterThan(2.0)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    expect(Array.from(organicKeyframes(10, 0.006, 42)[10]))
      .toEqual(Array.from(organicKeyframes(10, 0.006, 42)[10]))
    expect(Array.from(organicKeyframes(10, 0.006, 42)[10]))
      .not.toEqual(Array.from(organicKeyframes(10, 0.006, 43)[10]))
  })

  // The invariant whose violation turns curls into a spiky tangle: a point that
  // moves further than the repulsion radius in one iteration jumps clean through
  // whatever repels it and oscillates. Bounded by an ABSOLUTE number, not by the
  // constant under test — Revision 1 bounded it by ORGANIC_MAX_STEP * 12, which
  // scaled with any mutation and could never fail.
  it('never moves a simulation point further in one iteration than the clamp', () => {
    // Measured on the SIM, via the probe — not on resampled curves. A resampled
    // point slides along the curve as it lengthens, so a curve-to-curve distance
    // is bounded by nothing the clamp controls and would go red on correct code.
    const probe = { maxStep: 0 }
    organicKeyframes(24, 0.016, 5, probe)   // Wild: the fastest-growing family
    expect(probe.maxStep).toBeLessThanOrEqual(ORGANIC_MAX_STEP + 1e-9)
    expect(probe.maxStep).toBeGreaterThan(ORGANIC_MAX_STEP * 0.5) // non-vacuous: the clamp BINDS
    expect(ORGANIC_ITERS * ORGANIC_MAX_STEP).toBeLessThan(0.085)
  })

  it('ships three named families', () => {
    expect(ORGANIC_FAMILIES.map((f) => f.name)).toEqual(['Calm', 'Restless', 'Wild'])
  })
})

describe('kneeIndex', () => {
  // ⚠️ THE NUMBER IS PINNED, not bounded. Two owner-approved decisions rest on
  // the knee landing near 12 of 48 — the "To the knee" ramp mapping and
  // rampWidth 14, which was chosen against a 12-stage span. An earlier draft
  // asserted only `k > 2 && k < length - 4`, which admits 3 through 44: a knee
  // of 40 would have left every test green and the shipped default look
  // unrecognisable, traceable to no single constant.
  it('lands where the measured saturation is, and actually cuts the stack', () => {
    const st = organicKeyframes(48, 0.006, 991)
    const k = kneeIndex(st)
    // Measured in the mockup: arc length peaks at stage 11-12 of 48. The band is
    // loose because this is a port and the constants may land slightly
    // differently — but it MUST cut at least half the stack, which is what
    // catches the real failure mode: a knee of 47, i.e. no knee at all.
    expect(k).toBeGreaterThanOrEqual(4)
    expect(k).toBeLessThanOrEqual(24)
    expect(k).toBeLessThan((st.length - 1) / 2)
  })

  // The knee must not wander with the seed: `seed` is randomizeOnFreshLoad, so a
  // knee that moves with it moves the shipped look on every visit.
  it('is stable across seeds and families, not just in range', () => {
    const ks: number[] = []
    for (const wobble of [0.0015, 0.006, 0.016]) {
      for (const seed of [991, 7, 20260914, 42, 5150, 77, 2024, 99991]) {
        const k = kneeIndex(organicKeyframes(48, wobble, seed))
        expect(k, `wobble ${wobble} seed ${seed}`).toBeGreaterThanOrEqual(4)
        expect(k, `wobble ${wobble} seed ${seed}`).toBeLessThanOrEqual(24)
        ks.push(k)
      }
    }
    expect(Math.max(...ks) - Math.min(...ks), `knee spread ${Math.min(...ks)}..${Math.max(...ks)}`)
      .toBeLessThanOrEqual(8)
  })

  // The knee must be a property of the GROWTH CURVE, not of the stack ending.
  // A monotone stack is exactly the case the previous peak-ratio form got wrong.
  it('finds a knee in a synthetic stack that grows then plateaus', () => {
    const fake = (lens: number[]): Curve[] =>
      lens.map((L) => resample([[0, 0], [0.5, Math.sqrt(Math.max(0, (L * L - 1)) / 4)], [1, 0]], CURVE_POINTS))
    // fast growth for 5 stages, then flat
    const k = kneeIndex(fake([1, 1.6, 2.2, 2.8, 3.3, 3.6, 3.62, 3.63, 3.64, 3.65, 3.66, 3.67]))
    expect(k).toBeLessThanOrEqual(7)
  })

  it('does not re-read the implementation\'s own threshold', () => {
    // Asserted against an absolute shape claim, not against a constant lifted
    // out of kneeIndex — the failure mode fixed twice elsewhere in this plan.
    const st = organicKeyframes(48, 0.006, 991)
    const k = kneeIndex(st)
    expect(arcLen(st[k])).toBeGreaterThan(arcLen(st[0]) * 2)
  })

  it('never returns an index that would collapse the LUT', () => {
    expect(kneeIndex([organicKeyframes(2, 0.006, 1)[0]])).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/diversions/parquet-deformation/organic`
Expected: FAIL — cannot resolve `./organic`.

- [ ] **Step 3: Write `organic.ts`**

```ts
import { resample, CURVE_POINTS, type Curve } from './curve'

/** Repulsion radius, in edge-length units. */
export const ORGANIC_REP = 0.075
/**
 * Hard cap on how far one point moves in one iteration.
 *
 * ⚠️ This is an invariant, not a tuning value. At step·force > ORGANIC_REP a
 * point jumps clean through the neighbour repelling it and oscillates, and the
 * result is a spiky self-crossing tangle rather than curls. Measured in the
 * mockup; guarded by organic.test.ts against an absolute ceiling.
 */
export const ORGANIC_MAX_STEP = ORGANIC_REP * 0.18
/** Iterations per emitted keyframe. Exported so the test can bound a keyframe's
 *  total displacement without re-reading the constant it is testing. */
export const ORGANIC_ITERS = 6

const MAX_SEG = 0.045
const MAX_PTS = 130
const SKIP = 3

/**
 * The copies of this edge that surround it in the tiling: [dx, dy, rotated].
 * The first is the curve itself; the next four are its translations one lattice
 * step away; the last four are the 90-degree-rotated copies sitting on the
 * vertical edges at each endpoint. Omitting those four was a real gap — see the
 * repulsion loop.
 */
const NEIGHBOURS: [number, number, 0 | 1][] = [
  [0, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0],
  // ⚠️ The rotated bases are (0,0), (1,0), (0,-1), (1,-1) — two vertical edges
  // ABOVE the line at each endpoint and two BELOW. An earlier draft shipped
  // (0,1) and (1,1) instead of the two below: a copy based at y=+1 sits at
  // jy = 1 + u in [1,2], and the reference curve is clamped to |v| <= 0.48, so
  // |dy| >= 0.52 against a repulsion radius of 0.075 — it can never contribute a
  // single force. That left the sim repelled from above and not below, i.e. an
  // ASYMMETRIC field biasing the curve downward near both endpoints.
  [0, 0, 1], [1, 0, 1], [0, -1, 1], [1, -1, 1],
]

export const ORGANIC_FAMILIES: { name: 'Calm' | 'Restless' | 'Wild'; wobble: number }[] = [
  { name: 'Calm', wobble: 0.0015 },
  { name: 'Restless', wobble: 0.006 },
  { name: 'Wild', wobble: 0.016 },
]

/**
 * Pedersen & Singh organic growth on one tile edge, with both endpoints pinned
 * (they are tiling vertices). Kaplan §5: snapshot every few iterations and use
 * the snapshots as keyframes — the sim is smooth enough that no interpolation
 * between them is needed.
 */
export function organicKeyframes(
  frames: number, wobble: number, seed: number, probe?: { maxStep: number },
): Curve[] {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5)

  // A perfectly straight line is an equilibrium — with nothing to buckle out of,
  // growth does nothing. Seed a small perturbation, enveloped to zero at both
  // pinned ends. Brownian noise stays tiny after this: what convolutes the curve
  // is growth against repulsion, not noise.
  const pts: number[][] = []
  const n0 = 20
  for (let i = 0; i <= n0; i++) {
    const u = i / n0
    const env = Math.sin(Math.PI * u)
    pts.push([u, env * (Math.sin(u * 9.1 + (seed % 7)) * 0.012 + rnd() * 0.006)])
  }

  const stack: Curve[] = [resample(pts, CURVE_POINTS)]
  for (let f = 0; f < frames; f++) {
    for (let it = 0; it < ORGANIC_ITERS; it++) {
      const fx = new Float64Array(pts.length)
      const fy = new Float64Array(pts.length)
      for (let i = 1; i < pts.length - 1; i++) {
        const p = pts[i], a = pts[i - 1], b = pts[i + 1]
        fx[i] += ((a[0] + b[0]) / 2 - p[0]) * 0.85
        fy[i] += ((a[1] + b[1]) / 2 - p[1]) * 0.85
        fx[i] += rnd() * wobble
        fy[i] += rnd() * wobble
      }
      // Repulsion against this curve AND the copies of it that actually surround
      // it in the tiling. Five pure TRANSLATIONS are not enough: in a 4^4 tiling
      // the edges a horizontal edge meets are the four VERTICAL edges at its two
      // endpoints, which are this same curve rotated 90 degrees. A sim blind to
      // those grows straight through its perpendicular neighbour by construction
      // — visible in the approved capture as lace crossing a neighbouring tile's
      // interior. NEIGHBOURS lists both: [dx, dy, rotated].
      for (let i = 1; i < pts.length - 1; i++) {
        for (let j = 0; j < pts.length; j++) {
          for (let o = 0; o < NEIGHBOURS.length; o++) {
            const [ox, oy, rot] = NEIGHBOURS[o]
            // SKIP exists to stop a point repelling its own immediate neighbours
            // ALONG THIS CURVE, where it would fight the smoothing term. It is
            // meaningless for any other copy: point i of the reference and point
            // j of a rotated or translated copy are distinct points in space
            // even when i === j. Guarding on |i-j| for every copy — as an
            // earlier draft did, with the correct guard written below it as
            // unreachable dead code — skipped a whole diagonal band of the
            // interaction matrix, including the near-vertex approaches that are
            // exactly where a horizontal edge meets its perpendicular neighbour.
            if (ox === 0 && oy === 0 && rot === 0 && Math.abs(i - j) < SKIP) continue
            // A rotated copy runs bottom-to-top: (u,v) -> (-v, u).
            const jx = rot ? -pts[j][1] + ox : pts[j][0] + ox
            const jy = rot ? pts[j][0] + oy : pts[j][1] + oy
            const dx = pts[i][0] - jx
            const dy = pts[i][1] - jy
            const d2 = dx * dx + dy * dy
            if (d2 > 1e-10 && d2 < ORGANIC_REP * ORGANIC_REP) {
              const d = Math.sqrt(d2)
              const w = (ORGANIC_REP - d) / ORGANIC_REP
              fx[i] += (dx / d) * w
              fy[i] += (dy / d) * w
            }
          }
        }
      }
      for (let i = 1; i < pts.length - 1; i++) {
        let mx = fx[i] * 0.08
        let my = fy[i] * 0.08
        const m = Math.hypot(mx, my)
        if (m > ORGANIC_MAX_STEP) { mx = (mx / m) * ORGANIC_MAX_STEP; my = (my / m) * ORGANIC_MAX_STEP }
        // The clamp's invariant is about SIMULATION points. Comparing resampled
        // curves instead cannot see it: resample redistributes by arc length, so
        // point i slides along the curve as it grows and the measurement mixes
        // real motion with that slide. Report the true maximum for the test.
        if (probe) probe.maxStep = Math.max(probe.maxStep, Math.hypot(mx, my))
        pts[i][0] += mx
        pts[i][1] += my
        if (pts[i][1] > 0.48) pts[i][1] = 0.48
        if (pts[i][1] < -0.48) pts[i][1] = -0.48
      }
      for (let i = pts.length - 2; i >= 0; i--) {
        const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        if (d > MAX_SEG && pts.length < MAX_PTS) {
          pts.splice(i + 1, 0, [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2])
        }
      }
    }
    stack.push(resample(pts, CURVE_POINTS))
  }
  return stack
}

/**
 * The saturation knee: the last stage whose arc length is still growing at a
 * useful rate, expressed as a fraction of the stack's own fastest growth.
 *
 * The sim keeps running long after it stops changing SHAPE — measured on the
 * mockup's generator, arc length runs 1.00 -> 2.81 -> 3.93 at stage 12 and then
 * slowly DECLINES to 3.53 by stage 48, with mean per-stage point movement ~8x
 * lower after stage 24. Mapping the ramp over the whole stack therefore spends
 * most of the screen on tiles a viewer cannot tell apart.
 *
 * ⚠️ An earlier draft used `L.findIndex(v => v >= max(L) * 0.99)`. That returned
 * 12 on the measured data ONLY because that stack peaks and then declines — on a
 * stack that grows monotonically it returns the LAST stage, i.e. no knee at all,
 * silently, with every test still green. The growth-rate form below is what the
 * doc always claimed and does not depend on non-monotonicity.
 */
export function kneeIndex(stack: Curve[]): number {
  if (stack.length < 4) return stack.length - 1
  const len = (c: Curve): number => {
    let s = 0
    for (let i = 1; i < c.length / 2; i++) {
      s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
    }
    return s
  }
  const L = stack.map(len)
  const d: number[] = []
  for (let i = 1; i < L.length; i++) d.push(L[i] - L[i - 1])
  const fastest = Math.max(...d)
  if (fastest <= 0) return stack.length - 1
  // Walk forward while a stage still contributes at least 8% of the fastest
  // stage's growth. Falling off that is the knee; everything past it is plateau.
  // Require TWO consecutive sub-threshold stages. `d` is the increment series of
  // a stochastic sim — a rnd()*wobble force on every point, plus point insertion
  // that fires in bursts and stops dead at MAX_PTS — so it is spiky, and a
  // first-crossing walk lets one unlucky stage at 7% become the knee. That
  // matters more than it looks: `seed` is randomizeOnFreshLoad, so the knee, and
  // with it how much of the catalogue a viewer sees across the screen, would
  // become a per-visit random variable.
  let k = 1
  while (k + 1 < d.length && !(d[k] < fastest * 0.08 && d[k + 1] < fastest * 0.08)) k++
  return Math.min(stack.length - 1, Math.max(2, k))
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/diversions/parquet-deformation/organic`
Expected: PASS, 11 tests. **Record the measured knee index in the Revision log.** If it lands outside [4, 24],
do not widen the band silently — record the value, look at the arc-length series, and decide whether the
growth-rate threshold (0.08) or the port is wrong. Two owner-approved numbers hang off this.

⚠️ **Expect ~9, not the 11-12 this plan's prose quotes.** The mockup's 11-12 was measured BEFORE the
rotated repulsion copies were added; with them the growth series changes and the knee moves in. That is a
**25% narrower ramp span than `rampWidth 14` was chosen against**, so the two numbers are quietly out of
step and Task 6's Chrome verify is where that gets settled — by looking, not by arithmetic. Say which one
moved in the Revision log.

- [ ] **Step 5: Mutation-check the step clamp — delete it, do not re-tune it**

In `organic.ts`, delete the clamp line:
```ts
        if (m > ORGANIC_MAX_STEP) { mx = (mx / m) * ORGANIC_MAX_STEP; my = (my / m) * ORGANIC_MAX_STEP }
```
Expected: `never moves a simulation point further in one iteration than the clamp` FAILS on
`expect(probe.maxStep).toBeLessThanOrEqual(...)`. Revert.
**Do not mutate by raising `ORGANIC_MAX_STEP`** — that loosens the bound and moves the test further from
failing, which is the trap Revision 1 fell into.

- [ ] **Step 6: Benchmark it, with a real command and a threshold**

Create `src/diversions/parquet-deformation/organic.bench.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { organicKeyframes } from './organic'

describe('organic generator cost', () => {
  it('builds a full stack inside the interaction budget', () => {
    const t0 = performance.now()
    organicKeyframes(48, 0.006, 1)
    const ms = performance.now() - t0
    console.log(`organicKeyframes(48) = ${ms.toFixed(1)} ms`)
    // Measured ~75 ms on a dev machine. The assertion is deliberately FAR looser
    // than the real budget: this file matches vitest's default include, so it
    // runs on every CI job, and a tight wall-clock expect on a contended shared
    // runner is a flake generator (gotcha-ci-test-timeout-hot-loop-expect). Its
    // job is to catch an algorithmic regression, not to police the budget — the
    // budget is judged from the logged figure during the task.
    expect(ms).toBeLessThan(1500)
  })
})
```

Run: `npx vitest run src/diversions/parquet-deformation/organic.bench`
Expected: PASS, with the measured figure printed. **Record it in Revision 3.** If it fails, cut `MAX_PTS`
and re-measure — do not add a debounce, and do not raise the threshold.

- [ ] **Step 7: Commit**

```bash
git add src/diversions/parquet-deformation/organic.ts src/diversions/parquet-deformation/organic.test.ts src/diversions/parquet-deformation/organic.bench.test.ts
git commit -m "parquet-deformation: organic edge growth, clamped step, computed knee"
```

---

### Task 3: The grid and fractal generators

**Files:** create `grid.ts`, `ifs.ts`; test `grid.test.ts`, `ifs.test.ts`.

**Interfaces — Produces:**
- `GRID_SUBDIV = 6`, `GRID_REACH = 3`
- `type GridPoint = [number, number]`
- `pushAround(path: GridPoint[], cell: GridPoint): GridPoint[] | null` — **exported for testing**
- `gridPaths(steps: number, seed: number): GridPoint[][]` — grid-space stages, **exported for testing**
- `gridKeyframes(steps: number, seed: number): Curve[]`
- `IFS_RULES: { name: string; rule: number[][] }[]`
- `maxGenerations(rule: number[][]): number`
- `ifsKeyframes(rule: number[][], gens: number): Curve[]`

- [ ] **Step 1: Write `grid.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { gridKeyframes, gridPaths, pushAround, GRID_SUBDIV, GRID_REACH } from './grid'
import { CURVE_POINTS, type Curve } from './curve'

const arcLen = (c: Curve): number => {
  let s = 0
  for (let i = 1; i < c.length / 2; i++) {
    s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
  }
  return s
}

describe('pushAround — legality', () => {
  const straight = (): [number, number][] => {
    const p: [number, number][] = []
    for (let i = 0; i <= GRID_SUBDIV; i++) p.push([i, 0])
    return p
  }

  it('rejects a cell that touches no edge of the path', () => {
    expect(pushAround(straight(), [2, 4])).toBeNull()
  })

  it('rejects a move that would exceed the reach', () => {
    // Walk a path up to the bound, then try to push past it.
    let path = straight()
    for (let k = 0; k < GRID_REACH; k++) {
      const next = pushAround(path, [2, k])
      if (!next) break
      path = next
    }
    const beyond = pushAround(path, [2, GRID_REACH])
    if (beyond) for (const p of beyond) expect(Math.abs(p[1])).toBeLessThanOrEqual(GRID_REACH)
  })

  it('a legal push returns a SIMPLE path with the endpoints still pinned', () => {
    const next = pushAround(straight(), [2, 0])
    expect(next).not.toBeNull()
    const seen = new Set<string>()
    for (const p of next!) {
      const k = `${p[0]},${p[1]}`
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    expect(next![0]).toEqual([0, 0])
    expect(next![next!.length - 1]).toEqual([GRID_SUBDIV, 0])
  })
})

describe('gridPaths — every stage stays legal', () => {
  for (const seed of [1013, 77, 2024, 99991]) {
    it(`simple, pinned and bounded for seed ${seed}`, () => {
      for (const path of gridPaths(30, seed)) {
        const seen = new Set<string>()
        for (const p of path) {
          const k = `${p[0]},${p[1]}`
          expect(seen.has(k)).toBe(false)   // the path must never touch itself
          seen.add(k)
          expect(Math.abs(p[1])).toBeLessThanOrEqual(GRID_REACH)
          expect(p[0]).toBeGreaterThanOrEqual(0)          // no overshoot along the edge
          expect(p[0]).toBeLessThanOrEqual(GRID_SUBDIV)
        }
        expect(path[0]).toEqual([0, 0])
        expect(path[path.length - 1]).toEqual([GRID_SUBDIV, 0])
        // consecutive points are unit grid steps
        for (let i = 1; i < path.length; i++) {
          const d = Math.abs(path[i][0] - path[i - 1][0]) + Math.abs(path[i][1] - path[i - 1][1])
          expect(d).toBe(1)
        }
      }
    })
  }
})

describe('gridKeyframes', () => {
  it('starts straight, pins the endpoints, resamples to CURVE_POINTS', () => {
    for (const c of gridKeyframes(20, 1013)) {
      expect(c.length).toBe(CURVE_POINTS * 2)
      expect(c[0]).toBeCloseTo(0, 5); expect(c[1]).toBeCloseTo(0, 5)
      expect(c[c.length - 2]).toBeCloseTo(1, 5); expect(c[c.length - 1]).toBeCloseTo(0, 5)
    }
  })

  // NOT monotone per step: pushAround accepts on.length of 3, which replaces 3
  // edges with 1 and SHORTENS the path by 2 grid units — and that is the third
  // of Kaplan's Figure 2 moves, so it is required. Assert total growth only.
  it('is substantially longer at the end of the stack than at the start', () => {
    const st = gridKeyframes(24, 2024)
    expect(arcLen(st[st.length - 1])).toBeGreaterThan(arcLen(st[0]) * 1.5)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    expect(Array.from(gridKeyframes(12, 9)[12])).toEqual(Array.from(gridKeyframes(12, 9)[12]))
    expect(Array.from(gridKeyframes(12, 9)[12])).not.toEqual(Array.from(gridKeyframes(12, 10)[12]))
  })
})
```

- [ ] **Step 2: Write `ifs.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { ifsKeyframes, maxGenerations, IFS_RULES } from './ifs'
import { CURVE_POINTS } from './curve'

describe('IFS_RULES', () => {
  it('every rule runs from (0,0) to (1,0)', () => {
    for (const { rule } of IFS_RULES) {
      expect(rule[0]).toEqual([0, 0])
      expect(rule[rule.length - 1]).toEqual([1, 0])
    }
  })

  // CURVE_POINTS must OUT-sample the finest keyframe or resampling cuts chords
  // across the very detail the generation added. 'Puzzle bump' has 7 segments,
  // so vertex counts run 2, 8, 50, 344, 2402, 16808 — generations 4 and 5 are
  // unrepresentable at 160 points and render as a scribble.
  it('caps generations so the finest keyframe fits in CURVE_POINTS', () => {
    for (const { rule } of IFS_RULES) {
      const segs = rule.length - 1
      const g = maxGenerations(rule)
      expect(g).toBeGreaterThanOrEqual(1)
      expect(Math.pow(segs, g) + 1).toBeLessThanOrEqual(CURVE_POINTS)
      expect(Math.pow(segs, g + 1) + 1).toBeGreaterThan(CURVE_POINTS)
    }
  })
})

describe('ifsKeyframes', () => {
  it('generation 0 is the straight edge', () => {
    const st = ifsKeyframes(IFS_RULES[0].rule, 3)
    for (let i = 0; i < CURVE_POINTS; i++) expect(st[0][i * 2 + 1]).toBeCloseTo(0, 5)
  })

  it('returns gens+1 keyframes with endpoints pinned', () => {
    const st = ifsKeyframes(IFS_RULES[1].rule, maxGenerations(IFS_RULES[1].rule))
    expect(st.length).toBe(maxGenerations(IFS_RULES[1].rule) + 1)
    for (const c of st) {
      expect(c[0]).toBeCloseTo(0, 5)
      expect(c[c.length - 2]).toBeCloseTo(1, 5)
      expect(c[c.length - 1]).toBeCloseTo(0, 5)
    }
  })

  it('each generation is strictly longer than the last', () => {
    const len = (c: Float32Array) => {
      let s = 0
      for (let i = 1; i < c.length / 2; i++) {
        s += Math.hypot(c[i * 2] - c[(i - 1) * 2], c[i * 2 + 1] - c[(i - 1) * 2 + 1])
      }
      return s
    }
    const st = ifsKeyframes(IFS_RULES[0].rule, maxGenerations(IFS_RULES[0].rule))
    for (let i = 1; i < st.length; i++) expect(len(st[i])).toBeGreaterThan(len(st[i - 1]))
  })

  it('is deterministic — no randomness anywhere', () => {
    expect(Array.from(ifsKeyframes(IFS_RULES[2].rule, 2)[2]))
      .toEqual(Array.from(ifsKeyframes(IFS_RULES[2].rule, 2)[2]))
  })
})
```

- [ ] **Step 3: Run both and watch them fail**

Run: `npx vitest run src/diversions/parquet-deformation`
Expected: FAIL — cannot resolve `./grid`, `./ifs`.

- [ ] **Step 4: Write `grid.ts`**

```ts
import { resample, CURVE_POINTS, type Curve } from './curve'

/** Fine-grid cells per unit edge. The path walks this grid's edges. */
export const GRID_SUBDIV = 6
/**
 * How many grid rows the path may travel off the line, BEFORE amplitude.
 *
 * Half a lattice unit. That is the geometric tangency point — where a tile's
 * bottom edge bulging up would meet its top edge bulging down — but it is not a
 * hard limit, and this comment said it was through two revisions while
 * `amplitude` (default 1.7, max 2.0) multiplied straight past it for every
 * scheme. At the shipped default a grid edge reaches 0.85 lattice units.
 *
 * Overlap is not a tiling failure: the shared edges still match, so the tiling
 * stays gap-free; overlapping lobes are an interlock, which is what the owner
 * approved in `docs/mockups/2026-09-14-parquet-grid-amp18.jpeg`. What overlap
 * IS is a rendering question, answered by the explicit nonzero fill rule in
 * render.ts. Fixed rather than exposed as a knob because a slider defaulting to
 * the tangency point with its top past it is a knob whose top half nobody chose.
 */
export const GRID_REACH = GRID_SUBDIV / 2

export type GridPoint = [number, number]

const key = (p: GridPoint, q: GridPoint): string =>
  p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])
    ? `${p[0]},${p[1]}|${q[0]},${q[1]}`
    : `${q[0]},${q[1]}|${p[0]},${p[1]}`

/**
 * Push the path around one fine-grid cell. Kaplan's Figure 2 shows three
 * distinct local moves (for a cell with 1, 2 or 3 of its edges on the path);
 * they are all one rule — replace the on-path arc of the cell's 4-cycle with the
 * other arc — provided the on-path edges are CONTIGUOUS along the path.
 *
 * Note the k=3 move replaces three edges with one and SHORTENS the path. That is
 * correct and required; do not assert per-step monotone growth anywhere.
 *
 * Returns null for any move that is illegal or would make the path non-simple.
 */
export function pushAround(path: GridPoint[], cell: GridPoint): GridPoint[] | null {
  const [a, b] = cell
  const c: GridPoint[] = [[a, b], [a + 1, b], [a + 1, b + 1], [a, b + 1]]
  const edges = new Set([key(c[0], c[1]), key(c[1], c[2]), key(c[2], c[3]), key(c[3], c[0])])
  const on: number[] = []
  for (let i = 0; i < path.length - 1; i++) if (edges.has(key(path[i], path[i + 1]))) on.push(i)
  if (!on.length || on.length > 3) return null
  for (let i = 1; i < on.length; i++) if (on[i] !== on[i - 1] + 1) return null

  const i0 = on[0], i1 = on[on.length - 1], k = on.length
  const S = path[i0], E = path[i1 + 1]
  const idx = (p: GridPoint) => c.findIndex((q) => q[0] === p[0] && q[1] === p[1])
  const iS = idx(S), iE = idx(E)
  if (iS < 0 || iE < 0) return null
  const forward = (iS + k) % 4 === iE
  const mid: GridPoint[] = []
  for (let n = 1; n < 4 - k; n++) mid.push(c[(iS + (forward ? 16 - n : n)) % 4])

  const next = path.slice(0, i0 + 1).concat(mid, path.slice(i1 + 1))
  const seen = new Set<string>()
  for (const p of next) {
    // x must stay on its own edge. Measured without this guard, the path reaches
    // x in [-1, 7] against a 0..6 lattice on 2 of 4 seeds — so a grid edge
    // overshoots its own tiling vertices ALONG the edge and spills sideways into
    // the neighbouring cell. Gap-free still holds (both tiles use the same
    // curve), but tiles overlap for a reason nobody chose.
    if (p[0] < 0 || p[0] > GRID_SUBDIV) return null
    if (Math.abs(p[1]) > GRID_REACH) return null
    const kk = `${p[0]},${p[1]}`
    if (seen.has(kk)) return null // the path must stay simple
    seen.add(kk)
  }
  return next
}

/** The grid-space stages, before resampling. Exported so the legality invariants
 *  can be asserted on the real data rather than inferred from a resampled curve. */
export function gridPaths(steps: number, seed: number): GridPoint[][] {
  let s = seed >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)

  let path: GridPoint[] = []
  for (let i = 0; i <= GRID_SUBDIV; i++) path.push([i, 0])
  const stages: GridPoint[][] = [path]

  for (let step = 0; step < steps; step++) {
    let applied: GridPoint[] | null = null
    for (let attempt = 0; attempt < 90 && !applied; attempt++) {
      const at = Math.floor(rnd() * (path.length - 1))
      const p = path[at], q = path[at + 1]
      const horiz = p[1] === q[1]
      const side = rnd() < 0.5 ? 0 : -1
      const cell: GridPoint = horiz
        ? [Math.min(p[0], q[0]), p[1] + side]
        : [p[0] + side, Math.min(p[1], q[1])]
      applied = pushAround(path, cell)
    }
    if (!applied) break
    path = applied
    stages.push(path)
  }
  return stages
}

/** Kaplan §3: an initially straight path on a fine square grid, evolved by a
 *  sequence of cell pushes. Rectilinear, mechanical — Greek keys and labyrinths. */
export function gridKeyframes(steps: number, seed: number): Curve[] {
  return gridPaths(steps, seed).map((p) =>
    resample(p.map((q) => [q[0] / GRID_SUBDIV, q[1] / GRID_SUBDIV]), CURVE_POINTS))
}
```

- [ ] **Step 5: Write `ifs.ts`**

```ts
import { resample, CURVE_POINTS, type Curve } from './curve'

/** Each rule is a polyline from (0,0) to (1,0) that replaces a single segment. */
export const IFS_RULES: { name: string; rule: number[][] }[] = [
  { name: 'Puzzle bump', rule: [[0, 0], [0.25, 0], [0.25, 0.25], [0.5, 0.25], [0.5, -0.25], [0.75, -0.25], [0.75, 0], [1, 0]] },
  { name: 'Koch step', rule: [[0, 0], [1 / 3, 0], [0.5, 0.2887], [2 / 3, 0], [1, 0]] },
  { name: 'Zigzag', rule: [[0, 0], [0.2, 0.18], [0.4, -0.12], [0.6, 0.12], [0.8, -0.18], [1, 0]] },
  { name: 'Terrace', rule: [[0, 0], [0.3, 0], [0.3, 0.22], [0.7, 0.22], [0.7, 0], [1, 0]] },
]

/**
 * The deepest generation whose vertex count still fits in CURVE_POINTS.
 *
 * Generation g of an s-segment rule has s^g + 1 vertices, so 'Puzzle bump'
 * (s = 7) runs 2, 8, 50, 344, 2402, 16808. Resampling any of those to 160 points
 * cuts chords straight across the detail the generation just added — the exact
 * failure curve.ts's CURVE_POINTS comment warns about, which Revision 1 walked
 * into by hard-coding 5 generations for every rule.
 */
export function maxGenerations(rule: number[][]): number {
  const segs = rule.length - 1
  let g = 1
  while (Math.pow(segs, g + 1) + 1 <= CURVE_POINTS) g++
  return g
}

/**
 * Kaplan §4: replace every segment with a similarity-transformed copy of the
 * whole rule. Generations are the keyframes, spaced evenly over t — Kaplan notes
 * that stepping between generations discretely is far too abrupt to be pleasing,
 * so the LUT interpolates between adjacent ones.
 */
export function ifsKeyframes(rule: number[][], gens: number): Curve[] {
  const out: Curve[] = [resample([[0, 0], [1, 0]], CURVE_POINTS)]
  let cur: number[][] = [[0, 0], [1, 0]]
  for (let g = 0; g < gens; g++) {
    const next: number[][] = [cur[0]]
    for (let i = 0; i < cur.length - 1; i++) {
      const A = cur[i], B = cur[i + 1]
      const dx = B[0] - A[0], dy = B[1] - A[1]
      for (let r = 1; r < rule.length; r++) {
        const u = rule[r][0], v = rule[r][1]
        next.push([A[0] + u * dx - v * dy, A[1] + u * dy + v * dx])
      }
    }
    cur = next
    out.push(resample(cur, CURVE_POINTS))
  }
  return out
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/diversions/parquet-deformation`
Expected: PASS — Task 1 (31), Task 2 (11), Task 3 (16: grid 10, ifs 6).

- [ ] **Step 7: Mutation-check the simple-path guard against the test that actually covers it**

In `grid.ts`, delete `if (seen.has(kk)) return null`.
Expected: `gridPaths — every stage stays legal` FAILS on at least one of its four seeds.
(Revision 1 mutated this against "stays inside the declared reach" and "grows monotonically", neither of
which can detect it — a different, untouched line enforces the bound, and removing a check only admits
*more* moves.) Revert.

- [ ] **Step 8: Benchmark the grid generator — it is behind a structural control**

Append to `organic.bench.test.ts`:

```ts
import { gridKeyframes } from './grid'

describe('grid generator cost', () => {
  it('is cheap enough to sit behind a discrete control', () => {
    const t0 = performance.now()
    gridKeyframes(48, 1013)
    const ms = performance.now() - t0
    console.log(`gridKeyframes(48) = ${ms.toFixed(1)} ms`)
    expect(ms).toBeLessThan(400)   // measured sub-millisecond; loose for CI, same reason as above
  })
})
```

Run: `npx vitest run src/diversions/parquet-deformation/organic.bench`
Expected: PASS. Record the figure in Revision 3.

- [ ] **Step 9: Commit**

```bash
git add src/diversions/parquet-deformation/
git commit -m "parquet-deformation: grid-push and IFS generators, generation cap"
```

---

### Task 4: Schema, presets, and the renderer

**Files:** create `schema.ts`, `presets.ts`, `render.ts`; test `schema.test.ts`, `render.test.ts`.
**Tests first in both halves.**

**Interfaces — Produces:**
- `parquetSchema`, `type ParquetConfig`
- `deformationPresets`, `palettePresets`
- `type ParquetState`, `createState`, `rebuildStack`, `buildLut`, `structural`, `renderParquet`

- [ ] **Step 1: Write `schema.test.ts` first**

```ts
import { describe, it, expect } from 'vitest'
import { parquetSchema } from './schema'
import { deformationPresets, palettePresets } from './presets'

const d = parquetSchema.parse({})

describe('parquet schema', () => {
  it('defaults to the owner-approved organic look', () => {
    expect(d.scheme).toBe('Organic')
    expect(d.amplitude).toBeCloseTo(1.7, 6)
    expect(d.rampMapping).toBe('To the knee')
    expect(d.rampWidth).toBeCloseTo(14, 6)
  })

  it('drifts by default — the piece must not open as a static print', () => {
    expect(d.drift).toBeGreaterThan(0)
  })

  // Segmented renders the option's VALUE, so every segmented enum's values must
  // read as UI labels. "both" or "grid" on a button is the failure this catches.
  // Read meta through the framework's own accessor, not a hand-rolled cast:
  // Zod 4's .meta() is overloaded, so `as Record<string, unknown>` risks TS2352,
  // and fieldMeta.ts already routes through unknown for exactly this reason.
  it('every segmented option value is presentable text', async () => {
    const { fields } = await import('../../framework/fieldMeta')
    for (const [name, , m] of fields(parquetSchema)) {
      if (m.ui !== 'segmented') continue
      for (const o of (m.options as string[]) ?? []) {
        expect(typeof o, `${name} option must be a plain string`).toBe('string')
        expect(o[0], `${name} option "${o}" must start capitalised`).toBe(o[0].toUpperCase())
      }
    }
  })

  it('opens on a NAMED option in both preset groups', () => {
    const dk = Object.keys(deformationPresets[0].patch) as (keyof typeof d)[]
    expect(deformationPresets.some((p) => dk.every((k) => p.patch[k] === d[k]))).toBe(true)
    const ck = Object.keys(palettePresets[0].patch) as (keyof typeof d)[]
    expect(palettePresets.some((p) => ck.every((k) => p.patch[k] === d[k]))).toBe(true)
  })

  // First schema in the gallery to put a '+' in an enum value. codecSweep hands
  // the URLSearchParams object straight back to decodeConfig, so toString() is
  // never exercised there.
  it('survives a real URL round trip, including the + in "Fill + line"', async () => {
    const { encodeConfig } = await import('../../framework/urlCodec')
    const qs = encodeConfig(parquetSchema, d).toString()
    expect(qs).toContain('%2B')
    expect(new URLSearchParams(qs).get('renderMode')).toBe('Fill + line')
  })

  it('the whole-stack look stays reachable as a named preset', () => {
    expect(deformationPresets.some((p) => p.patch.rampMapping === 'Whole stack')).toBe(true)
  })
})
```

- [ ] **Step 2: Write `schema.ts`**

Canon per `CLAUDE.md` §"Schema UX canon". Colours are distinct semantic roles, so discrete `ui:'color'`
fields — not a `colorList`. They sit at **top level, not in a `ui:'group'`** (the spec says group; the
deviation is deliberate and recorded in Revision 2): `matchPresets` spreads a patch at top level, so a
nested group would have to be patched whole.

```ts
import { z } from 'zod'

const hex = () => z.string().regex(/^#[0-9a-fA-F]{6}$/)

export const parquetSchema = z.object({
  // ── Deformation ──
  scheme: z.enum(['Organic', 'Grid keys', 'Fractal']).default('Organic')
    .meta({ section: 'Deformation', ui: 'segmented', label: 'Scheme',
            options: ['Organic', 'Grid keys', 'Fractal'],
            help: 'How a tile edge evolves. Organic grows a curling labyrinth; Grid keys pushes a path '
                + 'around a fine grid into right-angle keys; Fractal replaces each segment with a copy of '
                + 'the whole rule. Three schemes from Craig Kaplan\'s 2010 paper.' }),
  organicFamily: z.enum(['Calm', 'Restless', 'Wild']).default('Restless')
    .meta({ section: 'Deformation', ui: 'select', label: 'Growth',
            options: ['Calm', 'Restless', 'Wild'],
            showWhen: { field: 'scheme', equals: 'Organic' },
            help: 'How restless the growth is. Calm curls smoothly; Wild wanders more before it settles.' }),
  gridVariant: z.enum(['Seed 1', 'Seed 2', 'Seed 3', 'Seed 4']).default('Seed 1')
    .meta({ section: 'Deformation', ui: 'select', label: 'Key pattern',
            options: ['Seed 1', 'Seed 2', 'Seed 3', 'Seed 4'],
            showWhen: { field: 'scheme', equals: 'Grid keys' },
            help: 'Which sequence of pushes the path takes — a different labyrinth each time.' }),
  // Default is Koch step, not Puzzle bump: a 7-segment rule caps at 2 generations
  // (7^3 + 1 = 344 > CURVE_POINTS), so Puzzle bump has the thinnest catalogue of
  // the four and only two intervals for Detail to traverse. Koch's 4 segments
  // reach 3 generations.
  fractalRule: z.enum(['Puzzle bump', 'Koch step', 'Zigzag', 'Terrace']).default('Koch step')
    .meta({ section: 'Deformation', ui: 'select', label: 'Rule',
            options: ['Puzzle bump', 'Koch step', 'Zigzag', 'Terrace'],
            showWhen: { field: 'scheme', equals: 'Fractal' },
            help: 'The shape each segment is replaced by, over and over.' }),
  rampMapping: z.enum(['To the knee', 'Whole stack']).default('To the knee')
    .meta({ section: 'Deformation', ui: 'segmented', label: 'Ramp mapping',
            options: ['To the knee', 'Whole stack'],
            showWhen: { field: 'scheme', equals: 'Organic' },
            help: 'Organic growth stops changing shape about a quarter of the way through its run. '
                + '"To the knee" spends the ramp on the part that still evolves, so the gradient reads. '
                + '"Whole stack" spreads it over everything — a more uniform, more ornate field.' }),
  detail: z.number().int().min(4).max(48).default(30)
    .meta({ section: 'Deformation', ui: 'slider', min: 4, max: 48, step: 1, label: 'Detail',
            help: 'How far along its evolution the edge reaches at the far end of the ramp. Each scheme '
                + 'stops at its own natural limit, so the top of this range can be a plateau.' }),
  amplitude: z.number().min(0.2).max(2).default(1.7)
    .meta({ section: 'Deformation', ui: 'slider', min: 0.2, max: 2, step: 0.05, label: 'Amplitude',
            help: 'How far the edge reaches off the lattice line — how much of the tile the deformation '
                + 'fills. Past about 1.8 a tile\'s own edges start to overlap each other. On Grid keys it '
                + 'also stretches the keys, so they read less square.' }),
  field: z.enum(['Ramp', 'Radial', 'Diagonal']).default('Ramp')
    .meta({ section: 'Deformation', ui: 'segmented', label: 'Field',
            options: ['Ramp', 'Radial', 'Diagonal'],
            help: 'Which way the deformation varies across the plane.' }),
  rampWidth: z.number().min(3).max(40).default(14)
    .meta({ section: 'Deformation', ui: 'slider', min: 3, max: 40, step: 0.5, label: 'Ramp width',
            help: 'Tiles per full traverse of the catalogue. Small shows the whole gradient in one screen; '
                + 'large is "quietly not identical".' }),
  drift: z.number().min(0).max(40).default(10)
    .meta({ section: 'Deformation', ui: 'slider', min: 0, max: 40, step: 1, label: 'Drift',
            help: 'How fast the catalogue flows through the frame. At the default a full traverse takes '
                + 'about 48 seconds. 0 holds it still as a print.' }),
  // ── Look ──
  tileSize: z.number().int().min(34).max(170).default(110)
    .meta({ section: 'Look', ui: 'slider', min: 34, max: 170, step: 2, label: 'Tile size',
            help: 'Lattice spacing in pixels. Small means many more tiles to draw.' }),
  renderMode: z.enum(['Fill + line', 'Fill', 'Line']).default('Fill + line')
    .meta({ section: 'Look', ui: 'segmented', label: 'Render',
            options: ['Fill + line', 'Fill', 'Line'],
            help: 'Line only reads as a drawing; fill only reads as marquetry.' }),
  lineWidth: z.number().min(0.5).max(4).default(1.5)
    .meta({ section: 'Look', ui: 'slider', min: 0.5, max: 4, step: 0.25, label: 'Line weight',
            help: 'Thickness of the tile outline.' }),
  // ── Color ──
  tileA: hex().default('#3c556b')
    .meta({ section: 'Color', ui: 'color', label: 'Tile A',
            help: 'One of the two alternating tile fills — the checkerboard is what makes the shapes read.' }),
  tileB: hex().default('#d9d3c5')
    .meta({ section: 'Color', ui: 'color', label: 'Tile B',
            help: 'The other fill. Keep it well clear of Tile A or the tiling flattens.' }),
  line: hex().default('#0d1013')
    .meta({ section: 'Color', ui: 'color', label: 'Edge color' }),
  background: hex().default('#171a1d')
    .meta({ section: 'Color', ui: 'color', label: 'Background',
            help: 'Shows only at the frame edge; the tiling covers the plane.' }),
  // ── Advanced ──
  seed: z.number().int().default(1)
    .meta({ section: 'Advanced', collapsed: true, ui: 'number', step: 1, label: 'Seed',
            randomizeOnFreshLoad: true,
            help: 'Picks a fresh edge to evolve. A shared link is seedless — every visit opens on a '
                + 'different world. The Fractal scheme is fully determined by its rule, so the seed does '
                + 'nothing there.' }),
})

export type ParquetConfig = z.infer<typeof parquetSchema>
```

- [ ] **Step 3: Write `presets.ts`**

`Lace` and `Slate parquet` must match the schema defaults **exactly**, or `presetSweep.test.ts`'s
"opens on a named option at defaults" case goes red. If any default moves, its preset moves in the same
commit.

```ts
import type { ParquetConfig } from './schema'

type DeformKeys = 'scheme' | 'organicFamily' | 'gridVariant' | 'fractalRule' | 'rampMapping'
  | 'detail' | 'amplitude' | 'field' | 'rampWidth'

export const deformationPresets: { name: string; patch: Pick<ParquetConfig, DeformKeys> }[] = [
  // ⚠️ `Lace` is the option that must equal the schema defaults FIELD FOR FIELD,
  // or presetSweep's opens-on-a-name gate goes red — and that gate fires from
  // codec-keystone-guard the moment this file is written. Revision 3 moved the
  // fractalRule default to 'Koch step' and left this on 'Puzzle bump', which
  // would have failed inside Task 4. If any default moves, move it here too, in
  // the same commit.
  { name: 'Lace',        patch: { scheme: 'Organic', organicFamily: 'Restless', gridVariant: 'Seed 1', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 30, amplitude: 1.7, field: 'Ramp', rampWidth: 14 } },
  { name: 'Knotwork',    patch: { scheme: 'Organic', organicFamily: 'Wild', gridVariant: 'Seed 1', fractalRule: 'Puzzle bump', rampMapping: 'Whole stack', detail: 44, amplitude: 1.7, field: 'Ramp', rampWidth: 7 } },
  { name: 'Rosette',     patch: { scheme: 'Organic', organicFamily: 'Calm', gridVariant: 'Seed 1', fractalRule: 'Puzzle bump', rampMapping: 'To the knee', detail: 34, amplitude: 1.9, field: 'Radial', rampWidth: 11 } },
  { name: 'Huff plate',  patch: { scheme: 'Grid keys', organicFamily: 'Restless', gridVariant: 'Seed 1', fractalRule: 'Puzzle bump', rampMapping: 'To the knee', detail: 26, amplitude: 1.0, field: 'Ramp', rampWidth: 7 } },
  { name: 'Labyrinth',   patch: { scheme: 'Grid keys', organicFamily: 'Restless', gridVariant: 'Seed 3', fractalRule: 'Puzzle bump', rampMapping: 'To the knee', detail: 40, amplitude: 1.0, field: 'Diagonal', rampWidth: 11 } },
  { name: 'Dragon',      patch: { scheme: 'Fractal', organicFamily: 'Restless', gridVariant: 'Seed 1', fractalRule: 'Puzzle bump', rampMapping: 'To the knee', detail: 28, amplitude: 1.0, field: 'Ramp', rampWidth: 9 } },
  { name: 'Snowflake',   patch: { scheme: 'Fractal', organicFamily: 'Restless', gridVariant: 'Seed 1', fractalRule: 'Koch step', rampMapping: 'To the knee', detail: 28, amplitude: 1.3, field: 'Radial', rampWidth: 11 } },
]

// 'Huff plate' is a DEFORMATION, not a plate: the ink-on-cream half of that look
// lives in the Palette group, because presetSweep requires one key-set per group
// and a deformation option cannot carry colours.
export const palettePresets: {
  name: string
  patch: Pick<ParquetConfig, 'tileA' | 'tileB' | 'line' | 'background'>
}[] = [
  { name: 'Slate parquet', patch: { tileA: '#3c556b', tileB: '#d9d3c5', line: '#0d1013', background: '#171a1d' } },
  { name: 'Ink on cream',  patch: { tileA: '#ddd1ba', tileB: '#ece3d2', line: '#1b1714', background: '#ece3d2' } },
  { name: 'Kaplan plate',  patch: { tileA: '#6d94a6', tileB: '#dfded3', line: '#20272b', background: '#f2f2f0' } },
  { name: 'Stained glass', patch: { tileA: '#1d6f8e', tileB: '#c2521f', line: '#f0ead8', background: '#0a0a0d' } },
  { name: 'Verdigris',     patch: { tileA: '#2e5d52', tileB: '#cfd8cc', line: '#0a0f0d', background: '#101614' } },
  { name: 'Mono',          patch: { tileA: '#4a4a52', tileB: '#e8e8ee', line: '#0a0a0c', background: '#0a0a0c' } },
]
```

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run src/diversions/parquet-deformation/schema`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write `render.test.ts` first**

```ts
import { describe, it, expect } from 'vitest'
import { parquetSchema, type ParquetConfig } from './schema'
import { createState, buildLut, rebuildStack, structural, renderParquet } from './render'

const cfg = parquetSchema.parse({})
const fakeCtx = () => {
  const calls: string[] = []
  const ctx = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
    fillRect: () => calls.push('fillRect'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => {}, lineTo: () => {}, closePath: () => {},
    fill: () => calls.push('fill'), stroke: () => calls.push('stroke'),
  } as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}

describe('structural', () => {
  it('is false for a detail change — Detail must never re-simulate', () => {
    expect(structural(cfg, { ...cfg, detail: 44 })).toBe(false)
  })
  it('is false for every live-applied field', () => {
    for (const patch of [
      { amplitude: 0.9 }, { field: 'Radial' as const }, { rampWidth: 22 }, { drift: 3 },
      { tileSize: 60 }, { renderMode: 'Line' as const }, { lineWidth: 3 }, { tileA: '#ffffff' },
      { rampMapping: 'Whole stack' as const },
    ] as Partial<ParquetConfig>[]) {
      expect(structural(cfg, { ...cfg, ...patch }), JSON.stringify(patch)).toBe(false)
    }
  })
  it('is true for the three that change the keyframe stack', () => {
    expect(structural(cfg, { ...cfg, scheme: 'Fractal' })).toBe(true)
    expect(structural(cfg, { ...cfg, organicFamily: 'Wild' })).toBe(true)
    expect(structural(cfg, { ...cfg, seed: 99 })).toBe(true)
  })
})

describe('buildLut', () => {
  it('always returns 256 entries', () => {
    const st = createState(cfg, 800, 600)
    expect(buildLut(st, cfg).length).toBe(256)
  })

  // Revision 1's version of this test assigned st.lut by hand, so it passed
  // against an implementation that re-simulates on every Detail tick.
  it('a detail change rebuilds the LUT WITHOUT touching the stack', () => {
    const st = createState(cfg, 800, 600)
    const stackRef = st.stack
    const frameRef = st.stack[3]
    const before = Array.from(st.lut[255])
    st.lut = buildLut(st, { ...cfg, detail: 4 })
    expect(st.stack).toBe(stackRef)      // same array object
    expect(st.stack[3]).toBe(frameRef)   // same curve objects
    expect(Array.from(st.lut[255])).not.toEqual(before)
  })

  // Every scheme must have a live Detail slider. Revision 1's fractal branch
  // returned 6 keyframes against a min of 6, so all 43 positions were identical.
  for (const scheme of ['Organic', 'Grid keys', 'Fractal'] as const) {
    it(`detail moves the far end of the ramp under ${scheme}`, () => {
      const c = { ...cfg, scheme }
      const st = createState(c, 800, 600)
      const lo = buildLut(st, { ...c, detail: 4 })
      const hi = buildLut(st, { ...c, detail: 48 })
      expect(Array.from(lo[255])).not.toEqual(Array.from(hi[255]))
    })
  }

  it('the knee mapping reaches a different far end than the whole stack', () => {
    const st = createState(cfg, 800, 600)
    const knee = buildLut(st, { ...cfg, rampMapping: 'To the knee' })
    const whole = buildLut(st, { ...cfg, rampMapping: 'Whole stack' })
    expect(Array.from(knee[255])).not.toEqual(Array.from(whole[255]))
  })
})

describe('renderParquet', () => {
  it('fills with an explicit nonzero winding rule', () => {
    // A self-overlapping tile under 'evenodd' shows background through its own
    // middle. The amplitude slider reaches a regime where tiles do overlap, and
    // that is accepted as an interlock — but only under nonzero.
    const st = createState({ ...cfg, amplitude: 2 }, 400, 300)
    const rules: unknown[] = []
    const ctx = {
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineJoin: '', lineCap: '',
      fillRect: () => {}, beginPath: () => {}, moveTo: () => {}, lineTo: () => {},
      closePath: () => {}, stroke: () => {},
      fill: (r?: unknown) => rules.push(r),
    } as unknown as CanvasRenderingContext2D
    renderParquet(st, ctx)
    expect(rules.length).toBeGreaterThan(0)
    expect(new Set(rules)).toEqual(new Set(['nonzero']))
  })

  it('draws without throwing, and never constructs a Path2D', () => {
    expect(typeof (globalThis as { Path2D?: unknown }).Path2D).toBe('undefined')
    const st = createState(cfg, 600, 400)
    const { ctx, calls } = fakeCtx()
    expect(() => renderParquet(st, ctx)).not.toThrow()
    expect(calls[0]).toBe('fillRect')
    expect(calls.filter((c) => c === 'fill').length).toBeGreaterThan(0)
  })

  // The column collapse exists ONLY at phase 0, because the swing term tilts the
  // Ramp axis. Testing the cache at the default phase of 0 would certify a
  // property the running piece has at exactly one instant — so assert both, and
  // assert that the cache is what actually carries the cost across frames.
  it('collapses a column to one outline at phase 0 only', () => {
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    const cols = Math.ceil(600 / cfg.tileSize) + 3   // loop runs i = -1 .. cols-1
    renderParquet(st, ctx)
    expect(st.outlines.size).toBe(cols)

    st.outlines.clear()
    st.phase = 2.0
    renderParquet(st, ctx)
    expect(st.outlines.size).toBeGreaterThan(cols)   // the tilt is real
  })

  it('the cache SURVIVES a frame, which is what carries the cost', () => {
    // Counts BUILDS, not map size. An earlier draft advanced the phase by 0.0005
    // and asserted the map had not grown at all, calling that "a sub-quantum
    // advance" — but 0.0005 is 0.1275 quantised index units, and a rounding
    // boundary is per-sample, not global, so ~12.75% of the 216 midpoints cross
    // one and mint a new key. The assertion was red on correct code.
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    st.phase = 2.0
    renderParquet(st, ctx)
    const cold = st.builtThisFrame
    expect(cold).toBeGreaterThan(20)                  // the first frame IS cold
    st.phase = 2.0 + 0.021 / 60                       // one frame at the shipped drift
    renderParquet(st, ctx)
    expect(st.builtThisFrame).toBeLessThan(cold * 0.25)
  })

  it('a Detail change invalidates the cache — the slider is not inert on screen', async () => {
    // Three earlier defects in this plan were an inert control. This is the one
    // that arrives through the CACHE rather than through the schema or the LUT.
    const mod = await import('./index')
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    renderParquet(st, ctx)
    const genBefore = st.lutGen
    const keysBefore = new Set(st.outlines.keys())
    mod.default.update!(st, { ...cfg, detail: 8 })
    renderParquet(st, ctx)
    expect(st.lutGen).toBeGreaterThan(genBefore)
    expect(st.builtThisFrame).toBeGreaterThan(0)      // it really redrew
    for (const k of st.outlines.keys()) expect(keysBefore.has(k)).toBe(false)
  })

  it('amplitude and tile size are dropped from the cache, not keyed into it', () => {
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    renderParquet(st, ctx)
    const key = [...st.outlines.keys()][0]
    expect(key.split(',').length).toBe(5)             // b,r,t,l,lutGen — nothing else
  })

  it('an amplitude change clears the cache rather than growing it', async () => {
    const mod = await import('./index')
    const st = createState(cfg, 600, 400)
    const { ctx } = fakeCtx()
    renderParquet(st, ctx)
    mod.default.update!(st, { ...cfg, amplitude: 0.6 })
    expect(st.outlines.size).toBe(0)
    expect(st.prevOutlines.size).toBe(0)
  })

  it('rebuildStack replaces the stack and drops the cache', () => {
    const st = createState(cfg, 600, 400)
    const before = st.stack
    st.outlines.set('stale', new Float32Array(2))
    rebuildStack(st, { ...cfg, scheme: 'Fractal' })
    expect(st.stack).not.toBe(before)
    expect(st.outlines.has('stale')).toBe(false)
  })
})
```

- [ ] **Step 6: Write `render.ts`**

```ts
import { buildTilePath, lerpCurve, paramAt, CURVE_POINTS, type Curve } from './curve'
import { organicKeyframes, kneeIndex, ORGANIC_FAMILIES } from './organic'
import { gridKeyframes } from './grid'
import { ifsKeyframes, maxGenerations, IFS_RULES } from './ifs'
import type { ParquetConfig } from './schema'

const GRID_VARIANTS = ['Seed 1', 'Seed 2', 'Seed 3', 'Seed 4'] as const

const LUT_SIZE = 256

/** The generator runs to its maximum length ONCE. `detail` then selects how far
 *  along that stack the ramp reaches — so a Detail drag is a LUT rebuild (256
 *  lerps) and never a re-simulation. There is no debounce in the framework; a
 *  generator behind a slider would run on every pointermove. */
const MAX_STAGES = 48

export type ParquetState = {
  cfg: ParquetConfig
  stack: Curve[]
  lut: Curve[]
  phase: number
  w: number
  h: number
  /** Tile outlines, keyed on the four quantised parameter indices PLUS the two
   *  frame-constants baked into the stored points (amplitude, tile size). Values
   *  are flat point arrays in LOCAL tile space; the draw loop offsets them.
   *  Never a Path2D — jsdom has none and diversionSmoke sweeps every setup().
   *  Survives across frames; see renderParquet. */
  outlines: Map<string, Float32Array>
  /** The previous frame's cache; see renderParquet. */
  prevOutlines: Map<string, Float32Array>
  /** Outlines built during the last renderParquet. The cache exists to keep
   *  this near zero after the first frame; asserting on map SIZE instead
   *  measures a proxy that drifts for unrelated reasons. */
  builtThisFrame: number
  /** Bumped whenever `lut` is replaced. It is IN the cache key, because the four
   *  indices a cached outline was built from mean nothing without the LUT they
   *  indexed. Without it, a Detail drag rebuilds the LUT while every tile on
   *  screen hits the cache on its old key and redraws the pre-drag shape — an
   *  inert Detail slider, arrived at from a third direction after two earlier
   *  fixes for the same symptom. A counter keeps that invariant local to the
   *  cache instead of depending on every future caller remembering to clear. */
  lutGen: number
}

function generate(cfg: ParquetConfig): Curve[] {
  if (cfg.scheme === 'Organic') {
    const fam = ORGANIC_FAMILIES.find((f) => f.name === cfg.organicFamily) ?? ORGANIC_FAMILIES[1]
    return organicKeyframes(MAX_STAGES, fam.wobble, cfg.seed)
  }
  if (cfg.scheme === 'Grid keys') {
    // Keyed on the enum member, not parsed out of its label: renaming a variant
    // to anything not ending in a digit used to collapse it silently onto 1.
    const variant = GRID_VARIANTS.indexOf(cfg.gridVariant) + 1
    return gridKeyframes(MAX_STAGES, cfg.seed + variant * 3313)
  }
  const rule = IFS_RULES.find((r) => r.name === cfg.fractalRule) ?? IFS_RULES[0]
  return ifsKeyframes(rule.rule, maxGenerations(rule.rule))
}

/** Which fields require re-running the generator. Everything else is live. */
export function structural(a: ParquetConfig, b: ParquetConfig): boolean {
  return a.scheme !== b.scheme
    || a.organicFamily !== b.organicFamily
    || a.gridVariant !== b.gridVariant
    || a.fractalRule !== b.fractalRule
    || a.seed !== b.seed
}

/**
 * Map `detail` onto the stack. Each scheme has its own natural end: the fractal
 * stack is only as deep as CURVE_POINTS can represent, the grid stack stops when
 * no legal push remains, and the organic stack saturates long before it stops
 * running. So the slider is scaled into whatever this stack actually offers
 * rather than indexing it directly — indexing directly is what made Detail inert
 * under the fractal scheme.
 */
export function buildLut(st: ParquetState, cfg: ParquetConfig): Curve[] {
  const stack = st.stack
  const last = stack.length - 1
  const ceiling = cfg.scheme === 'Organic' && cfg.rampMapping === 'To the knee'
    ? kneeIndex(stack)
    : last
  // Deliberately NOT rounded: buildLut interpolates a fractional `top` correctly,
  // and rounding would quantise Detail to `ceiling + 1` outcomes — two of them
  // under the Fractal scheme, across 45 slider positions.
  const frac = (cfg.detail - 4) / (48 - 4)
  const top = Math.max(0.05, Math.min(ceiling, frac * ceiling))
  const lut: Curve[] = new Array(LUT_SIZE)
  for (let i = 0; i < LUT_SIZE; i++) {
    const x = (i / (LUT_SIZE - 1)) * top
    const j = Math.min(last - 1, Math.floor(x))
    lut[i] = last === 0 ? stack[0] : lerpCurve(stack[j], stack[j + 1], x - j)
  }
  return lut
}

export function rebuildStack(st: ParquetState, cfg: ParquetConfig): void {
  st.stack = generate(cfg)
  setLut(st, buildLut(st, cfg))
}

/** The ONLY way `lut` is replaced. Bumping the generation is what invalidates
 *  the outline cache; assigning `st.lut` directly does not, and that is the
 *  defect this function exists to make unwriteable. */
export function setLut(st: ParquetState, lut: Curve[]): void {
  st.lut = lut
  st.lutGen++
}

export function createState(cfg: ParquetConfig, w: number, h: number): ParquetState {
  const st: ParquetState = {
    cfg, stack: [], lut: [], lutGen: 0, phase: 0, w, h, builtThisFrame: 0,
    outlines: new Map(), prevOutlines: new Map(),
  }
  rebuildStack(st, cfg)
  return st
}

const curveIdx = (t: number): number =>
  Math.max(0, Math.min(LUT_SIZE - 1, Math.round(t * (LUT_SIZE - 1))))

export function renderParquet(st: ParquetState, ctx: CanvasRenderingContext2D): void {
  const cfg = st.cfg
  ctx.fillStyle = cfg.background
  ctx.fillRect(0, 0, st.w, st.h)

  const s = cfg.tileSize
  const cols = Math.ceil(st.w / s) + 2
  const rows = Math.ceil(st.h / s) + 2
  const cx = cols / 2
  const cy = rows / 2

  ctx.lineWidth = cfg.lineWidth
  ctx.strokeStyle = cfg.line
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // ⚠️ The cache MUST live across frames, and amplitude and tile size MUST be in
  // the key. An earlier draft cleared it every frame and left them out, on the
  // theory that under Ramp the parameter depends on x alone so a column shares
  // one outline. That is true at phase 0 and FALSE at every other phase: the
  // swing term in paramAt tilts the axis, which is the whole point of it, so
  // Ramp's parameter is y-dependent in flight. Measured down one column at
  // tileSize 110: 1 distinct index at phase 0, 5-6 at phases 0.5, 2.0 and 7.3.
  // A per-frame cache would therefore rebuild ~228 outlines x 640 points every
  // frame at the defaults, and ~2,100 at the bottom of the tileSize slider.
  //
  // Across frames it does not matter that the collapse is gone: the quantised
  // indices advance about twice a second at the shipped drift, so a tuple stays
  // live for tens of frames and the hit rate is high under every field —
  // including Radial and Diagonal, which never collapsed at any phase.
  // Two generations, not a cap-and-flush. A wholesale clear past a cap drops
  // every visible outline in one frame — ~2,100 rebuilds at the bottom of the
  // tileSize slider, i.e. a recurring stall the fps pill cannot see. Swapping
  // generations bounds the cache at ~2x the visible tiles with no cliff.
  st.prevOutlines = st.outlines
  st.outlines = new Map()
  st.builtThisFrame = 0
  const pts: number[] = []
  for (let j = -1; j < rows; j++) {
    for (let i = -1; i < cols; i++) {
      const b = curveIdx(paramAt(cfg.field, i + 0.5, j, cx, cy, cfg.rampWidth, st.phase))
      const r = curveIdx(paramAt(cfg.field, i + 1, j + 0.5, cx, cy, cfg.rampWidth, st.phase))
      const t = curveIdx(paramAt(cfg.field, i + 0.5, j + 1, cx, cy, cfg.rampWidth, st.phase))
      const l = curveIdx(paramAt(cfg.field, i, j + 0.5, cx, cy, cfg.rampWidth, st.phase))
      const key = `${b},${r},${t},${l},${st.lutGen}`
      let outline = st.outlines.get(key) ?? st.prevOutlines.get(key)
      if (outline) {
        st.outlines.set(key, outline)   // promote, so it survives the next swap
      } else {
        pts.length = 0
        buildTilePath(pts, 0, 0, [st.lut[b], st.lut[r], st.lut[t], st.lut[l]], cfg.amplitude)
        outline = new Float32Array(pts.length)
        for (let p = 0; p < pts.length; p++) outline[p] = pts[p] * s
        st.outlines.set(key, outline)
        st.builtThisFrame++
      }
      const ox = i * s
      const oy = j * s
      ctx.beginPath()
      ctx.moveTo(ox + outline[0], oy + outline[1])
      for (let p = 1; p < CURVE_POINTS * 4; p++) {
        ctx.lineTo(ox + outline[p * 2], oy + outline[p * 2 + 1])
      }
      ctx.closePath()
      if (cfg.renderMode !== 'Line') {
        ctx.fillStyle = (i + j) & 1 ? cfg.tileA : cfg.tileB
        // NONZERO winding, explicitly. At high amplitude a tile's own edges can
        // overlap, and under 'evenodd' every doubly-wound pocket would punch a
        // background-coloured hole through the tile. Nonzero fills the union,
        // which is what an interlocking tile should look like. Do not let this
        // fall through to the default — state it, because the default is nonzero
        // and a later reader will otherwise assume it was never considered.
        ctx.fill('nonzero')
      }
      if (cfg.renderMode !== 'Fill') ctx.stroke()
    }
  }
}
```

- [ ] **Step 7: Run everything**

Run: `npx vitest run src/diversions/parquet-deformation`
Expected: PASS.

- [ ] **Step 8: Mutation-check the Detail guarantee**

In `render.ts`, add `st.stack = generate(cfg)` as the first line of `buildLut`'s body (it will need the
state param, which it has).
Expected: `a detail change rebuilds the LUT WITHOUT touching the stack` FAILS on `expect(st.stack).toBe(stackRef)`.
Revert.

- [ ] **Step 9: Commit**

```bash
git add src/diversions/parquet-deformation/
git commit -m "parquet-deformation: schema, presets and the renderer"
```

---

### Task 5: Register the diversion

**Files:** modify `docs/gallery.md`, `README.md`; create `index.ts`.

⚠️ **`diversion-count-guard` will report drift on the first two of these three writes, in whichever order
you make them** — it fires on all three paths and compares folder count to entry count on each, so the
intermediate state is inconsistent from either end. It is `PostToolUse`: it cannot block a write, it only
prints afterwards. **Expect two exit-2 messages and keep going.** It goes green on the third write.
Confirm that at the end of Step 4.

- [ ] **Step 1: Add the `docs/gallery.md` entry**

Place it alongside the other tiling pieces. It must contain the literal ``(`kind: '2d'`)``.

```markdown
- **[Parquet Deformation](https://mattaltermatt.github.io/diversion/d/parquet-deformation/play)** (`kind: '2d'`) — a field of tiles that is quietly not identical: the lattice is a plain grid of squares, but the **shape of its edges is a function of position**, so squares loosen into curling lace across the screen and back again, and the whole catalogue drifts slowly through the frame forever. Every edge reads the deformation parameter at its own midpoint, so the two tiles sharing it compute the identical curve and the tiling is gap-free at every value by construction; the field's axis also swings on an incommensurate period, so the picture never returns to a state it has already been in — though it is quasi-periodic, and its whole repertoire is traversed in about four minutes. Three of Craig Kaplan's curve-evolution schemes ship as one knob — **Organic** (Pedersen & Singh labyrinth growth on an edge pinned at both ends, the default), **Grid keys** (a path pushed around the cells of a fine grid into right-angle Greek keys) and **Fractal** (each segment replaced by a copy of the whole rule) — over Ramp / Radial / Diagonal parameter fields, with an **Amplitude** knob for how much of the tile the deformation fills. Distinct from `penrose`, `crystal`, `hyperbolic-tiling`, `quasicrystal`, `abstractile` and `truchet-flow`, which all render a **fixed** tiling and animate only the camera, the fill or the placement order. A clean-room take on William Huff's Basic Design Studio exercise (1960–1980), after Kaplan, *Curve Evolution Schemes for Parquet Deformations*, Bridges 2010 (#383).
```

- [ ] **Step 2: Bump the README count**

Run: `grep -n '139' README.md`
Change `**139 diversions**` to `**140 diversions**`, and any other stale 139 the grep turns up.

- [ ] **Step 3: Write `index.ts`**

```ts
import { defineDiversion, type PresetGroup } from '../../framework/types'
import { parquetSchema, type ParquetConfig } from './schema'
import { createState, rebuildStack, buildLut, structural, renderParquet, type ParquetState } from './render'
import { deformationPresets, palettePresets } from './presets'
import { meta } from './meta'

/**
 * Phase-units per second at drift 1. triWave has period 2, so a full traverse of
 * the catalogue at the default drift of 10 takes 2 / (10 * 0.0021) ≈ 48 s.
 *
 * Owner direction was "slow it down a bit" against the mockup, whose default ran
 * a traverse in ~21 s. 48 s is 2.3x slower. An earlier draft of this plan picked
 * 7.7x by arithmetic error and called it settled; it is a tuning literal and it
 * ships as a default for the owner to move, not as a fact.
 */
const DRIFT_RATE = 0.0021

const presets: PresetGroup<ParquetConfig>[] = [
  { label: 'Deformation', options: deformationPresets },
  { label: 'Palette', options: palettePresets },
]

const parquetDeformation = defineDiversion<typeof parquetSchema, ParquetState, '2d'>({
  ...meta,
  schema: parquetSchema,
  presets,

  setup(ctx, config, size) {
    const st = createState(config, size.width, size.height)
    renderParquet(st, ctx)
    return st
  },

  frame(state, ctx, _t, dt) {
    state.phase += state.cfg.drift * DRIFT_RATE * (dt / 1000)
    renderParquet(state, ctx)
  },

  resize(state, size) {
    // The tiling is defined per lattice cell, so a resize only changes how many
    // cells are drawn. No rebuild, no restart.
    state.w = size.width
    state.h = size.height
  },

  update(state, config) {
    if (structural(state.cfg, config)) {
      state.cfg = config
      rebuildStack(state, config)
    } else if (config.detail !== state.cfg.detail || config.rampMapping !== state.cfg.rampMapping) {
      // Only these two re-map the ramp onto the stack. Rebuilding the 256-entry
      // LUT for a colour picker or a tile-size drag would allocate 256 curves per
      // pointermove, and there is no debounce anywhere between a slider and here.
      state.cfg = config
      setLut(state, buildLut(state, config))   // bumps lutGen, invalidating the cache
    } else {
      // Amplitude and tile size are baked into the cached POINTS. They are
      // deliberately not in the key — 36 amplitude steps x ~2,100 tiles would
      // mint ~75,000 entries over one drag — so the cache is dropped instead.
      if (config.amplitude !== state.cfg.amplitude || config.tileSize !== state.cfg.tileSize) {
        state.outlines.clear()
        state.prevOutlines.clear()
      }
      state.cfg = config
    }
    return true
  },
})

export default parquetDeformation
```

- [ ] **Step 4: Restart the dev server**

A brand-new diversion folder 404s until the dev server restarts — Vite's `import.meta.glob` registry does
not pick it up live. Run `npm run dev` **in the background** (do not background it with `&` inside a single
tool call, and do not `pkill -f vite`, which can match the invoking shell itself).
Expected: `Local:   http://localhost:5180/`.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. This is where `contract.test.ts`, `diversionSmoke.test.ts`, `seedContract.test.ts`,
`urlKeys.test.ts`, `codecSweep`, `presetSweep.test.ts` and `diversionMeta.test.ts` first see the piece —
and where Revision 1's `Path2D`, `notEquals` and dead-Detail defects would all have surfaced at once.

- [ ] **Step 6: Commit**

```bash
git add src/diversions/parquet-deformation/index.ts docs/gallery.md README.md
git commit -m "parquet-deformation: register the diversion (#383)"
```

---

### Task 6: Measure, verify in Chrome, run every gate

- [ ] **Step 1: Measure the frame cost — the spec's one open question**

Worst case is the **bottom of the `tileSize` slider**, which Revision 1's estimate missed by ~10x: at
`tileSize 34` on a 1920x1080 viewport the loop runs 60 x 35 = **2,100 tiles**, each 640 points, and under
`Fill + line` each is both filled and stroked.

With the dev server running, open
`http://localhost:5180/d/parquet-deformation/play?seed=7&tileSize=34` at a maximised window and, for each
of Ramp / Radial / Diagonal, take a 5-second trace:

- `performance_start_trace` (reload: false, autoStop: false) → wait 5 s → `performance_stop_trace`
- Read **scripting time per frame** from the summary.

**Threshold: under 16 ms per frame at `tileSize 34` for all three fields.** Record all three in Revision 3.

This should already hold — **Task 0 settled it before the renderer was written**, and the cross-frame
cache is the shipped design rather than a contingency. This step confirms the real thing (ctx calls
included) matches the headless geometry figure.

For the record, at the shipped drift the quantised LUT index advances `0.021 x 255 = 5.36 steps/s`, one
step every ~187 ms or ~11 frames — which is why the cross-frame cache hits ~91% of the time and why a
per-frame clear was so expensive. If the real frame still misses 16 ms, the levers are the ones Task 0
Step 3 lists, in that order. **Not** lowering `CURVE_POINTS`, and **not** adaptive per-keyframe resampling,
which `lerpCurve`'s equal-length requirement makes a `Curve`-contract change rather than a tweak.

- [ ] **Step 2: Verify the look in Chrome**

Against `docs/mockups/2026-09-14-parquet-organic-knee-wide.jpeg`:
- Defaults open on organic lace with a legible left-to-right gradient, drifting slowly.
- **Ramp mapping**: flip to `Whole stack` and back; it should match `2026-09-14-parquet-organic-amp17.jpeg`.
- Drag **Amplitude** 0.2 → 2.0: the curls grow into the tile; nothing tears.
- Drag **Detail** under each of the three schemes and confirm it visibly moves the far end of the ramp in
  all three — that is the regression Revision 1 shipped.
- Switch **Scheme** through all three; each shows its own named variant control, and the buttons read
  `Organic / Grid keys / Fractal`, not raw enum values.
- Switch **Field** through all three.
- Console clean — `list_console_messages`, zero errors.
- Capture each scheme to `docs/mockups/2026-09-14-parquet-<scheme>-shipped.jpeg` and index them.

- [ ] **Step 3: Time the drift against a stopwatch**

Default `drift 10`, `DRIFT_RATE 0.0021` → a full traverse in ~48 s. Watch for 60 s: the tiling must
visibly arrive somewhere else without ever looking hurried. Confirm the swing term is doing its job —
after one traverse the picture must NOT be identical to the start. **If the feel needs changing, that is a
tuning literal: ask the owner with the traverse time, not the slider number.**

- [ ] **Step 4: Run every gate**

```bash
npm test
npm run lint
npx tsc -b --noEmit
npm run build
npm run size
npm run check:pwa
npm run check:preload
npm run check:cache
```

Expected: all pass. `npm run size` should show the entry chunk unchanged (this piece is a lazy chunk) and
the precache file count unchanged.

- [ ] **Step 5: Close out the docs**

- `docs/mockups/README.md`: add the shipped captures.
- The spec: fold in Revision 2's decisions — `showWhen` array form, no `Path2D`, no `reach`, the three
  gated variant enums, the `rampMapping` knob, the aperiodic swing term, and the measured drift.
- This plan: record Revision 3 (the three benchmarks and the three frame-cost figures), mark Status complete.

- [ ] **Step 6: Commit and push**

Stage explicit paths, never `git add -A` — review agents running in parallel write probe mutations into
the tree, and a blanket add has captured them before (the branch shipped red).

```bash
git add src/diversions/parquet-deformation docs/mockups docs/superpowers README.md docs/gallery.md
git commit -m "parquet-deformation: verified in Chrome, gates green"
git push -u origin feature/parquet-deformation
```

---

## Status

**Not started.** Revision 1 (2026-09-14): initial plan from the committed spec.
Revision 2 (2026-09-14): 14 must-fixes from the plan panel; two owner-escalated numbers resolved from the
mockup; `rampMapping` added as a knob after the owner asked whether the ramps were all staying as options.
