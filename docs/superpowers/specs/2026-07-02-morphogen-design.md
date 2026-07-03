# Morphogen — design spec (#189)

**Kind:** `webgl` · **Size:** M · **Substrate:** Gray-Scott's GPU scaffold, reused verbatim.

Developmental-biology screensaver. Diffusing **morphogen** chemicals form smooth
**gradients** from seeded sources; each pixel reads its LOCAL concentration and is
assigned a **fate** (a territory / band color). A blank field resolves into crisp,
globally-organized positional patterns — cell-fate **territories** (leopard/coat),
Wolpert's **French flag**, concentric **eyespots**, embryo **segments** — and keeps
slowly reforming forever. *Turing makes texture; Morphogen makes anatomy.*

Design was resolved by a 3-agent dueling panel (Wolpert-interpretability lens ·
rich-biological lens · adversarial falsifier). This spec records the synthesized calls.

## The load-bearing call (falsifier wins the default)

The naïve "threshold a summed scalar field → French-flag stripes" version is a
posterized **lava lamp** that collides with three shipped pieces (Metaballs, Plasma,
Gray-Scott). Two decisions save it — both also independently reached by the designers:

1. **Fate = argmax / dominance** (soft-Voronoi **territories**), NOT threshold-of-sum.
   Each source owns a diffusion channel; a pixel's fate = *which source's signal wins
   here* — literally positional information. Overlap zones become crisp curved borders.
   No territory-map piece exists in the gallery → this is the distinct default.
2. **Aliveness from topological events** (source **birth/death** + threshold **sweep**),
   NOT imperceptible continuous drift. A source fades in/out over ~2 s and lives
   ~30–90 s; when it dies neighbors flood its territory — a *visible* reorganization.

The Wolpert money shot survives as first-class presets via a second fate mode:
`fateMode: 'bands'` thresholds a scalar readout (single channel, or the opposing ratio
`R/(R+G)` for `poles`) → **French Flag / Eyespot / Segments**. The breathing-poles
French flag *rescales* as the poles converge — the famous robustness result, kinetic.

Per *the-user-has-no-idea*: ship every viable look as a **preset + knob** so the user
tweaks against pixels, not prose.

## Model (SIM shader)

- **4 morphogens** packed into one `RGBA32F` texel (R,G,B,A = M0..M3). `morphogenCount`
  (1..4) limits active channels; `sourceCount` (>channels ok) distributes sources across
  channels → multiple same-hue patches (a coat).
