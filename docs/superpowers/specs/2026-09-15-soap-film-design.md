# Soap Film — design spec

**Issue:** [#363](https://github.com/MattAltermatt/diversion/issues/363) · **Date:** 2026-09-15 · **Slug:** `soap-film` · **Kind:** `webgl` · **Size:** M

The screen is a soap film seen head-on. It forms nearly colourless, thins, blooms
into the Newton colour series, is stirred by thin patches rising through it, goes
black at the top, and tears. Then it forms again.

**The colours come out of the film's thickness, not out of a palette.** There is no
palette field in the schema: the magenta, gold, blue and silver are the reflectance
of a film of that thickness, integrated against the CIE 1931 observer.

⚠️ Stated carefully, because the first draft overstated it and the panel was right to
say so. Provenance is not a visual feature — a viewer cannot see where a colour came
from, and `foam` already ships a hand-picked four-stop palette literally named "Soap
Film" in the same hue family. **The property the physics actually buys is
desaturation with order**: twenty fringes that read as twenty *different* fringes
rather than a repeating rainbow, because each successive order overlaps more
wavelengths and washes out. A four-stop palette cannot do that; the integral gets it
for free. That is the visual claim, and it is the one being made.

The piece also contains chosen colours — `background`, `exposure`, `illuminant`,
`filmIndex`, and the rupture's rim. `exposure` in particular is doing real work: a
film reflects about 8%, so the image is the measurement scaled up until it is
visible.

## Provenance

- **Thin-film reflectance** — the Airy (Fabry–Pérot) form for a symmetric
  air–film–air layer. Real-time formulation from **Belcour & Barla**, *A Practical
  Extension to Microfacet Theory for the Modeling of Varying Iridescence*,
  SIGGRAPH 2017. <https://hal.inria.fr/hal-01518344/document>
- **`KHR_materials_iridescence`** — the same model as shipped GLSL, with the
  Fourier-series sensitivity fit.
  <https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_iridescence/README.md>
- **Marginal regeneration** — **Gros et al.**, "sliding puzzle" dynamics;
  <https://arxiv.org/pdf/2109.07966> and the review *The Life of a Surface Bubble*
  <https://arxiv.org/pdf/2102.06962>. Drainage measurements and the 400× discrepancy:
  <https://arxiv.org/html/2401.03931>. Plume imagery: **Berg, Adelizzi & Troian**,
  *Images of the Floating World*, Phys. Fluids 16(9) 2004.
- **CIE observer fit** — Wyman, Sloan & Shirley, JCGT 2013 (used in the mockup's
  offline LUT; the shipped shader uses Belcour's closed form).

Clean-room: implemented from published descriptions. No code is taken from any of
the above.

## The mechanism

### Colour

Reflectance of a film of geometric thickness `d` at refracted angle `θₜ`:

```
δ(λ) = 4π·n·d·cos θₜ / λ
R(λ) = 4R₁·sin²(δ/2) / ( (1−R₁)² + 4R₁·sin²(δ/2) )
```

`R₁` is the single-interface Fresnel intensity reflectance. **This form already
carries the half-wave phase shift at the first surface**, so `R → 0` as `d → 0` —
Newton black film falls out rather than being special-cased. Colour is the spectral integral of `R(λ)` against the observer.
**It ships as a baked 1-D LUT indexed by optical thickness `n·d·cos θₜ`**, built on
the CPU by that integral and uploaded as an `RGBA32F` texture: one fetch in the
shader, and it is *provably* the reference because it **is** the reference. A
closed-form sensitivity series was specified here first and was wrong four
independent ways; see the plan's Revision log.

Worth recording, because it sharpens the argument below: at a soap film's
reflectance (R₁ ≈ 0.02 at n = 1.33) the Airy series' **second harmonic is 50× smaller
than the first** — verified numerically. So multiple-beam Airy and a plain two-beam
cosine are visually identical here. The objection to the cheap approximation is
therefore **not** about two-beam versus Airy at all; it is entirely about
integrating over wavelength versus sampling three of them.

Two traps, both documented in Filament's implementation and both live here:

- **The interference math needs `highp`.** The Gaussian fits are stated in inverse
  metres with amplitudes around `1e-13`; `mediump` cannot represent them.
- **A thickness → 0 guard is NOT needed on the LUT path**, and the version this spec
  carried before the panel was dead code anyway: Filament's `smoothstep(0.0, 0.03, t)`
  is stated against a thickness in **micrometres**, so transcribing the same constant
  against nanometres makes it a no-op above 0.03 nm — smaller than an atom. The LUT's
  entry at `d = 0` is the integral's own value there, which is zero. Nothing to guard.

**The cheap three-cosine version is not an acceptable substitute**, and the
rejection is measured rather than asserted — see `docs/mockups/2026-09-15-thinfilm-lut.html`
and its two captures. Above about 1500 nm the spectral model's **luminance** converges (0.0393 and flat
out to 10 µm) while its chroma settles to a low, slowly wobbling pink-beige
(saturation ≈ 0.25, ranging 0.15–0.34) — it is *not* a neutral grey, and the spec
said so until the panel measured it. The cheap version instead keeps painting vivid
saturated bands out past 10 µm, is 35% too dark at 200 nm and 51% too bright at
1500 nm, and inverts the saturation ordering of the first orders. It also starts *bright* at zero
thickness, having dropped the phase shift, which inverts the piece's closing image.

### The film

**Gravity drainage is not the mechanism, and building it is the trap.** Measured,
Poiseuille drainage predicts ~4000 s for a fringe that really takes ~10 s — it is
400× too slow, and alone it produces smooth bands with none of the character. What
thins a mobile film is **marginal regeneration**: thin patches nucleate at the
bottom and side Plateau borders and, being lighter per unit area, **rise** through
the thicker film in a Rayleigh–Taylor-like instability.

The simulation is a thickness field `h` on a fixed-count grid, stepped as:

1. **Baroclinic vorticity.** `ω += dt·g·∂b/∂x` with buoyancy `b = (H₀ − h)/H₀`.
   One line, and it is the entire difference between sliding bands and a swirling
   film.
2. **Poisson solve** `∇²ψ = −ω` by Jacobi, `ψ = 0` on the boundary.
3. **Velocity** `u = ∂ψ/∂y`, `v = −∂ψ/∂x`. Gravity is **not** added here — as a
   velocity it slides the whole field down and clamps it at the bottom, which
   *flattens* the thickness gradient instead of steepening it, and a flat film is
   one colour everywhere.
4. **Semi-Lagrangian advection** of `h` and `ω`.
5. **Nucleation.** Discs of thinner film seeded at the bottom (≈62%) and side
   (≈38%) borders at a rate proportional to `mobility`. Step 1 carries them up.
6. **Poiseuille flux**, conservative and vertical: `q ∝ (h/H₀)³·H₀`, `h += q_above − q`,
   with the bottom row's `q` leaving into the border. **CFL-limited** at
   `q ≤ 0.2·h`. This is the whole of gravity's contribution and it dominates only
   in the rigid regime.
7. **Surface-tension smoothing**, scaled by `dt`.

### Mobility is a real knob, not an invented one

A mobile interface (plain SDS) gives marginal regeneration and swirls. Add a
co-surfactant and the interface goes **rigid** in Mysels' sense: marginal
regeneration disappears and the film drains by Poiseuille flow into smooth
horizontal bands. `mobility` interpolates the two, and both endpoints are
documented physical regimes rather than tuning positions.

### Rupture

Composition and ending were both owner decisions, taken 2026-09-15 against the
mockup: **the film is the screen** (no object, no background to invent), and the
rupture plays at **real geometry, dilated ~15×**. A real hole opens at the
Taylor–Culick velocity and clears the frame in about a tenth of a second, which at
true speed reads as a flicker or a glitch and is over before it is seen. So: a hole
nucleates *inside the black region*, where a real film actually gives way, and
expands over ~4 s behind a bright collecting rim, swallowing the colour. Then the
film re-forms.

## Framework shape

`kind: 'webgl'`. **The simulation is CPU; only the colour is GPU.**

- `setup` allocates the grid and forms the film. `frame` steps the sim, uploads `h`
  to a persistent `R16F` texture with `texSubImage2D` from a **reused**
  `Float32Array`, and draws one fullscreen triangle whose fragment shader samples
  `h` bilinearly and evaluates the reflectance. `teardown` frees the program, the
  texture and the VAO via `disposeGL`.
- This split is deliberate. The sim measured **1.4 ms at 256×160 in JavaScript**, so
  moving it to the GPU buys nothing and would cost a Jacobi Poisson solve as 20–40
  extra passes per frame. Keeping it on the CPU also keeps it *unit-testable*, which
  matters more here than anywhere: three of the four bugs found while building the
  mockup were silent, and all three are testable as pure functions.
- The upload path has precedent — `galaxy-collision/gl.ts`'s `uploadPositions`
  reuses one `Float32Array` into a persistent float texture. Follow it, including
  the zero-per-frame-allocation property.
- Per-frame `gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)`
  inside `frame`, per the WebGL note in `CLAUDE.md`.
- **Grid is a fixed cell COUNT, not a fixed cell size** (the Salvage #319 lesson):
  ≈41k cells, dimensions matched to the canvas aspect, so the film's grain scales
  with the display like a vector drawing instead of getting finer on a 4K wall. A
  resize resamples the existing field bilinearly rather than re-forming it.
- `update()` applies every field live except `gridDetail`; a structural change
  returns false and re-runs `setup`. **`mobility`, `drainRate`, `tempo` and every
  colour field must be in `update`'s live set** — a slider drag must not restart the
  film.
- `t`/`dt` are **milliseconds** (`useAnimationLoop.ts`). `tempo` integrates its own
  clock (`clock += dt/1000 * tempo`); it never multiplies the framework's `t`.

## Schema

Canon per `CLAUDE.md` §"Schema UX canon", with one deliberate departure recorded
below.

| Field | UI | Section | Notes |
| --- | --- | --- | --- |
| `mobility` | `slider` 0–1 | Film | Rigid ⇄ mobile interface. Live. Help names both regimes. |
| `drainRate` | `slider` | Film | Live. |
| `tempo` | `slider` | Film | Dilates the whole piece; ships at a crawl. Live. |
| `filmThickness` | `slider` nm | Film | Thickness of a freshly formed film. Live. |
| `rupture` | `segmented` | Film | Dilated / Slow / None. Live. |
| `illuminant` | `select` | Color | Daylight D65 / Overcast / Tungsten / Studio. Live. |
| `exposure` | `slider` | Color | A real film reflects ~8%; this is the only brightness control. Live. |
| `background` | `color` | Color | Label `'Background'`, dark default. Seen only through the rupture. |
| `gridDetail` | `segmented` | Advanced | Coarse / Normal / Fine cell count. **Structural.** |
| `filmIndex` | `slider` 1.20–1.45 | Advanced | Refractive index. Live. |
| `seed` | `number` | Advanced | `randomizeOnFreshLoad: true`, `collapsed: true`. |

**The departure, stated so it is chosen and not stumbled into: there is no
`Palette` field and no `colorList`.** Canon expects a piece that cycles many colours
to carry one, and this piece cycles more colours than any other in the gallery — but
they are the output of the physics, and a palette control would mean overriding a
measurement with a preference, which destroys the only thing that makes the piece
distinct. The legitimate colour control is the **environment illuminant**, which is
physically real (a film reflects its surroundings) and gives the `Palette` preset
axis something honest to move. `presetSweep.test.ts` and the canon sweeps must be
checked against this shape; if `diversionMeta.test.ts` requires a palette for a
piece of this kind, the exemption goes in that test's declared list **with this
reason**, never as a skip.

Two preset groups:

- **Film** — `Mobile` (the shipped default, swirling), `Rigid` (smooth banded
  Poiseuille regime), `Quick` (short-lived), `Long` (museum pace).
- **Light** — one option per illuminant.

Every group must open on a *named* option against the shipped defaults.

## Distinct from

Eight folders under `src/diversions/` mention "interference" — `interference`,
`moire`, `halo`, `intermomentary`, `quasicrystal`, `cwaves`, `hexadrop`, `chime` —
and five of those carry it into `docs/gallery.md`. **Every one is *wave*
interference**: summed ripple heights, or two ring families beating against each
other. The optical phenomenon is not in the gallery.
(⚠️ This paragraph said "nine pieces ... including `foam`" until the plan panel
checked it. `foam` mentions interference **zero** times; it matched an earlier grep
on the word *iridescent*, in a palette name. The substance held, the number did not —
the same failure this repo has now recorded twice. Grep before quoting a count.) `foam` is the nearest neighbour by
name and is a coarsening Allen–Cahn froth with a palette named "Soap Film" and no
optics at all. `paper-marbling` advects pigment through a chosen palette;
`viscous-fingering` is Saffman–Taylor.

Outside the gallery the niche is open too, checked 2026-09-15: xscreensaver's
`bubble3d` paints a flat random diffuse colour, `bubblecolors` wraps a
cosine-palette shader, Art Blocks' only bubble project is metaballs, and every
Shadertoy near-miss prescribes thickness as an analytic *function* of position
rather than evolving it as a field. An evolving thickness field exists only in
research — Ishida et al. and Huang et al., both SIGGRAPH 2020. ⚠️ Shadertoy itself
could not be searched (Cloudflare interstitial to every automated route), so read
that as high-confidence, not certain.

## Testing

Co-located `*.test.ts`. The guarantees worth pinning, in order of what actually
broke:

- **Black film.** Reflectance → 0 as `d` → 0, and the rendered colour is black
  below ~30 nm. This is the ending of the piece and it is one sign flip away from
  being a bright flash.
- **Grey convergence.** Saturation falls below a bound for `d` > 1500 nm and stays
  there out to 10 µm. This is the test that fails if anyone ever swaps in a
  three-cosine approximation, and nothing else would catch it.
- **The Newton series orders.** Hue at the first-order stops (≈150 nm straw,
  200 nm magenta, 250 nm blue, 300 nm green, 350 nm gold) in the published order.
- **Framerate independence.** Step the same seed to the same simulated time at
  `dt = 1/30` and `dt = 1/120`; the thickness fields must agree within tolerance.
  The mockup's smoothing ran per *frame* rather than per *second* and homogenised
  the entire field within half a minute — a bug that reads as "the screen is one
  flat colour" and is invisible to any single-framerate test.
- **CFL safety.** For every `dt` the framework can deliver (up to its 50 ms clamp),
  no cell goes negative and no cell goes `NaN`. The unclamped flux produced `NaN`
  in under a minute **with every readout still reporting plausible numbers**, so
  assert on the field, not on a summary.
- **Flux conservation.** Total thickness lost per step equals the bottom row's
  outflow plus what nucleation removed — nothing vanishes silently.
- **Mobility endpoints are visibly different.** At `mobility = 0` the horizontal
  variance of `h` stays below a bound (bands); at `mobility = 1` it exceeds it
  (plumes). Without this the knob can be wired to nothing and every other test
  passes.
- **Determinism** — same seed, same field at the same simulated time.
- **Rupture** — the hole expands monotonically, reaches the far corner, and the
  film re-forms; and with `rupture: 'None'` no hole is ever nucleated.
- **Resize resamples rather than re-forms** — mean thickness is preserved across a
  resize.
- Framework sweeps: codec round-trip, seed contract, meta canon, accessible names.

## Open, deliberately

- **Default lifetime** (formation → rupture) is a feel number and therefore an
  owner tuning call, not an agent's. The mockup reaches mean 1003 nm at 79 s at
  `tempo` 1.0; the shipped default should be slower. Ship the knob, ask for the
  number against a capture.
- **Evaporative convection** — a third documented mechanism, in which thick plumes
  *sink* from the top and erode the stratified region from above. Not in scope;
  the piece already has motion in both directions from marginal regeneration alone.
  Worth an issue if the film ever reads as too orderly at low mobility.
- **Colour at grazing angles.** The film is viewed head-on, so `cos θₜ = 1`
  everywhere and the LUT is one-dimensional. If a future variant curves the film,
  index the table by *optical* thickness `n·d·cos θₜ` — one table then serves every
  angle, which is what the probe already does.

## Mockups

- `docs/mockups/2026-09-15-thinfilm-lut.html` — the colour model alone, with the
  spectral-vs-cheap comparison. Captures: `2026-09-15-thinfilm-probe.jpeg`,
  `2026-09-15-thinfilm-spectral-vs-cheap.jpeg`.
- `docs/mockups/2026-09-15-soap-film.html` — the full-frame film with marginal
  regeneration. Capture: `2026-09-15-soap-film-marginal.jpeg`.

## Reference media

Verified 2026-09-15. Wikimedia **429s hard on rapid requests** — space fetches ~18 s
or working URLs look dead.

- `File:Интерференция в тонкой мыльной пленке.jpg` (CC BY 4.0, Ulyushin, 4900×3267)
  — the canonical picture: top ~40% dead black with a **razor-sharp** boundary, dense
  fringes broadening downward. The target still.
- `File:GenerationSoapFilm.jpg` (CC BY-SA 3.0, Emmanuelle Rio) — wire frame, ~20
  crisp fringes, and marginal-regeneration lobes along the top meniscus.
- <https://www.youtube.com/watch?v=ROK7JJJuM0w> (hart 3d) — drainage and marginal
  regeneration in one microscope shot.
- <https://www.youtube.com/watch?v=ancUjJpuU9E> (Klostermann) — explicit Newton
  black film, ~10 nm black spots convected in the flow.
- <https://fyfluiddynamics.com/2023/08/colorful-drainage/> — a black region at the
  top expanding until rupture. Exactly the arc this piece plays.
