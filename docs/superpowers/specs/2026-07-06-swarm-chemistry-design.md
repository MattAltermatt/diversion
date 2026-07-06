# Swarm Chemistry — design spec (#217)

**Date:** 2026-07-06 · **Kind:** `webgpu` · **Slug:** `swarm-chemistry`

Hiroki Sayama's *Swarm Chemistry* (2007–09): Particle Life's organismal cousin. The
diversity lives in **per-species boids recipes** (kinematic), not a per-pair force
matrix (point attraction). Heterogeneous kinetic species mixed in one broth
**differentiate** into dense cores wrapped in orbiting shells, pulsating cells,
rotating rings — the "parts become a living whole" payoff.

Reference (authoritative source read, not reconstructed): Sayama's Swift port
`mitsuyoshi-yamazaki/SwarmChemistry` — exact parameters, update rule, border model,
and all 19 named recipes transcribed verbatim into `recipes.ts`.

## The algorithm (faithful port of Population.step)

Per-species **recipe** = 8 params (Sayama's names, ranges):
`R` neighborhoodRadius (0..300) · `Vn` normalSpeed (0..20) · `Vm` maxSpeed (0..40) ·
`c1` cohesive (0..1) · `c2` aligning (0..1) · `c3` separating (0..100) ·
`c4` probRandomSteering (0..0.5) · `c5` paceKeeping (0..1).

Per particle per step (a **discrete map**, no dt — position += velocity):
1. Neighbors = all j with `dist < R_i` (uses the particle's OWN R).
2. If neighbors: `accel = (avgCenter - pos)*c1 + (avgVel - vel)*c2 + Σ sep + steering + border`
   where `sep = (pos - posⱼ)/max(distⱼ², .001) * c3` (summed, NOT averaged),
   `steering` = with prob c4 a random vec in [-4.5,4.5]².
   Else: `accel = randomSmall + border`.
3. `v' = clamp(vel + accel, |·|≤Vm)` — velocity persists (momentum).
4. Pace-keep: `v' += v' * (Vn - |v'|)/|v'| * c5`, then clamp to Vm again.
5. `pos += v'`, clamp to arena bounds.

**Border repulsion** (Sayama, keeps the swarm centred): `repDist = 2*300 = 600` sim
units; `repulsive = pow(1 - min(x,W-x)/repDist, 10) * Vm²` pushing inward. Active
everywhere in a ~500–600 arena (that constant inward pull is WHY his swarms stay as
centred organisms — deliberate, kept).

### GPU translation (the one non-obvious correctness call)
Alignment reads **neighbour velocity** `vel[j]`, and the forces pass writes `vel[i]`
→ a cross-invocation read/write hazard (particle-life-gpu's forces never reads vel[j],
so it has none). Fix: a **separate `newVel` buffer**. `forces` reads `pos[]` + `vel[]`
(old), writes `newVel[i]`. `integrate` sets `vel[i]=newVel[i]`, `pos += vel[i]`,
clamp. No ping-pong beyond that extra buffer; the pass boundary is the sync point
(same rule as swarmalators/particle-life-gpu).

Per-step random steering: WGSL hash of `(i, step, seed)` (deterministic, seed-varied);
a `step` counter rides the params uniform.

## Coordinate / framing (the load-bearing call — tune density in Chrome)

Sayama tunes recipes for a ~500² field with R up to 300, so a "cell" is R-sized —
large relative to the field (few big organisms, not fine texture). To preserve that
scale on a wide gallery viewport: **fixed logical arena in Sayama-native units**
(short side ~600, long side = short × viewport-aspect), border repulsion on all
sides, **camera fits the arena exactly to the viewport** (aspect-matched → fills, no
crop/letterbox) — the particle-life-gpu arena+camera pattern with border-repulsion
instead of toroidal wrap. Sim runs in logical units; only render scale tracks pixels
(gotcha-viewport-independent-geometry-resize: arena width recomputes on resize, NO
reseed). Density (`count` vs arena size) is a measured-in-Chrome decision.

## Recipe / species data model (ship the seam)

`recipe` is the **headline top-level enum** (segmented/select) — which organism.
Recipe DATA (species rows) lives in `recipes.ts` keyed by name; the schema/codec only
carry the enum + count + look knobs (compact URL, reproducible). `count` = total
particles, distributed across the recipe's species by their weight proportions. Up to
`MAX_SPECIES = 6` rows (cellWithTwoNuclei has 6); recipe param buffer padded to 6×8.

**A live editable-recipe grid (#204 matrix-editor style) is a filed follow-up**, not
this pass — enum now, editable later.

## Schema (canon-aligned)

- `recipe` — enum, 19 Sayama recipes, section **Recipe** (headline). Default: TBD in
  Chrome (candidates: Jelly Fish / Pulsating Eye / Cell With 2 Nuclei).
- `count` — slider, total particles, section **Swarm**.
- `speed` — slider, steps/frame accumulator (< 1 = slow-mo), section **Motion**.
- **Color** section: `colorMode` segmented Palette | Recipe (Recipe = Sayama's
  c1/c2/c3→RGB, self-documenting); `Palette` colorList (species k → stop k);
  `background` dark default (#05070d).
- **Look**: `dotSize`, `glow` (two-layer core+halo), `trailFade`, `bloom` (#212 pattern, default off for perf).
- `seed` — number, `randomizeOnFreshLoad`, section **Advanced** `collapsed:true`
  (seeds positions + species assignment + steering stream).
- `worldMin` — arena short-side, section **Advanced** (density lever).

**Palette PresetGroup** = the color axis (canon). Recipe stays a field (drives sim
structure), not a preset.

## Render / framework wiring

Copy swarmalators + particle-life-gpu wholesale: ready-flag async `setup` (shared
device singleton), two-pass compute, persistent trail texture + fade, two-layer glow,
optional half-res separable bloom, camera pan/zoom/reset gated to the large view,
`speed` step accumulator, live-apply `update` (structural: recipe/count/seed/worldMin
→ false = re-setup; look knobs → writeBuffer). `teardown` frees buffers, never
`device.destroy()`.

## Out of scope (filed follow-ups)
- Live editable recipe grid (#204-style).
- Mouse poke into the broth (#208 was wontfixed; not here).
- Evolutionary recipe transmission on collision (Sayama's later work).

---

## Addendum — Evolutionary variant (2026-07-06, user picked "B")

The static-recipe piece works but each recipe reaches its structure and holds/
oscillates. The user wants the **evolutionary** Swarm Chemistry from Sayama's videos:
a broth that never settles — recipes transmit + mutate on collision, so structures
perpetually compete, dissolve and reform. Authoritative mechanism (Sayama 2009/2011;
arXiv:1804.03304, 2409.01469): **fixed N**, purely informational evolution (no
birth/death); on **collision**, a **competition function** decides which particle's
recipe is transmitted to the other, with **stochastic mutation**. Base competition =
**"majority"** (winner = the particle with more neighbours of the *same type* /
similar recipe) — Sayama found it the most open-ended.

### Data-model rework (species-index → per-particle mutable genome)
- Each particle owns its **own 8-param genome** (`genomeIn`/`genomeOut`, N×8 f32),
  not a species index into a fixed recipe table. Physics reads `genomeIn[i]`.
- `recipe` becomes the **seed distribution** (each particle starts with one of the
  recipe's species genomes) + a new **"Primordial Soup"** (random genomes). Evolution
  takes over from there.
- Colour is **per-particle from the genome** (Sayama's c1→R, c2→G, c3→B), so it flows
  and shifts continuously as recipes evolve — the natural evolutionary colour.

### Compute — three passes per step (GPU-correct, no hazard)
1. **forcesStats**: for each i, the neighbour loop computes boids forces (→`newVel[i]`)
   AND `sameTypeCount[i]` (# neighbours with `genomeDist < simThreshold`) AND the
   nearest collider index within `collisionR` (→`stats[i]`). Reads `genomeIn`, writes
   `newVel` + `stats`.
2. **transmission**: for each i, let j = its collider. Competition (`majority`:
   `sameTypeCount[j] > sameTypeCount[i]` → j wins; also `denser`/`faster`/`slower`
   options) → `genomeOut[i] = mutate(genomeIn[j])` if j wins, else `genomeIn[i]`.
   Reads `genomeIn` + `stats`, writes only `genomeOut[i]` — no cross-invocation hazard.
3. **integrate**: `vel=newVel`, `pos+=vel`, clamp; then `copyBuffer(genomeOut→genomeIn)`.

Mutation: each of the 8 params, with prob `mutationRate`, perturbed by a Gaussian
scaled to the param's range, clamped to `[0, max]`. Reuses the `pcg(i,step,seed)` hash.

### New schema knobs
`evolve` toggle (on = evolutionary, off = frozen static), `competition` enum
(Majority/Denser/Faster/Slower), `mutationRate` slider, `collisionRadius` (Advanced),
`simThreshold` genome-similarity (Advanced). `recipe` gains "Primordial Soup". Colour
from genome (recipe-hue), Palette preset axis retargeted or dropped.
