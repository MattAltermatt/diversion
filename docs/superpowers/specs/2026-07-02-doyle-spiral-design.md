# Doyle Spiral — design spec (#241 "Golden Apollonian")

**Slug:** `doyle-spiral` · **kind:** `2d` · **status:** building
**Issue:** #241 (user ref video https://www.youtube.com/watch?v=k2aSDAeFuaQ, titled/branded
"Golden Apollonian"). 31st diversion.

## What the reference actually is (SME finding)

The "Golden Apollonian" of the video is **not** an Apollonian gasket (#56 already ships that —
Descartes recursion into every gap). It is a **Doyle spiral**: a hexagonal packing of
mutually-tangent circles whose radii scale in a doubly-infinite geometric sequence, producing
**logarithmic-spiral arms of kissing circles** — the discrete analogue of the complex exponential
map. Different *substrate*, so a **new diversion**, not a seed-family on #56. (I could not perceive
the video's frames; this is the SME reconstruction from the math name + the packing description.)

**Canonical construction — Robin Houston (2013), MIT-spirit gist 6096562.** A Doyle spiral of type
`(p,q)` is fixed by two complex generators `a`, `b` and a radius ratio `r`, found by 2-D
Newton–Raphson on `(z,t)` (polar params of `a`) so three touching-circle radius-ratios agree:

```
_d(z,t,p,q) = |z·e^{it} − (z·e^{it})^{p/q}|²      _s = (z + z^{p/q})²      _r = _d/_s
find (z,t):  _r(z,t,0,1) = _r(z,t,p,q) = _r(z^{p/q}, (p·t+2π)/q, 0,1)
a = z·e^{it},  b = z^{p/q}·e^{i(p·t+2π)/q},  r = √_r(z,t,0,1)
```

Lattice: circle centres = `aᵐ·bⁿ` (n∈0..q−1, m∈ℤ over a radius band), **radius = |centre|·r**
(radius ∝ distance from origin — the self-similarity). We ship the exact analytic Jacobian from the
gist (converges in a few iterations); guard `root.ok` and fall back to a safe `(2,3)`.

## The signature motion — seamless loxodromic flow (the whole point)

Because the packing is invariant under `×a` (a complex scale+rotate), animating a global multiplier
`M(t)=a^{φ(t)}` (φ ramps 0→1 then wraps) makes every circle **flow along its arm forever with a
perfectly seamless loop**: at φ=1, `M=a` maps the lattice onto itself (index shift m→m+1), so the
frame at φ=1 is pixel-identical to φ=0. Circles are born tiny at the core, grow, drift outward
(or inward for negative flow), leave the rim — endlessly. This is the hypnotic Droste-zoom quality;
it replaces #56's reveal-then-reseed (no reveal, no reseed — the flow is the life). To keep the loop
truly seamless we generate the lattice a couple of `a`-steps beyond the visible band on both ends and
cull per-frame (projected radius <0.4px or fully offscreen → skip).

Fully deterministic — **no RNG, no `seed` field.** `(p,q)` fully determine the object; the gallery
tile / every fresh Play shows the same beautiful default spiral flowing.

## Schema (one source of truth)

**Structure** *(regime finding: the beautiful dense Doyle look needs q≥6 — small (p,q) like (2,3)
blow the circles up to r≈0.92. Larger q ⇒ modA→1 ⇒ denser. So q is "Arms"/density, p is "Twist".)*
- `q` "Arms" int slider 6..32 (default 20) — spiral density / arm count. Higher = finer, more
  circles per turn.
- `p` "Twist" int slider 1..20 (default 8) — winds the arms; **`reconcile` clamps p ≤ q−1** (clamp p
  down, not bump q up — keeps the chosen density steady while dragging Twist). Both hero knobs.
- `detail` slider 1..100 (default 60) — how deep toward the core the packing resolves (maps to the
  smallest drawn circle, ~2.6px→0.4px). Higher = more, finer circles. Regrows the lattice.

**Look**
- `style` segmented `filled | rings | ink`.
- `colorBy` segmented `radius | arm | angle` — radius→stationary concentric colour bands the
  circles flow through; arm→each of the q spiral arms a solid hue that sweeps; angle→colour wheel.
- `lineWidth` slider 0.4..4 (rings/ink stroke).
- `glow` slider 0..1 (default 0.3) — per-frame offscreen bloom (piece moves → can't bake like #56).
- `background` colour · `colors` palette (1..8) — **golden default** to honour the "golden" framing.

**Motion**
- `flowSpeed` slider −0.5..0.5 (default 0.06) — loxodromic zoom rate; sign = out/in; ~one seamless
  period per ~16s at default (zen-slow).
- `rotateSpeed` slider −0.4..0.4 (default 0.03) — extra rigid spin on top of the flow.

**Presets:** *Spiral* (curated dense (p,q): Golden 8/20 · Fine 12/28 · Coil 5/16 · Whirl 16/28 ·
Bloom 6/20 · Bold 4/10) · *Look* (Gold, Neon, Ocean, Etching, Ink) · *Motion* (Drift, Still, Swift,
Reverse).

**Perf (post-review):** colour is a baked 256-entry cyclic LUT rebuilt only when the palette changes
(`spiral.ts buildLut`), so the per-frame loop is zero-allocation — the moving piece can't bake the
raster like #56, so the hot path must not allocate per circle (gotcha-baked-buffer-live-layers).

## Calls the user may want to tweak (post-build)
1. **Name** — shipping as "Doyle Spiral" (it genuinely is one; "Golden Apollonian" would be wrong
   next to #56). Trivially reversible.
2. Default `(p,q)` / which preset is "Golden" — pick after seeing them flow.
3. Default palette (golden vs the #56 jewel look), flow speed, glow cost.

## UX invariants
Readable (high contrast on dark), every knob has help, sliders bounded, err to contrast. Screensaver:
no per-frame leak, pause/tab-hidden stops (framework loop), `teardown` frees the offscreen buffers.
