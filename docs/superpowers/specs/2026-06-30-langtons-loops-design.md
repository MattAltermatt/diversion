# Langton's Loops — diversion design (issue #111)

**Status:** approved (SME-decided per user delegation, dual-agent synthesis) · **Date:** 2026-06-30
**Family:** self-reproducing cellular automaton · **kind:** `2d` grid · **port:** hard (`xscreensaver` `loop`)

A clean-room port of xscreensaver's **`loop`** — Christopher Langton's 1984 self-reproducing
loops. A single looped "organism" extends a construction arm, buds off a daughter loop, and the
colony reproduces outward to fill the plane. Faithful mechanic; gallery-grade presentation.

---

## 1. The mechanic (verified against real source — DO NOT alter)

Sourced from the genuine xscreensaver `hacks/loop.c` octal `transition_table` **and** cross-checked
against the canonical Golly `Langtons-Loops.table` (they are byte-identical rule sets; e.g.
`0025271` ↔ `025271`). This is the authoritative rule — not reverse-engineered from a GIF.

- **8 states** (0–7), **von Neumann** (4) neighborhood, **`rotate4`** symmetry.
- **219 base transition rules**, each a 6-digit `CTRBL→I` tuple: Center, Top, Right, Bottom, Left
  → new center state `I`. `rotate4` means each base rule also applies to its 4 cyclic neighbor
  rotations (T→R→B→L). Any neighborhood **not** in the table → new state **0** (the default).
- **Seed** = the canonical 10×10 Langton loop: a square **sheath** (state 2) wall enclosing an
  empty core, with signal cells (`0 1`, `4`, `7`, `6`…) circulating, plus a short **construction
  arm** tail. Verbatim seed (state 0 = empty):

  ```
  0 2 2 2 2 2 2 2 2 0
  2 4 0 1 4 0 1 1 1 2
  2 1 2 2 2 2 2 2 1 2
  2 0 2 0 0 0 0 2 1 2
  2 7 2 0 0 0 0 2 7 2
  2 1 2 0 0 0 0 2 0 2
  2 0 2 0 0 0 0 2 1 2
  2 7 2 2 2 2 2 2 7 2
  2 1 0 6 1 0 7 1 0 2
  0 2 2 2 2 2 2 2 2 0
  ```
  Seed may be planted in a random one of 4 orientations (and CW/CCW) so reseeds vary.

- **State roles for presentation:** `0` = empty background. `2` = **sheath** (the loop walls —
  appears everywhere, visually dominant/structural). `1,3,4,5,6,7` = **signals** coursing inside
  the loops (construction-arm instructions; transient, moving).
- **Lifecycle reality:** colonies collide and seal each other; interior loops freeze into an inert
  "dead coral"; activity continues only at the expanding frontier until the plane is full and the
  grid goes globally **quiescent**. This is intrinsic to the rule and the screensaver must handle it.