- Sources = seeded list (≤8) in normalized [0,1] space, each `{pos, radius, channel,
  strength, shape ∈ point|vLine|hLine}`. Recomputed on CPU each frame (drift + birth/death),
  uploaded as uniform arrays (like plasma's per-frame uniforms).
- Step (all 4 channels at once, GS's normalized 9-pt stencil verbatim: ortho 0.2, diag
  0.05, center −1):
  `nc = c + D·lap(c) − k·c` then **Dirichlet-ish injection** `nc[ch] = max(nc[ch], strength)`
  inside each source footprint (self-limiting — clamps at 1, never blows out, never dead),
  then optional Allen–Cahn sharpen `+ γ·c·(c−0.5)·(1−c)`, then `clamp(nc,0,1)`.
  - `D = 1.0`, `dt = 1.0` (GS's normalized stencil is stable here).
  - decay `k` exposed as **`gradientReach` λ** (fraction of short screen dim);
    `k = D / (λ·simMinSide)²`. Default reach 0.6.
  - **Allen–Cahn is monostable** (`+φ−φ³` shape) → sharpens interfaces but CANNOT
    nucleate new spots → provably not Turing (falsifier's blessing + guardrail: if spots
    appear in uniform field far from any source, back off). Default `reactionCoupling = 0`.
- Wrap `CLAMP_TO_EDGE` (gradient must not toroidally bleed). Aspect-corrected distance so
  rings stay round.
- **Grid is small** (~96 px, `gridResolution` 48..192). Smooth field upscales flawlessly
  with LINEAR; small L relaxes fast (crossing time ≈ L²/D). Distinctness lever vs GS's 640.
- Seed the field with the source footprints at strength (frame-1 isn't black → good thumb).

## Fate reading (DISPLAY shader)

`fwidth`-anti-aliased everywhere (crisp borders, no stair-step / mach-band / crawl).

- `fateMode: 'territories'` (default): `terr = argmax_i c[i]` over active channels;
  `local = c[terr] / ref` = position up the winner's gradient. Color = territory hue
  (`territoryColors[terr]`) shaded by `local` through the ramp, blended by `territoryMix`
  (0 = shared ramp, 1 = distinct hues). Thin AA outline at the argmax border
  (`edgeStrength`). Fade sub-threshold ground to background.
- `fateMode: 'bands'`: `p` = scalar readout (single channel, or opposing ratio for poles),
  reshaped by `bandGamma`, quantized into `bands` (2..6) via `smoothstep` thresholds →
  color from the LUT. `banding` (0..1) morphs edge width from raw-gradient → razor bands.
  `gradientUnderlay` keeps a faint gradient visible inside flat bands.
- LUT = GS's 256×1 RGBA8 (`buildLUT(palette)`), reused byte-for-byte. Territory hues =
  a `vec3[]` uniform baked from `territoryColors`.

## Schema (sections; sliders all bounded; every field helped)

- **Simulation:** `simSpeed` (1..32, def 8) · `gridResolution` (48..192, def 96) ·
  `seed` (int, `randomizeOnFreshLoad`).
- **Morphogen:** `sourceLayout` select `scatter|poles|point|edge|triad` (def `scatter`) ·
  `morphogenCount` (1..4, def 4) · `sourceCount` (2..12, def 6, `showWhen` scatter/triad) ·
  `gradientReach` (0.2..1.5, def 0.6).
- **Fate:** `fateMode` select `territories|bands` (def `territories`) ·
  `bands` (2..6, def 3, `showWhen` bands) · `banding` (0..1, def 0.9, `showWhen` bands) ·
  `territoryMix` (0..1, def 0.65, `showWhen` territories) · `edgeStrength` (0..1, def 0.4) ·
  `gradientUnderlay` (0..0.5, def 0.15, `showWhen` bands).
- **Advanced:** `reactionCoupling` (0..1, def 0) · `bandGamma` (0.5..2, def 1).
- **Motion:** `driftSpeed` (0..3, def 1) · `reorganize` (0..1, def 0.5 — birth/death rate).
- **Color:** `palette` colorList (bands ramp, def French flag `#1d3fb0,#f4f4f8,#c1272d`) ·
  `territoryColors` colorList (hues, def `#ffb300,#ff4d6d,#3ad1ff,#7b2ff7`).

`update()`: structural fields (`gridResolution`, `sourceLayout`, `morphogenCount`,
`sourceCount`, `seed`) → return false (re-setup, like GS's seed); everything else is a
live uniform, `palette` re-uploads the LUT.

## Presets (two independent axes)

- **Body plan** (patches layout + fate + counts + sharpness): `Territories` (default,
  scatter/argmax/leopard) · `French Flag` (poles/bands/3) · `Eyespot` (point/bands/4 rings) ·
  `Segments` (edge/bands/6 stripes) · `Lush` (scatter, rings-inside-territories signature).
- **Palette:** `Butterfly` · `Savanna` · `Embryo` · `Coral Reef` · `French Flag`.

## Motion / unattended loop (all seeded, in `frame()`)

Three calm, incommensurate layers → hours of non-repeating reformation, never static/dead:
1. Source **drift** — seeded slow orbits, amplitude ~10% domain, periods 48–126 s.
2. Threshold **sweep** — band phase / argmax margin breathes (cheap always-alive lever).
3. Source **birth/death** — Poisson-ish (seeded), fade in/out over ~2 s, life ~30–90 s →
   perceptible topological reorganization. `reorganize` scales the rate; `driftSpeed`
   scales orbit amplitude. No hard `shouldRestart` reseed (birth/death gives smooth
   macro-variety without a jarring jump).

## Distinctness vs Gray-Scott (one line)

GS = statistically-uniform texture (coral/dots/maze edge-to-edge, no anchor, restless
pixel churn). Morphogen = globally-organized anatomy anchored to visible source loci —
few large flat territories with crisp curved borders, distinct hues, gradients banded into
rings/stripes, motion that reorganizes *as a body* on source events. One is a material;
the other is a body plan. No spot ever nucleates from empty field → provably positional,
not Turing.
