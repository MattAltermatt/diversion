# Swarmalators — design spec

**Issue:** #215 · **Date:** 2026-07-01 · **Kind:** `webgpu` · **Family:** Particle Life sibling (emergent, self-organizing, GPU compute)

> Self-propelled particles that **swarm in space *and* sync in phase**, coupled. Where
> Particle Life carries diversity in a per-pair force matrix, a swarmalator carries a
> single **phase** (an internal oscillator), and space ⇄ phase pull on each other. The
> emergent payoff is the iconic **rainbow ring** and its living cousins — a colored
> annulus that, at the right coupling, slowly rotates and breathes.

Model: O'Keeffe, Hong & Strogatz, *"Oscillators that sync and swarm,"* Nat. Commun.
8:1504 (2017) — arXiv:1701.05670v2. Every constant below is quoted from the paper and
cross-checked against real implementations (Brockmann's Complexity-Explorable).

---

## 1. The model (verified)

Per particle `i`: position `xᵢ ∈ ℝ²`, phase `θᵢ ∈ [−π, π)`. **First-order / overdamped** —
velocity *is* the force sum (no inertia, no friction, unlike Particle Life):

```
ẋᵢ = (1/N) Σ_{j≠i} (xⱼ−xᵢ) · [ (1 + J·cos(θⱼ−θᵢ)) / r  −  1 / r² ]
θ̇ᵢ = ωᵢ + (K/N) Σ_{j≠i} sin(θⱼ−θᵢ) / r
      where r = max(|xⱼ−xᵢ|, ε)     ← softening; see §4
```

- Constants `A = B = 1` (paper rescales time/space to fix them). Two live knobs remain: **J** and **K**.
- **J** ∈ [−1, 1] — how much phase similarity biases spatial attraction (like-phase attract). Clamped to keep attraction positive.
- **K** ∈ [−1, 1] (interesting states are `K ≤ 0`) — phase-coupling strength; distance-weighted `1/r`.
- **ωᵢ** — natural frequency. `0` for the canonical five states; a small per-particle spread is an optional "shimmer" knob (see §5).
- **Center of mass is conserved** (force is antisymmetric: force on `i` from `j` = −force on `j` from `i`, since `cos Δθ` is symmetric). With centered initial conditions the swarm never drifts → **no re-centering pass, no auto-fit reduction needed**.

### The five collective states — ship as presets

All with `A=B=1, ω=0`. Coordinates are the paper's Fig. 2/5 values, confirmed by demos:

```text
state                    J      K       look
-----------------------  -----  ------  ---------------------------------------------
Active phase wave  ★def   1.0   -0.75   annulus whose particles run around it; the
                                        rainbow rotates & breathes — ALWAYS MOVING
Splintered phase wave    1.0   -0.10   ring breaks into oscillating colored clusters
Static phase wave        1.0    0.00   the frozen "rainbow ring" (space↔phase locked)
Static sync              0.1    1.00   a single-color disk (all phases synced)
Static async             0.1   -1.00   a disk with every phase present, no correlation
```

Default preset = **Active phase wave** — it is the one that keeps moving on its own, so
the screensaver opens alive (zen invariant: always moving, always beautiful). The
static states settle to a still image; they are reachable via the preset dropdown and
can be re-livened with the shimmer knob (§5).

---

## 2. Architecture — clone the `particle-life-gpu` seam

Same five-file shape, auto-registered by the registry glob. Departures from Particle
Life are called out.

```text
src/diversions/swarmalators/
  schema.ts     single source of truth (form + URL codec + Config type)
  pack.ts       PURE: CPU-seed the world + lay out uniform/storage bytes (jsdom-testable)
  gpu.ts        WGSL compute (2-pass) + render (instanced glow + trail) + lifecycle helpers
  index.ts      framework wiring: ready-flag async setup, simple zoom/pan, live-apply update()
  presets.ts    the five states (one PresetGroup "State")
  *.test.ts     co-located unit tests
```

**Reused wholesale from `particle-life-gpu`:** the ready-flag async `setup` (shared
`getSharedDevice()`), the two-pass compute structure (forces → integrate, no ping-pong),
the persistent accumulation texture + trail-fade + two-layer glow render, the
speed-accumulator (`steps/frame`), and the URL-codec / seed-pin keystone.

**Departures (all authentic to the model, and simpler):**
1. **Free space, not toroidal** — no `wrapDelta`, no `rMax` cutoff (coupling is genuinely long-range/all-pairs). Integrate writes raw `pos += vel*dt` with no wrap.
2. **First-order integration** — `vel` is the force sum each step, not accumulated with friction.
3. **Per-particle phase `θ`** (extra `f32` storage buffer) with its own accumulator `θ̇`.
4. **Color from phase in the fragment shader** — no per-species palette buffer. A cyclic colormap maps `θ → rgb`.
5. **Fixed centered view** — camera maps world-origin-centered coords at a fixed fit scale (world radius ≈1.6 → ~90% of min screen dim); optional zoom/pan multiplies/offsets it. No arena-clamp logic.
6. **No `reconcile` hook** — there is no matrix to rebuild; `seed`/`count` are the only structural fields.

### GPU buffers

```text
buffer     type            pass          notes
---------  --------------  ------------  -----------------------------------------
pos        array<vec2f>    compute R/W   seeded uniform in [−1,1]²
phase      array<f32>      compute R/W   seeded uniform in [−π,π)
vel        array<vec2f>    compute R/W   written by forces, read by integrate
phaseVel   array<f32>      compute R/W   written by forces, read by integrate
omega      array<f32>      compute R     per-particle base ω ~ N(0,1), seeded;
                                          scaled live by omegaSpread param
params     uniform         compute       N, invN, J, K, dt, eps, omegaSpread
view       uniform         render        scale, centerX/Y, viewport, dot/halo radii, colorMap
fade       uniform         render        bg rgb + trail alpha (verbatim from PL)
```

Two-pass, no ping-pong (identical hazard argument to Particle Life: each invocation
writes only slot `i` of the buffer it mutates; forces never writes the pos/phase it
reads; the compute-pass boundary is the sync point).

---

## 3. Compute WGSL (sketch)

```wgsl
@compute fn forces(i):
  if i>=N: return
  let pi = pos[i]; let thi = phase[i]
  var fx=0.0; var fy=0.0; var fth=0.0
  for j in 0..N:
    if j==i: continue
    let dx = pos[j] - pi
    let r  = max(length(dx), eps)
    let a  = (1.0 + J*cos(phase[j]-thi)) / r  -  1.0/(r*r)
    fx += dx.x*a;  fy += dx.y*a
    fth += sin(phase[j]-thi) / r
  vel[i]      = vec2f(fx,fy) * invN
  phaseVel[i] = omega[i]*omegaSpread + K*invN*fth

@compute fn integrate(i):
  if i>=N: return
  pos[i]   = pos[i] + vel[i]*dt
  var th   = phase[i] + phaseVel[i]*dt
  phase[i] = th - TAU*floor((th+PI)/TAU)   // wrap to [−π,π) so floats stay bounded
```

Render: instanced vertex-pulled quads (verbatim from PL) but the fragment computes
`color = phaseToRGB(phase[ii], colorMap)`; two-layer glow (additive halo under opaque
core) and trail-fade carry over unchanged.

### Phase → color (cyclic colormaps, in-shader, no LUT)

Phase is genuinely cyclic, so the map MUST be cyclic (0 and 2π identical) or a false
seam appears. Three options via the `colorMap` field:

- **Spectrum** (default) — OKLCH cyclic wheel at fixed `L≈0.72, C≈0.13`, `hue = θ`, converted OKLCH→OKLab→linear-sRGB in ~25 lines of WGSL. Perceptually uniform rainbow, matches the repo's OKLCH ethos — the gallery-grade ring.
- **Sinebow** — `sin²` offset primaries; cheap, smooth, guaranteed-correct cyclic fallback.
- **Pastel** — OKLCH with higher `L`, lower `C`; soft/dreamy variant.

---

## 4. Numerics (verified defaults; tune the two starred ones in Chrome)

```text
param          value          rationale / source
-------------  -------------  ------------------------------------------------
IC position    uniform [−1,1]²  paper §Model; centered → COM stays put
IC phase       uniform [−π,π)   paper
dt         ★   0.02           paper uses 0.1 (static) / 0.01 (active, Heun).
                              Forward-Euler + softening wants the low end;
                              0.02 is a safe start — verify active state.
softening ε ★  0.01           ~1% of disk radius. NOT in the paper (they use
                              adaptive solvers); REQUIRED for fixed-step GPU
                              Euler or the 1/r² term NaNs when two coincide.
view radius    1.6            IC corner radius √2≈1.41; active orbits ≈1.2 →
                              1.6 shows all states with margin.
speed          steps/frame accumulator (PL pattern); dt fixed, so speed never
               changes the outcome, only playback rate.
```

`dt` and `ε` are **mechanism/stability constants, not gameplay balance** — pick safe
defaults, confirm the active state neither freezes nor explodes in Chrome, adjust if
needed. (Not sacrosanct-tuning; no ask required for a stability fix.)

---

## 5. Schema (fields, sections, UX)

Follows the repo's `.meta({ ui, label, help, min, max, step })` convention; every field
gets persistent help (UX invariant #3). Sliders only where bounds are defined (#4).

```text
section    field         ui         range/default          help gist
---------  ------------  ---------  ---------------------  --------------------------------
Swarm      count         slider     500–16000, d=3000      how many particles (GPU O(N²))
Coupling   J             slider     −1..1, step .05, d=1    phase→space: like-phase attract
Coupling   K             slider     −1..1, step .05, d=-.75 phase sync strength (≤0 = the
                                                            interesting states)
Coupling   omegaSpread   slider     0..1, step .02, d=0     "shimmer": per-particle freq
                                                            spread; livens static states,
                                                            0 = pure canonical model
Look       colorMap      segmented  Spectrum|Sinebow|Pastel color-from-phase wheel
Look       dotSize       slider     1..5, d=2.5            particle radius (px)
Look       glow          toggle     d=true                soft luminous blobs
Look       trailFade     slider     0..0.6, d=0.12         motion-trail persistence
Look       background    color      d=#05070d             trails fade toward this
Motion     speed         slider     0.02..4, step .02, d=1  playback speed (slow = zen)
Advanced   seed          number     d=1337, PIN-ONLY       rolls IC positions/phases/ω;
                                                            randomizeOnFreshLoad:true
```

Interaction (reused, simplified from PL): scroll = zoom toward cursor, drag = pan,
double-click = reset view; gated to large canvas (`clientWidth ≥ 480`) so gallery tiles
don't hijack scroll. Default view = whole swarm centered.

### Presets — one `PresetGroup` "State"

Each option patches `{ J, K, omegaSpread }` (top-level spread). Order = the K-descending
tour at J=1, then the two J=0.1 states:

```text
Active phase wave (default)  { J:1,   K:-0.75, omegaSpread:0 }
Splintered phase wave        { J:1,   K:-0.10, omegaSpread:0 }
Static phase wave  (ring)    { J:1,   K: 0.00, omegaSpread:0 }
Static sync                  { J:0.1, K: 1.00, omegaSpread:0 }
Static async                 { J:0.1, K:-1.00, omegaSpread:0 }
```

---

## 6. Live-apply (`update()`)

Structural (return `false` → re-setup, reseeds/reallocs): **count, seed**.

Live (write uniforms/buffers in place, no realloc): **J, K, omegaSpread** (params),
**colorMap, dotSize** (view), **glow, trailFade, background** (fade/view), **speed**
(read each frame). Mirrors PL's `writeParams`/`writeView`/`writeFade` split.

> ⚠️ Live-editable-field gotcha: every live field MUST be wired into `update()`'s
> write-trigger or edits never reach the GPU ("nothing until reset"). J/K/omegaSpread →
> `writeParams`; colorMap/dotSize → `writeView`.

---

## 7. Performance

Genuinely all-pairs `O(N²)` — the coupling is long-range, so (unlike boids) you cannot
neighbor-cull without changing the states. Per-pair cost is slightly higher than
Particle Life (a `cos`, a `sin`, two divides vs a table lookup). PL held 60fps to
~24–30K (all-pairs, M-series). Start `count` default 3000, max 16000; **measure the true
60fps ceiling in Chrome and lower `max` if needed** (measured-in-Chrome decision, per
the WebGPU count gotcha). Reduced-motion + pause models inherited from the framework.

---

## 8. Testing (anti-regression)

- `pack.test.ts` — seed determinism (same seed → byte-identical pos/phase/omega), IC in `[−1,1]²`/`[−π,π)`, `packParams`/`packView` byte layouts, softening/dt constants present.
- `schema.test.ts` — every field has label + help; sliders have min/max/step; seed is `randomizeOnFreshLoad`.
- `presets.test.ts` — the five states carry the exact `(J,K)` coordinates; `matchPresets` flips to Custom on drift.
- Framework sweeps (codec round-trip/resilience, control-from-schema, diversion smoke) pick the piece up automatically via the registry glob.

Chrome verify (required, not optional): open each preset; confirm the **rainbow ring**
reads on Static phase wave, the **active wave visibly rotates/breathes**, no NaN
blowout, 60fps at default count, zoom/pan works, slow speed reads as zen.

---

## 9. Out of scope (backlog candidates)

- Mouse "stir" tool (drag a local phase/space perturbation) — the interactive-poke pattern (#208) applied here.
- Colormap gallery beyond the three (Crameri `vik`/`romaO`, twilight via LUT).
- 3D swarmalators (arXiv:1901.09293) — a separate `webgpu` piece.
- Natural-frequency *distributions* (bimodal, Lorentzian) for exotic states.
