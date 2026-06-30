# Lenia — design spec

**Issue:** #139 · **Family:** continuous CA / convolution field · **kind:** `webgl` (float ping-pong) · **port:** hard

> Lenia (Bert Chan, 2018) generalises Conway's Game of Life to **continuous** space, time, and state.
> Each step convolves a single scalar field with a smooth ring-shaped kernel, then applies a bell-curve
> **growth function** centred at μ with width σ. Out of that fall the self-organising blobs Lenia is known for.

This diversion ships the **primordial-soup** form of Lenia: the whole field is seeded with smooth
low-frequency noise and left to churn perpetually — blobs condense, swim, merge, and dissolve forever.
No curated species, no glider seeding, no liveness watchdog (a full soup self-sustains, satisfying the
"never lands on a dead field" MUST for free).

---

## 🎯 Identity

- **id:** `lenia` · **title:** `Lenia` · **kind:** `webgl`
- **description:** *"A continuous Game of Life — a living broth where glowing cells endlessly condense, swim, merge, and dissolve."*
- Default look: **Cells** pattern × **Bioluminescence** palette, calm sim speed.

## 🏗️ Architecture (reuses the Gray-Scott host pattern)

Lenia maps almost 1:1 onto `src/diversions/grayscott/` — the same RGBA32F ping-pong field, sim-frag +
display-frag-with-LUT, fractional-speed accumulator, `EXT_color_buffer_float` + `OES_texture_float_linear`
guards, and aspect-capped sim resolution. Files mirror that diversion:

```
src/diversions/lenia/
  schema.ts        # Zod schema (single source of truth): pattern/μ/σ/simSpeed/seed/stops
  presets.ts       # Pattern axis (R,μ,σ,dt,β bundles) + Color axis (gradient stops)
  field.ts         # simDims (aspect cap), seedField (smooth noise), buildKernelLUT, buildLUT
  gl.ts            # initGL / step / render / uploadLUT / disposeGL  (ping-pong + convolution)
  index.ts         # defineDiversion: setup/frame/update/teardown + two preset axes
  *.test.ts        # co-located: schema selection, presets, field determinism, codec round-trip
```

### The two differences from Gray-Scott

1. **Single scalar field** (not two coupled chemicals). Stored in one channel of the RGBA32F texture
   (use `.r`; other channels unused but the texture stays RGBA32F for render-target compatibility).

2. **Wide ring-kernel convolution + Gaussian growth** replaces the 9-tap Laplacian + reaction:

   ```glsl
   // potential U(x) = Σ over neighborhood of K(r) * field(x+offset),  with Σ K = 1 (normalized)
   // growth   G(u) = 2 * exp(-(u-μ)² / (2σ²)) - 1        // bell mapped to [-1, +1]
   // update   field' = clamp(field + dt * G(U), 0, 1)
   ```

### Convolution performance plan (the `port:hard` crux)

- **Kernel as a precomputed 1-D radial LUT, sampled by distance.** The ring kernel is radially
  symmetric, so the shader loops the `(2R+1)²` neighbourhood, computes distance `r`, and samples a
  tiny 1-D kernel texture `K(r)` built CPU-side from the `kernel` field's β ring-weights (normalised
  so Σ=1). Cheaper than an analytic `exp()` per tap, and bakes β in for free.
- **The ring kernel is NOT separable** — a radial ring can't factor into 1-D passes — so we eat the
  full 2-D neighbourhood. No shortcut.
- **`kernelRadius` (R) modest, ~10–13.** Smaller R is finer soup *and* quadratically cheaper
  (R=10 → 441 taps vs R=13 → 729). The shader's loop bound must be a compile-time constant in
  GLSL ES 3.00, so R is compiled into the sim shader — a change to `kernelRadius` recompiles
  (re-runs `setup`, see `update`).
