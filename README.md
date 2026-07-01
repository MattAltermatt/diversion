# 🌀 Diversion

A personal web gallery of small, screensaver-like generative-art pieces — **diversions**. Each one is unrelated in content (a particle flow field today, a cellular automaton tomorrow), but they all share one framework and one design ethos. The framework owns the *chrome*; a diversion only has to draw.

## What's here

- **A framework** that gives every diversion two screens for free:
  - **Config screen** — controls on the left, a live preview on the right.
  - **Animation screen** — a full-viewport canvas (fullscreen-able) whose entire configuration lives in the URL, so any look is a shareable link.
- **Nineteen diversions:**
  - **Flow Field** (`kind: '2d'`) — particles drifting through a noise-driven vector field.
  - **Gravity Wells** (`kind: '2d'`) — particles with momentum falling through a field of transient gravity wells that appear and fade; orbits, slingshots, and push-pull churn.
  - **Plasma** (`kind: 'webgl'`) — domain-warped color fields, demoscene-style; the reference WebGL piece (proves the `webgl2` host path + context-loss recovery).
  - **Metaballs** (`kind: 'webgl'`) — gooey lava-lamp blobs that rise, merge, and split; a CPU thermal-oscillator sim feeds a fragment-shader field sum.
  - **Substrate** (`kind: '2d'`) — cracks grow and branch at right angles into an organic network, each washing a soft watercolour cell beside it.
  - **Sand Stroke** (`kind: '2d'`) — grainy sand-painter strokes lay drifting bands of stratified colour.
  - **Squiral** (`kind: '2d'`) — worms wind themselves into tight square spirals that flood the screen with interlocking right-angled coils.
  - **Turmite** (`kind: '2d'`) — a generalized Langton's ant; ants turn by the colour beneath them, leaving emergent highways, spirals, and fractal growth (port of xscreensaver `ant`).
  - **Moire** (`kind: '2d'`) — concentric rings expand from drifting centers and interfere into shifting moire fields. Three styles: **Glow** (luminous additive rings), **Op-Art** (filled-disc XOR parity — the centers' rings merge into one bold 2-colour interference field), **Moire** (thin duotone rings that cancel where they cross).
  - **Logarithmic Circles** (`kind: 'webgl'`) — an endless, self-similar zoom through log-spaced rings of black-and-white circles; faithful op-art with a gallery color mode (port of xscreensaver `logarithmiccircles`).
  - **Strange Attractors** (`kind: '2d'`) — a long chaotic orbit of a Clifford or de Jong map painted as accumulated point-density; gossamer filamentary clouds that morph forever under always-on drift, the canvas itself the density accumulator.
  - **Demon** (`kind: '2d'`) — a cyclic cellular automaton on square, hexagon, or triangle grids; each cell is eaten by the next colour in a ring and rotating spiral "demons" self-organize out of pure noise (port of xscreensaver `demon`, after David Griffeath's cyclic CA).
  - **Physarum** (`kind: 'webgl'`) — a million slime-mold agents sense and follow a pheromone trail they themselves deposit; the field diffuses and decays into a constantly-rewiring transport network. All-GPU (agents in a float texture, trail in a ping-pong FBO); three morphologies — **Networks**, **Coral**, **Veins** (after Jones 2010 / Sage Jenson).
  - **Gray-Scott** (`kind: 'webgl'`) — two chemicals diffuse and react in ping-ponged float textures, growing coral, mitosis, maze, spots, and worm Turing patterns that never settle; all-GPU reaction-diffusion with the **feed**/**kill** knobs behind a named-pattern picker (after Pearson's classification of the Gray-Scott model).
  - **Labyrinth** (`kind: 'webgl'`) — a slime-mold colony solves a maze: born gradually from the start corner, it buds forward at its own leading edge, climbs a faint chemical gradient toward the exit, and lights the shortest path before a fresh maze regenerates. All-GPU on the Physarum FBO host with maze gen + BFS solve on the CPU; **Behavior** presets (Veins/Tendrils/Seeker/Drift) and a **Goal pull** knob tune explore-vs-beeline (after Nakagaki 2000 / Adamatzky's chemo-attractant one-pass solver).
  - **Neural CA** (`kind: 'webgl'`) — a *learned* cellular automaton: every cell runs a tiny pretrained neural net over its hex neighbourhood, growing an endless, churning abstract texture from a seed. All-GPU inference (channel-tiled uint8 tensors, hex perception → two dense layers → stochastic update) with pretrained weights for **eleven** textures behind a picker (after Mordvintsev & Niklasson, _Self-Organising Textures_ / Hexells).
  - **Lenia** (`kind: 'webgl'`) — a *continuous* Game of Life: a single scalar field, seeded with smooth noise, is convolved each step with a ring kernel and squeezed through a bell-shaped growth function, condensing a primordial soup of glowing cells that swim, merge, and dissolve forever. All-GPU (RGBA32F ping-pong field, precomputed radial-kernel LUT); **Coral/Cells/Veins/Rings** pattern presets over a thin **μ/σ** growth band (after Bert Chan's _Lenia_).
  - **Langton's Loops** (`kind: '2d'`) — Christopher Langton's self-reproducing cellular automaton: a looped organism circulates an instruction tape, extends a construction arm, and buds off copies that colonise the plane into a coral of loops; when growth stalls it holds, fades, and reseeds. 8-state / von-Neumann / rotate4 (the canonical 219-rule table), with a sheath + signal-hue-ring palette and aged-coral dimming (port of xscreensaver `loop` by David Bagley, after Langton 1984).
  - **BoxCar2D** (`kind: '2d'`) — a genetic algorithm evolves little 2D cars across a procedurally-generated hilly track: each generation's population runs solo, and elitism + roulette selection + subassembly-aware crossover + annealed mutation breed the next generation, so cars visibly improve into hill-climbers. Every trait is evolvable — free-form node truss, per-edge springs, and per-wheel radius / grip / motor / suspension / mass — with an informed prior (heavy chassis over light wheels) so cars can actually drive from the start. A fresh page load rolls a new seed (each visit is a different run); a share-link pins its seed and reproduces exactly. Two objectives — **distance** (go as far as possible on an endless track) or **time** (race to a finish line; fitness ranks by distance until cars can reach it, then by speed) — plus four terrain types (rolling / dunes / plateaus / ridges), an optional **resettable rubble** obstacle layer (loose blocks reset identically for every car, so none bulldozes a path for the next), and an ∞ track-lifespan option (one track, mastered forever). Real Box2D v3 rigid-body physics (`phaser-box2d`, behind a typed seam) with motorized wheel joints, drawn as wireframes; a deterministic seed reproduces the whole multi-generation run (clean-room remake of BoxCar2D by Rafael Matsunaga).

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

Others reimplement classic [**xscreensaver**](https://www.jwz.org/xscreensaver/) hacks (© Jamie Zawinski and the original hack authors) — e.g. _Squiral_, after the `squiral` hack by **Jeff Epler** (1999). Again clean-room reimplementations of the mechanics, with the look upgraded to fit this gallery — not ports of the C source. _Demon_ reimplements the `demon` hack — **David Griffeath's cyclic cellular automaton** — on three grids with a gallery hue-ring. _Logarithmic Circles_ ports the `logarithmiccircles` hack, whose shader is **"B/W logarithmic circles II"** by **mrange** ([Shadertoy `mljcWR`](https://www.shadertoy.com/view/mljcWR), released **CC0**).

_Neural CA_ runs the pretrained **Self-Organising Textures** neural cellular automata of **Alexander Mordvintsev & Eyvind Niklasson** ([Distill, 2021](https://distill.pub/selforg/2021/textures/)). Its weights (`models.json`) and the reference update math derive from the authors' open-source [**Hexells**](https://github.com/znah/hexells) project, used under the **Apache License 2.0** (see `src/diversions/neural-ca/HEXELLS-LICENSE.txt`); the WebGL2 engine is a clean-room TypeScript reimplementation of that pipeline.

## License

[MIT](LICENSE) © MattAltermatt
