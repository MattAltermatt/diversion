# 🌀 Diversion

A personal web gallery of small, screensaver-like generative-art pieces — **diversions**. Each one is unrelated in content (a particle flow field today, a cellular automaton tomorrow), but they all share one framework and one design ethos. The framework owns the *chrome*; a diversion only has to draw.

## What's here

- **A framework** that gives every diversion two screens for free:
  - **Config screen** — controls on the left, a live preview on the right.
  - **Animation screen** — a full-viewport canvas (fullscreen-able) whose entire configuration lives in the URL, so any look is a shareable link.
- **Eight diversions:**
  - **Flow Field** (`kind: '2d'`) — particles drifting through a noise-driven vector field.
  - **Gravity Wells** (`kind: '2d'`) — particles with momentum falling through a field of transient gravity wells that appear and fade; orbits, slingshots, and push-pull churn.
  - **Plasma** (`kind: 'webgl'`) — domain-warped color fields, demoscene-style; the reference WebGL piece (proves the `webgl2` host path + context-loss recovery).
  - **Metaballs** (`kind: 'webgl'`) — gooey lava-lamp blobs that rise, merge, and split; a CPU thermal-oscillator sim feeds a fragment-shader field sum.
  - **Substrate** (`kind: '2d'`) — cracks grow and branch at right angles into an organic network, each washing a soft watercolour cell beside it.
  - **Sand Stroke** (`kind: '2d'`) — grainy sand-painter strokes lay drifting bands of stratified colour.
  - **Squiral** (`kind: '2d'`) — worms wind themselves into tight square spirals that flood the screen with interlocking right-angled coils.
  - **Turmite** (`kind: '2d'`) — a generalized Langton's ant; ants turn by the colour beneath them, leaving emergent highways, spirals, and fractal growth (port of xscreensaver `ant`).
  - **Moire** (`kind: '2d'`) — concentric rings expand from drifting centers and interfere into shifting moire fields. Three styles: **Glow** (luminous additive rings), **Op-Art** (filled-disc XOR parity — the centers' rings merge into one bold 2-colour interference field), **Moire** (thin duotone rings that cancel where they cross).

## Run it

```bash
npm install
npm run dev      # → http://localhost:5180
npm test         # vitest
npm run build    # tsc -b + vite build
```

Routes:

```text
/                 Gallery — a tile per diversion (live preview)
/d/:slug          Config screen (form + live preview, URL-synced)
/d/:slug/play     Animation screen (full canvas, config from URL)
```

## Adding a diversion

Create `src/diversions/<slug>/` with an `index.ts` that default-exports a `Diversion`. It's auto-discovered by the registry (Vite glob) — no registration step.

```ts
import type { Diversion } from '../../framework/types'
import { z } from 'zod'

const schema = z.object({
  size: z.number().int().min(1).max(100).default(20)
    .meta({ ui: 'slider', min: 1, max: 100, step: 1, label: 'Size' }),
  // ...more fields. Each field's .meta({ ui, label, help, min, max, step, options })
  // drives BOTH the form control and the URL codec.
})

const myDiversion: Diversion<typeof schema._type> = {
  id: 'my-diversion',
  title: 'My Diversion',
  description: 'One-line gallery blurb.',
  kind: '2d',                                   // '2d' | 'webgl'
  schema,
  setup(ctx, config, size) { /* build state */ return state },
  frame(state, ctx, t, dt) { /* draw ONE frame; framework owns the loop */ },
  resize(state, size, ctx) { /* optional; ctx lets you repaint on reflow */ },
  update(state, config, size) { /* optional: apply config live, return true; */
                               /* falsy → framework re-runs setup */ return true },
  teardown(state) { /* optional */ },
}
export default myDiversion
```

**The framework owns the rAF loop** and gives you pause, tab-hidden auto-pause, offscreen-tile auto-pause, `prefers-reduced-motion` politeness (static first frame + opt-in), crisp `ResizeObserver` refit, an FPS readout, and fullscreen. You just draw a frame.

### The five UX invariants (non-negotiable)

1. **Readability is key** — legible type, no decorative-over-legible tradeoffs.
2. **Discoverable, not buried** — every param stays discoverable and carries help when its effect isn't obvious. Values needn't be on-screen at all times: collapsible sections, subpanels, and `showWhen` mode-swaps (e.g. the Color panel shows palette *or* gradient controls) are all fine, as long as the control is easy to find and its value returns when you open the section / switch the controlling field.
3. **Add help when confusing** — `.meta({ help })` renders as persistent inline subtext.
4. **Sliders only when bounded** — `ui:'slider'` needs `min`/`max`; open-ended numbers use `ui:'number'`.
5. **Err toward more contrast** — high-contrast palette, crisp borders.

## Control vocabulary

`slider` · `number` · `segmented` (enum) · `toggle` (bool) · `color` (swatch) · `colorList` (add/remove swatches, each with alpha) · `group` (nested, expanded). More get added when a diversion needs them.

Any field can carry `.meta({ showWhen: { field, equals } })` to render only when a sibling field holds a given value — used by Flow Field's Color panel to swap palette vs gradient controls by mode.

A diversion can also declare `presets?: PresetGroup[]` — named groups (independent axes) whose options each patch a subset of config. The config panel renders a dropdown per group above the form; picking one applies the patch through the normal config→URL path, and the dropdown shows "Custom" once a manual edit drifts off the preset. Flow Field ships **Flow** (motion) and **Color** (palette) groups.

## Stack

Vite · React 19 · TypeScript · Zod 4 (one schema → form + URL + types) · React Router · Vitest. The config⇆URL codec and the schema-driven form are custom and live in `src/framework/`.

See [`VISION.md`](VISION.md) for the north-star and [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design spec. Planned work, bugs, and shipped history all live in **[GitHub Issues](https://github.com/MattAltermatt/diversion/issues)** and **[Releases](https://github.com/MattAltermatt/diversion/releases)** — the single source of truth.

## Credits / Inspiration

Some diversions reimplement algorithms pioneered by **Jared Tarbell** ([complexification.net](http://www.complexification.net/)) — e.g. _Sand Stroke_ and _[Substrate](http://www.complexification.net/gallery/machines/substrate/)_. These are independent clean-room reimplementations of the published algorithms, written from scratch in TypeScript — not ports of his source. Original work © Jared Tarbell.

Others reimplement classic [**xscreensaver**](https://www.jwz.org/xscreensaver/) hacks (© Jamie Zawinski and the original hack authors) — e.g. _Squiral_, after the `squiral` hack by **Jeff Epler** (1999). Again clean-room reimplementations of the mechanics, with the look upgraded to fit this gallery — not ports of the C source.

## License

[MIT](LICENSE) © MattAltermatt