### Rule encoding & lookup (implementation note)
Store the 219 base rules; expand to a dense lookup keyed by `(C,T,R,B,L)` with all 4 rotations
written in (default fill = 0). Index packing mirrors the source: `idx = C | T<<3 | R<<6 | B<<9 | L<<12`
(8 states ⇒ 3 bits each, 15-bit table = 32768 entries, `Uint8Array`). A neighbor off the grid
edge reads as state **0** (finite grid, non-toroidal — matches xscreensaver's bounded field).

---

## 2. Presentation (dual-agent synthesis: faithful-zen × gallery-showpiece)

Both design lenses **independently converged** on the core calls; differences resolved by SME.

### Color model — **(B) dedicated sheath color + signal hue-ring** (unanimous)
The sheath is the architecture and gets one calm dominant voice; the 6 signals get an evenly-spaced
**hue-ring** so the construction arm reads as a moving ribbon of color through the walls. Honors the
structural/signal distinction the rule is built on; avoids 7-unrelated-hue confetti (model A) and the
legibility loss of two-tone (model C).

Schema:
- `background` — color, state 0 (default `#06080d`, near-black blue).
- `sheath` — color, state 2 (default `#1f7a8c`, muted teal "coral skeleton").
- `signal` group (states 1,3,4,5,6,7 → 6 hues evenly spaced over `[hueStart, hueStart+hueSpan]`):
  `hueStart` (default 40), `hueSpan` (default 260), `saturation` (default 78), `lightness`
  (default 66). Signals are the brightest values (lightness > sheath) → built-in depth hierarchy.

**Presets (Palette group):** `Reef` (default — teal coral, warm→cool signals on near-black),
`Bone` (bone-white `#E8E2D0` sheath on near-black, desaturated cool signals — maximally legible/
timeless), `Ink` (paper `#F4F1E8` background, slate sheath, muted signals), `Nocturne` (deep indigo
background, cyan-family sheath, tight cool signal ring).

### Scale — **cellSize 4px** (unanimous)
~300×190 cells on a 1200px-wide canvas. Each mature loop ≈ 10–12 cells; the plane holds dozens, with
~10–14 loops in the active reproducing frontier at any moment — alive yet calm. Slider 2–12.

### Speed — **8 CA steps/sec** (unanimous)
Slow enough to follow a single arm extending cell-by-cell and the turn-and-seal moment; fast enough
that the colony visibly grows. Zen-calm. Slider 2–20. Per-frame step cap (e.g. 4) bounds compute.

### Color mode — **Solid** (default)
Crisp von-Neumann cells read like architecture/coral — legible, high contrast (UX invariant #5).
Glow blooms signals into mush and risks the von-Neumann crispness; both lenses flag it. Ship Solid;
backlog an optional restrained "signals-only" glow.

### Lifecycle / restart — **THE keystone** (synthesis)
Defaults to an engaging-but-calm middle of the two lenses.

- **Seeding:** `seeds` param (1–6, default **1**). Default 1 = the iconic experience: watch a single
  loop colonize the whole plane from center (max wonder, max legibility). Higher = multiple foci,
  faster/busier fill (richer). Seeds planted in random orientation.
- **Aged coral (richness, throttled):** each cell tracks the step it last changed (`bornStep`).
  Inert **sheath** cells slowly drift brightness down over ~30s (active teal → settled dim) so the
  filled reef still reads as recessed vs the live frontier — the eye is drawn to where reproduction
  is happening. Implemented as a **throttled age-pass (~2 Hz)** repainting only cells whose age
  bucket changed; the per-step CA repaint stays incremental (demon's `changed`-cell list).
- **Quiescence detection:** rolling window — when **< 0.1%** of cells change for **~90 consecutive
  steps** (with a minimum-steps floor so a slow start never trips it), declare the generation
  complete. (Not exact-zero: stray late flickers would otherwise hang it forever.)
- **Hold ~3s** on the finished coral (it is genuinely beautiful — reframes "died" as "completed a
  generation").
- **Fade ~2s:** a global background-alpha crossfade ramp (cheap, calm) dissolves the field.
- **Reseed:** clear, plant `seeds` fresh loop(s), repeat. The 1-loop → full-plane → hold → fade →
  1-loop breathing cadence (~roughly 1–5 min/generation depending on `seeds`/`cellSize`) is the
  piece's meditative rhythm — and guarantees it is **never permanently dead** (the #1 screensaver
  failure mode).

### Rejected as un-zen / out of scope for v1
Default glow/bloom, particle trails, rainbow sheath cycling, motion blur, full-field pulsing, slow
"camera" zoom/drift. Born-cell flash/fade-in and signals-only glow → backlog (additive richness, not
a missing mechanism).

---

## 3. Diversion contract (file shape — auto-registers via `new-diversion`)

`src/diversions/langtons-loops/` (structural analog: `demon/`):
- `schema.ts` — Zod schema (single source of truth): `cellSize`, `speed`, `seeds`, `background`,
  `sheath`, `signal` group (hue-ring), `seed` (RNG int). Each field `.meta({ section, ui, label,
  help, min, max, step })`. Sliders only where bounds exist (UX invariant #4).
- `rule.ts` — the 219 base rules + rotate4 expansion into the `Uint8Array` lookup; `next(C,T,R,B,L)`.
- `loops.ts` — sim state + step: grid `Uint8Array` (double-buffered), `changed` list, `bornStep`
  tracking, seed planting (canonical 10×10 in chosen orientation), quiescence/hold/fade/reseed state
  machine, `update`/`resize` hooks (cellSize/seeds = structural → re-setup; colors = live).
- `palette.ts` — state→color LUT from config (background, sheath, signal hue-ring), age-dim ramp.
- `presets.ts` — Palette preset group (Reef/Bone/Ink/Nocturne).
- `index.ts` — `defineDiversion({ id:'langtons-loops', title:"Langton's Loops", description: <credit
  jwz + Langton>, kind:'2d', schema, presets, setup, frame, update, resize })`. Incremental repaint
  in `frame` (paint `changed` cells + throttled age-pass + fade overlay during transitions).
- Co-located `*.test.ts`: rule lookup (rotate4 correctness + a few known transitions), seed determinism,
  quiescence trigger, codec round-trip is covered by the framework's `urlKeys`/codec tests.

**Credit:** `description` + a source-header comment — "after xscreensaver's `loop` by David Bagley,
implementing Christopher Langton's self-reproducing loops (1984); rule table cross-checked against
Golly's `Langtons-Loops.table`. Clean-room TypeScript reimplementation."

---

## 4. Verification & ship
- Vitest green (rule/seed/quiescence units + full suite).
- Chrome at **:5180** (`verify-diversion`): watch a real generation — single loop colonizes the
  plane, frontier reads as alive, aged coral recedes, quiescence → hold → fade → reseed cycles
  cleanly, console clean. Confirm it actually *looks good*, not just renders. Test presets + sliders.
- `diversion-reviewer` + `perf-analyzer` agents (touches `frame`/`setup`; required review phase).
- `ship-diversion`: squash → FF-merge `main` → deploy GH Pages → live-validate `/diversion/d/
  langtons-loops/play` → close #111.
