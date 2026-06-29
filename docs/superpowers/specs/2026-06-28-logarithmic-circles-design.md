# Logarithmic Circles — design spec

**Issue:** #116 (`xscreensaver/logarithmiccircles`)
**Date:** 2026-06-28
**Kind:** `webgl` (fragment-shader diversion; Plasma is the reference)

## Identity

An endless, hypnotic **zoom through rings of black-and-white circles**. Concentric
log-spaced rings, each subdivided into circles, scale outward (or inward) forever and
slowly rotate. The size falloff is dramatic — each ring's circles are several times
bigger than the next ring inward — so the screen reads as huge discs at the edges
spiralling down into a tight whirl at a focus point. The faithful look is strict B/W
over a faint horizontal-scanline ground; a gallery **color** mode is an alternate.

This is a faithful port of mrange's Shadertoy **"B/W logarithmic circles II"**
(`https://www.shadertoy.com/view/mljcWR`, **CC0**), which is the shader xscreensaver
ships as `logarithmiccircles`. Credit: mrange (algorithm, CC0) + jwz / xscreensaver.
CC0 is public-domain-equivalent, so the port carries no license restriction beyond
courtesy credit.

### What it is NOT (the "same page" note)

The issue text describes "concentric circles" from the thumbnail, which reads like a
single concentric-ring tunnel. The real algorithm is different and richer: **rings of
discrete circles** (8 per ring by default), two interleaved layers, placed at each
ring's mid-radius. We confirmed this by reading the actual shader source before
committing to a design — not by guessing from the screenshot.

## Algorithm (from the shader)

Working in centered, aspect-corrected coordinates `p`:

- **Log-polar radius.** `ExpBy = log2(growth)` and `forward(l) = exp2(ExpBy·l) =
  growth^l`. Successive ring radii are `growth^n` for integer `n`, so the ring-to-ring
  size ratio is the `ringGrowth` knob (shader constant 4.1).
- **Zoom.** Divide `p` by `forward(zoomPhase_frac)` where `zoomPhase` advances with
  time; as the fractional part sweeps 0→1 the field scales by `growth` and **wraps
  seamlessly** (the integer ring index just shifts by one). This self-similarity is
  what makes the zoom endless.
- **Rings → circles.** For the ring a pixel falls in, take mid-radius `r` and width
  `w = r0 - r1`. Fold the angle into `circlesPerRing` cells (`modPolar`), translate by
  `r`, and test a disc SDF of radius `circleSize·w`. Each cell holds one circle.
- **Interleave.** Loop `layers` times (default 2), each layer offset half a zoom-step
  and half a cell, so the second layer's circles fall into the first layer's gaps →
  the dense packed look.
- **Color.** `a = fract(0.5·zoomPhase + cell/circlesPerRing)`; circles flip between the
  two tones across `a = 0.5` (the spiral B/W banding). A secondary inner SDF (`d2`)
  draws the small **center dot** that pulses as `a` sweeps.
- **Background.** Faint horizontal scanlines: `scanlines · smoothstep(sin(πy/aa))`.
- **Rotation.** A global `ROT(rotPhase)` applied before the log-polar step; decoupled
  from zoom in our port so 0 rotation is a valid calm option.

`aa = 4 / resolutionY` drives `smoothstep` edge antialiasing throughout.

## Schema (single source of truth)

```text
PATTERN
  ringGrowth      2.0 – 8.0    default 4.1   slider   ring-to-ring size ratio.
  circlesPerRing  3 – 16 (int) default 8     slider   circles spaced around each ring.
  circleSize      0.10 – 0.48  default 0.32  slider   disc radius as fraction of ring gap.
  layers          1 – 2 (int)  default 2     slider   interleaved copies filling gaps.

MOTION
  zoomSpeed       0 – 1.5      default 0.35  slider   zoom rate (calm default).
  direction       in | out     default out  segmented outward-growing vs inward-falling.
  rotateSpeed     0 – 1.0      default 0.15  slider   slow global spin; 0 = none.

COLOR (group)
  mode            mono | color default mono  segmented faithful B/W vs gallery color.
  background      hex          default #000000          painted ground.
  fg              hex          default #ffffff  showWhen mode=mono   two-tone circle colour.
  tints           colorList    default gallery palette  showWhen mode=color  cycled by ring+cell.
  scanlines       0 – 0.3      default 0.10  slider   horizontal line texture; 0 = clean.
  centerDots      bool         default true  toggle   the pulsing dot in each circle.
```