- **Fixed `dt` constant baked in `gl.ts`** (like Gray-Scott's `DT = 1.0`), *not* a schema field —
  `simSpeed` (steps/frame) is the sole user-facing time control, so there's no redundant dt/speed pair.
- **Aspect-capped sim resolution (~512 long edge)**, internal (not user-exposed), like Gray-Scott's
  `simDims`. The display pass samples in normalized UV and stretches to fill the canvas, so the field
  survives window/fullscreen resize with no realloc or reseed.
- **Fractional steps/frame accumulator**, calm default `simSpeed ≈ 2`. Lenia's dt is small, so motion
  comes from several small steps — but zen means we keep it gentle. Exact R / resolution / steps are
  **verify-time tuning** (🎚️ measured against real frame budget in Chrome to hold 60 fps).

## 🎛️ Config schema (single source of truth)

Every knob — including the structural kernel ones — is a **real schema field**, so the full-snapshot
URL codec captures the entire look and a shared link reproduces it exactly (framework keystone). The
preset axes patch only these fields (standard `Partial<Config>` path; no out-of-band data).

```text
Simulation
  simSpeed  number  slider 0.1–12, step 0.1, default ~2
            help: sub-steps per frame; below 1 runs a step every few frames for a slow drift
  seed      int     number, default = fresh random per load
            help: each reload grows a different soup; same seed restarts identically; a link pins it

Advanced  (raw μ/σ on a thin viable band — most values away from a preset give a dead or saturated field)
  mu        number  slider, narrow band (≈0.10–0.40), default from preset (Cells)
            help: growth center — where the bell peaks; the soup's character knob
  sigma     number  slider, narrow band (≈0.01–0.07), default from preset (Cells)
            help: growth width — how forgiving the band is; wider = softer, blobbier

Kernel  (structural — a change recompiles/rebuilds and reseeds via setup; discoverable per UX inv. #2)
  kernelRadius  int   slider 8–14, step 1, default 12
            help: ring size — bigger cells & coarser soup, but quadratically more costly per step
  kernel    enum  'Smooth' | 'Layered', default 'Smooth'
            help: ring profile — Smooth is one soft ring; Layered stacks concentric rings for richer texture

Color
  stops     colorList 2–8 (6-hex, opaque), default Bioluminescence
            help: field value maps along these — lowest is empty background, highest is dense core
```

`dt` is **not** a schema field — it's a fixed constant in `gl.ts` (Gray-Scott bakes `DT` the same way);
`simSpeed` is the sole time control. `kernel` enum → β ring-weights mapped CPU-side in `field.ts`
(`Smooth` = single soft ring `β=[1]`; `Layered` = concentric `β=[1, ⅔, ⅓]`).

## 🎨 Presets (two independent axes, like Gray-Scott / Physarum)

**Pattern** — a standard `Partial<Config>` patch of `{ mu, sigma, kernelRadius, kernel }`, all real schema
fields. `mu`/`sigma` morph the field live; `kernelRadius`/`kernel` are structural (a switch that changes
them re-runs `setup`). Starting values are 🎚️ verify-time — confirmed to *sustain* (neither die nor
white-out) in Chrome:

```text
Cells     — round pulsing blobs that bud and divide        (recommend default)
Worms     — elongated filaments that crawl and writhe
Coral     — dense branching reef-like mesh
Plankton  — sparse drifting droplets on open space
```

**Color** — gradient `stops[]`, dark background → bright core, high contrast (UX invariant #5):

```text
Bioluminescence  deep navy → teal → white-hot cores   (default)
Ember            black → blood-red → gold
Jade             dark forest → emerald → pale mint
Spectral         indigo → cyan → yellow → magenta
```

`matchPresets` flips an axis to "Custom" the moment a manual μ/σ or color edit drifts off the preset.

## 🔁 Lifecycle (`defineDiversion`)

```text
setup(gl, cfg, size)   → initGL: compile sim+display programs (R compiled in), alloc RGBA32F
                         ping-pong + FBOs, seed smooth-noise field, build kernel LUT + color LUT
frame(state, gl)       → set viewport; render(): advance floor(stepAcc += simSpeed) steps
                         (each = convolve→growth→clamp src→dst), then display current field via LUT
update(state, cfg)     → live-morph path:
                           • seed OR kernelRadius changed → return false
                             (framework falls back to teardown + setup — fresh field / recompiled shader)
                           • kernel (β) changed (R same) → rebuild kernel LUT in place, swap cfg, return true
                           • stops changed → uploadLUT in place
                           • mu/sigma/simSpeed changed → swap state.cfg (sim reads them as uniforms)
                           • return true
teardown(state)        → disposeGL: delete programs, VAO, textures, FBOs (no ctx arg — uses stashed gl)
```

`mu`, `sigma`, `simSpeed` are **sim-shader uniforms** read each step, so they morph the existing field
live. `seed` and `kernelRadius` are structural → teardown path (R is a compile-time shader constant).
`kernel` (β) only re-uploads the kernel LUT, so it stays on the live path. This matches Gray-Scott's
`update` contract (seed reseeds; μ/σ drag live; LUT swaps in place).

## 🌱 Seeding (smooth primordial soup)

`seedField(seed, w, h)` fills the field channel with **smooth low-frequency noise** in `[0,1]` — not
per-texel white noise (which the kernel would just average to a flat grey and the growth function would
collapse). Approach: value/Perlin-style noise at a coarse cell size (a few cells across the field),
deterministic from `seed` (anti-regression: same seed → identical field, unit-tested). REPEAT wrap so
the soup is toroidal and blobs that drift off one edge re-enter the other.

## ✅ Testing (co-located Vitest, anti-regression must-haves)

- **Codec round-trip + resilience** — every field encodes/decodes; an invalid field reverts to its own
  default, the rest survive (framework keystone).
- **Control-selection-from-schema** — μ/σ/simSpeed/kernelRadius render as sliders (bounds present),
  kernel as a select, stops as colorList, seed as number; sections group correctly.
- **Field determinism** — `seedField(seed,…)` is identical for the same seed, different across seeds.
- **Kernel LUT** — `buildKernelLUT(R, kernel)` is normalised (Σ≈1) and radial; `Smooth` vs `Layered`
  differ; smoke test.
- **Presets** — each Pattern patch carries `{mu, sigma, kernelRadius, kernel}`; each Color patch a valid stops[].

## 🚫 Out of scope (v1) — follow-ups for #139's tail

- **Bloom / additive glow pass.** v1 gets luminosity from the palette (dark bg + bright cores) on the
  smooth field. If it reads flat in verify, a separable blur+add pass is a clean, self-contained follow-up.
- **Curated species / Orbium glider mode.** The user chose soup-only; a "Creatures" mode (seed known
  species + respawn watchdog) is a possible later axis but explicitly deferred.
- **Multi-channel / extended Lenia, free-form kernel-β editing.** v1 exposes R (slider) and a
  two-option `kernel` ring profile; arbitrary per-ring β editing and multi-channel coupling are not v1.

## 📚 References

- Bert Chan, *Lenia — Biology of Artificial Life* (2019). Demo: https://chakazul.github.io/lenia.html
- https://en.wikipedia.org/wiki/Lenia
- Reuse reference in-repo: `src/diversions/grayscott/` (host pattern), `src/diversions/physarum/` (two preset axes).
- Relevant gotcha: RGBA32F + LINEAR reads 0 unless `OES_texture_float_linear` is `getExtension`'d
  (uniform-background symptom) — guard exactly as Gray-Scott does.
