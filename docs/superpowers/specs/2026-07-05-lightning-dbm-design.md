# Lightning / Dielectric Breakdown Model — design spec

**Issue:** #246 · **Slug:** `lightning` · **Kind:** `2d` · **Date:** 2026-07-05

Branching lightning grown by the **dielectric breakdown model (DBM)** — Laplacian
growth where the next breakdown site is chosen ∝ (local field)^η. Dark screen, a
bolt crawls between electrodes, flash-completes, fades to ember, reseeds. DLA's
physics cousin but reads as *lightning*, not coral: sparse, directional,
violent-then-calm. Strong contrast for free (UX invariant 5).

Reference: Niemeyer–Pietronero–Wiesmann (1984) DBM; the textbook Laplace-growth
model that produces Lichtenberg figures. η is the branchiness exponent
(η≈1 dense fern → η≈4 one-dimensional jagged bolt; critical η_c≈4).

## The algorithm (SME calls — hard-coded because there's one right answer)

- **Field grid** decoupled from screen px: target ~**180 cells** on the long axis
  (`cellPx = longDim / 180`, clamped) so Laplace relaxation cost is bounded
  regardless of resolution. `resize` only rescales draw geometry + rebuilds the
  grid (viewport-independent-geometry rule doesn't apply — grid is pixel-bound
  like DLA, rebuild on fullscreen toggle only).
- **Potential φ** (`Float32Array`): tree/leader cells are Dirichlet **φ=0**; the
  far electrode (ground plane / bounding circle) held **φ=1**; solved by
  **SOR relaxation**, a handful of sweeps per frame (warm-started → converges
  fast; growth is the show, exactness isn't).
- **Growth step:** candidate = empty cell 4-adjacent to the tree. Weight
  `w = max(φ,0)^η`; pick one weighted-random from the seeded stream; set it φ=0,
  record `parent` (for stroke drawing) + `order` (age, for the ember gradient).
  Maintain an incremental candidate set.
- **Growth rate metered by dt** (`strikeSpeed` cells/sec) — a bolt is a few
  hundred cells grown over ~1–2 s ⇒ only a few grow-steps/frame, so per-frame
  cost is trivial (~180² × a few SOR sweeps).

## The loop (internal phase machine, NOT `shouldRestart`)

Like differential-growth's internal reseed — a continuous cycle keeps the flash
+ fade in one run and preserves "same seed = same run" (each new strike draws its
leader position from the seeded stream):

`growing → (tree touches far electrode) → FLASH (whole tree → white core + halo
bloom, ~180 ms) → FADE (decay to ember, hue → warm, ~1.3 s) → respawn`.

## Modes (headline geometry knob — `ui:'segmented'`)

- **cloud-to-ground** (default): leader seed top-centre, ground = bottom row φ=1,
  grows downward. Completes on reaching the bottom.
- **point-to-point**: leader top, small φ=1 target electrode at bottom-centre.
- **radial** (Lichtenberg): seed = centre point, bounding circle φ=1, grows
  outward in all directions — the Lichtenberg-figure star.

## Render (SME calls; two-layer additive glow per the blowout gotcha)

Tree is small (hundreds of cells) and static once grown → **redraw the whole
tree every frame** with a per-cell brightness envelope (no accumulation buffer).
Draw each cell as a stroke to its `parent` (clean bolt filaments, not blobs):

- **Halo layer:** wide, blurred, low-alpha, `lighter` composite (electric colour).
- **Core layer:** thin, near-white, opaque, on top.
- **Growing:** whole channel lit; newest cells (near tip) brightest → spark crawl.
- **Flash:** brightness → max, halo width + alpha spike.
- **Fade:** `brightness *= decay`, colour lerps core→ember (warm dim) via `order`.
- Background near-black; optional faint cloud glow at the leader origin.

## Knobs (expose the alternatives — err toward too many buttons)

`mode` (segmented) · `eta` **Branchiness** ★ (0.5–5, def 2.5) · `strikeSpeed`
(cells/s) · `glow` (halo intensity) · `boltWidth` (core px) · `afterglow`
(ember-fade seconds) · `coreColor` · `haloColor` · `emberColor` · `background` ·
`seed` (randomizeOnFreshLoad).

**Presets — two axes:**
- **Form** = mode + eta: *Cloud-to-Ground · Lichtenberg Star · Feathered Fern
  (η≈1) · Jagged Fork (η≈4) · Point Discharge*.
- **Look** = colours + glow + width: *Electric Blue (default) · Violet Storm ·
  Plasma Ember · Mono White · Red Sprite*.

## Determinism keystone

All randomness from `mulberry32(config.seed)`: leader position per strike,
weighted candidate pick. Same seed → identical bolt sequence. `seed` is
`randomizeOnFreshLoad` (fresh visit = new storm; `?seed=N` reproduces).
