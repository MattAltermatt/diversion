---
name: port-xscreensaver
description: Use when porting an xscreensaver/Tarbell/complexification.net hack into a Diversion — e.g. "port <hack>", "port-xscreensaver", "add the <name> screensaver", or picking up an issue under the `xscreensaver` label. Enforces the repo's porting ethos: fetch the REAL hack source first, clean-room reimplement the mechanic, upgrade looks/colors to gallery grade, and credit correctly. Hands off to new-diversion for scaffolding.
---

# Porting an xscreensaver / Tarbell hack into a Diversion

A Diversion port is **faithful mechanic, upgraded looks**. The point is to capture
what makes the original *move* the way it does, then bring its palette, contrast,
and motion up to this gallery's bar — not to pixel-match a 1990s screensaver.

## The non-negotiable first step: fetch the REAL source

**Issue screenshots and animated GIFs mislead.** They hide the actual update rule,
the respawn/lifecycle logic, and the constants that make the motion feel right.
Before designing anything, fetch the genuine implementation:

- **xscreensaver hacks** → the C/GLSL source in the upstream repo (Jamie Zawinski's
  xscreensaver; look under `hacks/` or `hacks/glx/`). Zygote/Zwizwa mirrors and the
  GLSL ports are also valid sources.
- **Tarbell / complexification.net pieces** (Sand Painter, Substrate, etc.) → the
  original Processing/Java source. The live site is often gone — use the **Wayback
  Machine** (`web.archive.org`) to recover `complexification.net` and
  `inconvergent.net` sources.
- Read the **update rule and the respawn/lifecycle logic in full** — those are what
  the screenshots can't show and what determine whether the port actually looks
  alive (see the flow-field gotcha: a missing particle lifecycle collapses every
  particle onto one streamline).

If you cannot find real source, say so and ask before reverse-engineering from a GIF.

## Licensing & credit

- **Clean-room reimplement** from understanding the algorithm — do not copy GPL
  xscreensaver C into this MIT repo. Reimplement the mechanic in TypeScript.
- **Tarbell/complexification pieces are NOT CC-licensed** — clean-room + MIT +
  explicit credit is the established pattern for this repo.
- Credit the original author + work in the diversion's `description` and/or a source
  comment (e.g. "after Jared Tarbell's Substrate", "after xscreensaver's <hack> by
  <author>").

## Upgrade to gallery grade (default; don't re-ask)

The repo ethos is **hybrid by default**: faithful mechanic, but upgrade the look.

- **Color**: route through the framework's color/gradient system (palette set or
  gradient modes), not the original's fixed palette. Err toward more contrast
  (UX invariant #5).
- **Motion**: keep it ZEN — slow, calm, always-beautiful. Default to the calm end
  of every range (see the zen-screensaver ethos in memory).
- **Standard color modes** where they fit: Glow / Solid / XOR.

## Then scaffold via new-diversion

Once the mechanic + look are understood, invoke the **`new-diversion`** skill to
create the piece against the fixed contract (`{ id, title, description, kind,
schema, setup, frame, ... }`) so it auto-registers and gets the config screen,
URL codec, pause/fps/fullscreen for free. Put the Zod schema first — it's the
single source of truth for the form, the URL codec, and the `Config` type.

## Checklist

1. Identify the hack + its `xscreensaver`-label issue (`gh issue view <N>`).
2. Fetch and read the REAL source (Wayback if the site is dead). Understand the
   update rule AND the respawn/lifecycle.
3. Decide `kind`: `'2d'` or `'webgl'` (heavy per-pixel/agent sims → WebGL2; see
   physarum/grayscott/labyrinth for all-GPU references).
4. Invoke `new-diversion` to scaffold; design the Zod schema first.
5. Implement the mechanic faithfully; upgrade color/contrast/motion to gallery grade.
6. Add credit (description + source comment).
7. Verify in Chrome on port 5180 (use the `verify-diversion` skill). Confirm it
   actually looks good and the console is clean — not just that it renders.
8. Code-review via the `diversion-reviewer` agent, then `ship-diversion`.