- **No `seed`** — the shader is fully deterministic (no RNG). Variety comes from presets.
- Defaults sit at the calm/zen end (slow zoom, gentle spin) per the screensaver ethos.
- Color group is a nested object patched whole by presets (top-level spread rule).

## Architecture / wiring

```text
src/diversions/logarithmic-circles/
  schema.ts    Zod schema above (drives form + URL codec + Config type)
  shader.ts    GLSL ES 3.00 fragment source + initGL/render/disposeGL helpers
  index.ts     defineDiversion contract, kind 'webgl'
  presets.ts   PresetGroup[] for Look + Motion
  *.test.ts    unit tests
```

**State:** `{ gl: WebGL2RenderingContext, res: LogCirclesGL, cfg, zoomPhase, rotPhase }`
(gl stashed so `teardown` — which gets no ctx — can free GL resources).

- **`setup(gl, cfg)`** → `initGL(gl)` compiles a fullscreen-triangle program
  (`#version 300 es`, so `circlesPerRing`/`layers` work as uniform-driven loop bounds),
  caches uniform locations, returns state with `zoomPhase = rotPhase = 0`.
- **`frame(state, gl, _t, dt)`** sets `gl.viewport(0,0,drawingBufferWidth,
  drawingBufferHeight)` every frame, advances `zoomPhase += zoomSpeed·dt/1000` and
  `rotPhase += direction·rotateSpeed·dt/1000` (CPU accumulation so live speed edits
  never jump; wrapped `% 1e4` for float32 precision over long runs), pushes uniforms,
  draws. Paused → phases stop → frozen frame.
- **`update(state, cfg)`** swaps `state.cfg` and returns `true`; every param is a
  uniform, so it always applies live — never a structural re-setup.
- **`teardown(state)`** `disposeGL(state.gl, state.res)` (program + VAO) to avoid GL
  leaks across gallery navigation on the persistent webgl2 canvas.
- Context loss is handled by the host rebuilding via `setup`.

**Uniforms:** `iResolution` (vec2), `uZoomPhase`, `uRotPhase`, `uGrowth`, `uCircles`
(int), `uCircleSize`, `uLayers` (int), `uScanlines`, `uDots` (0/1), `uMode` (0/1),
`uBg` (vec3), `uFg` (vec3), `uTints` (vec3[8]), `uTintCount` (int). Hex colours are
parsed to vec3 on the CPU in `render`.

## Presets

```text
Look (patches color subgroup whole):
  Faithful B/W   mode mono, fg #fff, bg #000, scanlines 0.10
  Neon           mode color, deep bg, saturated tints
  Pastel         mode color, light bg or soft tints
  Sunset         mode color, warm tint ramp

Motion (patches zoomSpeed / rotateSpeed / direction):
  Calm           slow zoom, slow spin, out
  Hypnotic       medium zoom, no spin, in
  Vortex         medium zoom, faster spin, out
```

## Testing

Pure-TS seams around the GLSL (rendering itself is GPU and not unit-tested):

- **hex→vec3** colour parsing helper — exact values + clamping.
- **phase-advance** helper — determinism and `% 1e4` wrap.
- **schema defaults** sanity — `mode='mono'`, `ringGrowth=4.1`, `circlesPerRing=8`, etc.
- **contract** — `index.ts` exposes `id`, `kind:'webgl'`, `schema`, `setup/frame/teardown`.
- Framework's existing `urlCodec` round-trip + `urlKeys` tests cover this schema
  generically (flat leaf-name keys must stay unique or fall back to dotted path).

## Verification

Chrome (chrome-devtools MCP) at the pinned dev port (`:5180`), `/d/logarithmic-circles`
route: confirm the faithful B/W look matches the jwz reference, the zoom is seamless
(no flash at the wrap), rotation is smooth and decoupled, color mode reads well, and
the controls live-update without a teardown flash. Reference screenshot saved during
brainstorm; the faithful demo matched it closely.
