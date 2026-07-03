# Asteroids — design spec

A zen diversion (#243) emulating the **Homeworld 2 space backgrounds** (per Simon
Schreibt's teardown): a slow drift through a painted purple/blue nebula, one warm
sun veiled by dark dust lanes, and a field of tumbling asteroids adrift in the
foreground. Never demands attention.

Started from the Homeworld-2-backgrounds idea as a *derelict-ship* field, then
pivoted (in-session) to an **asteroid field**: procedural rocks avoid the
"uncanny valley of shape" that procedural ships fall into (a hull either reads as
a specific ship or as noise-with-corners), and are just as Homeworld.

## SME design calls

### Rendering: `kind:'2d'` (Canvas2D), layered composite — NOT a fragment shader
- HW2's nebula = *vertex colours across huge triangles* = inherently
  **low-frequency**. A low-res offscreen bake upscaled bilinearly is low-frequency
  **by construction** — it physically cannot drift into the busy "generic
  Shadertoy nebula" that is the #1 failure mode. Canvas2D's softness IS the target.
- Canvas2D makes the rocks trivially crisp: `ctx.fill()` of a smooth-curve lumpy
  path with a lit→shadow gradient + crater radials. Free browser AA → no SDF
  shimmer under the slow pan. Matches repo precedent (baked-buffer + LUT gotchas).

### Atmosphere is a hard spec (the thing that makes it read)
- Nebula: 1–2 octaves, low contrast, big soft regions.
- A **warm blotchy illuminated-cloud glow baked around the sun** so light scatters
  *through* dust — reliable (not dependent on where a random dust patch lands),
  cheap (baked), and the main atmosphere. Rays broad/soft, not lens-flare.
- **Dark dust lanes** (a second thresholded-noise bake) drift in front of the sun
  at two depths, veiling it.

### Rocks read as lit asteroids, lumpy not jagged
- Outline = procedural lumpy control points drawn through **quadratic curves via
  edge midpoints** → rounded lumps, never spiky. Jitter kept gentle.
- Shading = lit-rock gradient along the sun direction (sunlit face → shadow),
  cool nebula ambient on the dark side (not dead black), + soft crater pits.
- Power-law size mix (many specks, few boulders); each rock a slow individual tumble.

## Layer stack (back → front), one 2D context
```
Stars       parallax 0.05  sharp faint points, baked positions
Nebula      parallax 0.12  low-res bake → LUT + warm sun-cloud, dithered, upscaled
Sun/rays    fixed (∞)      warm core + halo + soft god-rays, 'screen'
Dust lanes  parallax 0.2/0.42  dark veil drifting in front of the sun (two passes)
Asteroids   parallax 0.18–0.8  lit rock + shadow terminator + craters, tumbling
Dust motes  parallax 1.00  sparse drifting motes, faint twinkle, 'screen'
```
Stars + nebula + dust are baked; everything else composites live each frame.

## Knobs
Nebula: cloudScale, wispiness, contrast, **dustLanes** · Light: sunX, sunY,
sunSize, sunGlow, rayCount, rayReach · Asteroids: count, sizeScale, jaggedness,
tumble, rimLight · Camera: panMode(Drift|Pan), panSpeed, panRange, panAngle ·
Dust: dust(motes), stars · Color: nebula(colorList), sunColor, rockColor, rimColor,
background · Advanced: seed(randomizeOnFreshLoad).

## Presets
- **Scene**: Asteroid Field (reference) · Dense Belt · Sparse Drift · Dust Storm.
- **Palette**: Homeworld · Ember · Ice · Void.

## Determinism / lifecycle
- All randomness seeded (`mulberry32`). Same seed → same field.
- `randomizeOnFreshLoad` seed → seedless link = new field each visit; `?seed=N`
  reproduces exactly. No `shouldRestart` (steady screensaver — pans forever).
- `resize`: update w/h only (positions scaled by `h` at draw; bakes are fixed-res).
  Never re-bake / regen on resize.
- `update`: nebula-param / seed change re-bakes nebula; dust-param change re-bakes
  dust; field-param change regenerates; light/camera/tumble/rim apply live.

## Follow-up
Polish tracked in **#244** — grittier/greyer rock tone, per-rock tonal variation,
surface mottling, min-spacing, stronger dust/god-ray interaction.
