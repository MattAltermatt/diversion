# Moire — design spec

**kind:** `2d` · **branch:** `feature/halo` · **Date:** 2026-06-28

> **Pivot (2026-06-28):** started as a port of xscreensaver `halo` (#80) but the
> implementation is a moire/interference engine (per-frame spatial parity), not
> the original's temporal ring-trail. Renamed to **Moire** and shipped as its own
> piece; the jwz attribution was dropped. A faithful temporal-accumulation
> **Halo** (#80) remains open as a separate future diversion. History below kept
> for context; `id: 'moire'`, three styles: Glow / Op-Art (filled XOR parity) / Moire.

Clean-room reimplementation of the expanding-ring-moire mechanic from Jamie
Zawinski's `halo` (xscreensaver). Faithful mechanic, gallery-grade color/look
upgrade (hybrid port ethos). Credit jwz + xscreensaver in the source header and
the diversion `description`.

Visual anchor: `https://www.jwz.org/xscreensaver/screenshots/halo.jpg`
Original source studied: `/Users/matt/dev/xscreensaver/hacks/halo.c`.

## The faithful mechanic

A handful of circles, each at a random center, each growing a `radius` outward.
Overlapping concentric rings from multiple centers **beat into moire halos**.
That interference — hypersensitive to center spacing — is the piece. Everything
below upgrades the *look* while keeping that mechanic intact.

The original's lifecycle (grow → fill screen → reverse → contract to points →
re-pick centers, with an optional center-drift mode) is replaced by a
**perpetual** ripple+breath+drift model (below) that never hard-resets — calmer
and more zen than the original's fill/reverse jolt.

## Decisions locked (brainstorm)

1. **Look:** selectable color modes, all with user-chosen colors —
   **Glow** (luminous additive halos) and **XOR** (duotone cycling). A third
   **Solid** mode was added during verify (post-build, user request): the
   classic jwz `halo.jpg` look. It is **XOR of FILLED discs** — a pixel's parity
   (how many disc edges enclose it, summed across ALL centers) selects `fg` vs
   `background`, so the centers' rings MERGE into a single 2-colour interference
   field rather than crossing as separate strands. Two colours fill the whole
   plane; `ringWidth` is unused (discs are filled). Surfaced via a **Style**
   preset group (Glow / Classic Halo / Moire) so each look is one click and
   correctly tuned (Classic Halo wants wide `ringSpacing` so each centre's
   bullseye reads before merging).
2. **Motion:** breathing + drifting centers (perpetual, never static).
3. **Ring character:** a single **Softness** slider (0 = crisp → 1 = full
   bloom), default mid-soft. Implemented as **one offscreen blur pass on blit**,
   not per-ring `shadowBlur` (which was O(rings) and ran ~13× slower — 9→120 fps
   fix). So softness is free at any value, and `ringWidth` is pure thickness.

## Files (standard diversion contract)

```
src/diversions/halo/
  index.ts        defineDiversion: id/title/description, setup/frame/update/resize/teardown
  schema.ts       Zod schema (drives form + URL codec + Config type)
  halo.ts         pure model + render: createHaloState, stepHalo, drawHalo,
                  updateHaloState, resizeHaloState, type HaloState
  halo.test.ts    determinism, drift bounds, emission, update live/structural split
  index.test.ts   contract smoke
```

Auto-registers via `import.meta.glob('../diversions/*/index.ts')` — no manual
registration.

## Model — perpetual ripple-halos

- **Centers:** `N` points, each with position, a slow drift velocity `(vx,vy)`,
  and a tint index. Centers **wander and bounce off the canvas edges**, sliding
  the moire continuously.
- **Rings:** each center continuously **emits concentric rings** that expand
  outward at `ringSpeed` (px/s); a new ring is born each time the leading edge
  advances `ringSpacing` px. Each ring **fades in** at birth (near radius 0) and
  **fades out** as it crosses the screen diagonal `maxR`, then is retired — so
  there is **no pop and no hard reseed**. The field runs forever.
- **Breathing:** a slow sinusoid modulates the effective expansion (ring speed /
  spacing) so the whole field gently **dilates and contracts**; the moire beat
  pulses. `breathAmount` controls depth, `breathRate` the period. This is the
  "breath" of motion-option A without a discontinuity.
- **Moire:** overlapping ring-sets from multiple centers interfere — the
  faithful halo mechanic.

Ring emission is **regular** (not random) → deterministic given the seed (which
only sets center start positions + drift directions).

## Rendering (Canvas2D, DPR-scaled)

Per-frame: clear to `background`, then draw all live rings. The 2D context is
DPR-scaled (`setTransform(dpr,…)`) so the sim works in CSS pixels; reapply on
resize (HiDPI gotcha).

- **Softness** maps hairline → bloom: a ring is drawn as a soft annular band
  (radial-gradient stroke or blurred ring) whose edge width scales with softness.
- **Glow mode:** `globalCompositeOperation = 'lighten'` (additive). Each center's
  rings are tinted from the `tints[]` palette (one per center, cycling by index).
  Overlaps brighten into luminous color halos on `background`.
- **XOR mode:** rings composited with `'difference'` / `'xor'` to reproduce the
  cancellation moire, presented as a **duotone** (`background` + chosen `fg`) with
  a slow **hue cycle** (`hueCycle` rate). Likely uses one offscreen buffer to
  build the B&W moire field, then maps it to the duotone — freed in `teardown`.

**Implementation risk (verify first):** exact XOR-cancellation in Canvas2D is the
one fiddly bit — `'difference'` operates on color, `'xor'` on alpha, and they
yield slightly different moire. **Prototype the XOR mode first and verify in
Chrome** before building the rest, so a compositing surprise surfaces early. Glow
mode (plain additive) carries no such risk.

## Schema (sections → form)

All fields carry `label` + `help`; sliders only where bounds are defined
(invariant #4); defaults sit at the **calm end** of every range (zen ethos).

```
Halos:
  centers       int slider 1–12      default 3      (few = calm)
  ringSpacing   slider px            default ~38
  ringSpeed     slider px/s          default ~18    (slow)
  softness      slider 0–1           default ~0.6   (mid-soft)
  ringWidth     slider px            default ~2

Motion:
  driftSpeed    slider px/s          default ~6     (slow wander)
  breathAmount  slider 0–1           default ~0.25  (gentle)
  breathRate    slider (cycles/min)  default slow

Color:
  mode          segmented  Glow | XOR             default Glow
  background    color                              default near-black
  tints         colorList (1–8)   [showWhen mode=Glow]   luminous ring colors, one per center, cycling
  fg            color             [showWhen mode=XOR]     the lit duotone color over background
  hueCycle      slider (deg/s)    [showWhen mode=XOR]     slow hue drift of fg, default gentle

Advanced:
  seed          int number                         center placement + drift dirs
```

Exact default numbers are **tunable** (🎚️) and will be dialed during Chrome
verify; ranges above are the committed bounds.

## Lifecycle

- **`update(state, config, size)`** — live-applies colors, softness, speeds,
  breath, widths (swap `state.cfg`, recompute derived `tints`/`maxR`); returns
  truthy. **Structural** changes — `centers` count and `seed` — return falsy so
  the framework re-runs `setup` (mirrors substrate / flow-field).
- **`resize(state, size, ctx)`** — reposition centers proportionally to the new
  size, recompute `maxR` (screen diagonal), reapply DPR transform.
- **`teardown(state)`** — drop the XOR offscreen buffer if allocated.

## Testing (Vitest, co-located `*.test.ts`)

- **Determinism:** same `seed` → identical initial centers + drift vectors.
- **Emission:** ring radii at a fixed `t` are deterministic and match the
  spacing/speed formula.
- **Drift bounds:** centers stay within `[0,width]×[0,height]` and reverse
  velocity on edge contact (bounce).
- **Update split:** `update()` returns truthy for live params (colors, softness,
  speeds), falsy for structural (`centers`, `seed`).
- **URL codec round-trip** for the halo schema (the keystone — flat leaf keys,
  per-field decode resilience).
- Assertions hoisted **out of** hot per-ring/per-frame loops (CI-timeout lesson);
  track worst-case in locals and assert once.

## Out of scope (backlog candidates)

- Kaleidoscopic / N-fold symmetry overlay (belongs to swirling-magic #130, not
  halo).
- Non-circle shapes (jwz's own "would look good with other shapes" note).
- WebGL per-pixel version (this is the Canvas2D port:easy build).
