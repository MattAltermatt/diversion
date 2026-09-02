# 🌀 Diversion

A personal web gallery of small, screensaver-like generative-art pieces — **diversions**. Each one is unrelated in content (a particle flow field today, a cellular automaton tomorrow), but they all share one framework and one design ethos. The framework owns the *chrome*; a diversion only has to draw.

## What's here

- **A framework** that gives every diversion two screens for free:
  - **Config screen** — controls beside a live preview on a wide screen; on a narrow one the preview pins to the top and the controls flow beneath it.
  - **Animation screen** — a full-viewport canvas (fullscreen-able) whose entire configuration lives in the URL, so any look is a shareable link.
- **Usable on a phone, and installable** — the gallery, config and animation screens all reflow for a small touch screen, a **Keep the screen awake** toggle stops a propped-up phone going dark mid-piece, and a web app manifest means "Add to Home Screen" runs a diversion chromeless, with no browser bar. (On iPhone that is the *only* chromeless route, since Safari implements fullscreen on iPad only.)
- **Works without a network, for what you've watched — or for everything, if you ask** — a service worker keeps the app shell offline, so the gallery and all 138 cards load with no connection, and any piece you've opened keeps running. Pieces you've never opened aren't downloaded ahead of time: the whole gallery is ~1.6 MB to download, and spending that on 135 pieces you may never look at isn't a fair trade for a first visit. When it *is* the trade you want — a flight, a shelf device, a bad connection — **⤓ Keep the gallery offline** in the gallery header downloads the lot, with live progress and a cancel, and every piece then runs with the network off.
- **138 diversions**, from cellular automata and reaction-diffusion to
  strange attractors, flocking, fractal tilings and GPU particle life — each with its own
  controls, presets and shareable link. **[Browse the live gallery →](https://mattaltermatt.github.io/diversion/)**,
  or read what every piece does in **[`docs/gallery.md`](docs/gallery.md)**.

## Run it

```bash
npm install
npm run dev      # → http://localhost:5180
npm test         # vitest
npm run lint     # oxlint
npm run build    # tsc -b + vite build
npm run size     # entry-chunk + precache budgets (after a build)
npm run check:pwa # service worker + manifest contracts
npm run check:preload # deep-link modulepreload map (after a build)
npm run check:cache # every emitted file has exactly one caching lane (after a build)
```

Routes:

```text
/                 Gallery — a tile per diversion (live preview)
/d/:slug          Config screen (form + live preview, URL-synced)
/d/:slug/play     Animation screen (full canvas, config from URL)
```

## Adding a diversion

Create `src/diversions/<slug>/` with two files — no registration step; the registry discovers both by Vite glob.

- **`meta.ts`** — the identity (`id`, `title`, `description`, `kind`). Eagerly loaded, so the gallery can lay out all 138 tiles on the first paint.
- **`index.ts`** — the implementation, default-exporting a `Diversion` that spreads `...meta`. Lazily loaded: it becomes its own chunk, fetched when a tile scrolls into view or its route opens.

Both are required. A folder with only `index.ts` silently vanishes from the gallery and 404s its route — `contract.test.ts` catches that.

```ts
// meta.ts
import type { DiversionMeta } from '../../framework/types'

export const meta = {
  id: 'my-diversion',                             // must equal the folder name
  title: 'My Diversion',
  description: 'One-line gallery blurb.',
  kind: '2d',                                     // '2d' | 'webgl' | 'webgpu'
} as const satisfies DiversionMeta
```

```ts
// index.ts
import type { Diversion } from '../../framework/types'
import { meta } from './meta'
import { z } from 'zod'

const schema = z.object({
  size: z.number().int().min(1).max(100).default(20)
    .meta({ ui: 'slider', min: 1, max: 100, step: 1, label: 'Size' }),
  // ...more fields. Each field's .meta({ ui, label, help, min, max, step, options })
  // drives BOTH the form control and the URL codec.
})

const myDiversion: Diversion<typeof schema._type> = {
  ...meta,                                      // never restate the identity here
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

`slider` · `number` · `segmented` (enum) · `select` (enum, dropdown — for long option lists) · `toggle` (bool) · `color` (swatch) · `colorList` (add/remove swatches, each with alpha) · `group` (nested) · `matrix` (config-aware grid; Particle Life's interaction table) · `image` (pick a picture off your own machine — the one control that owns state *outside* the config: the pixels go to a browser-local store and only an id lands in the field, so it never travels in a shared link) · `hidden` (round-trips through the URL but renders no control — for preset-driven values). More get added when a diversion needs them.

Any field can carry `.meta({ showWhen: { field, equals } })` to render only when a sibling field holds a given value — used by Flow Field's Color panel to swap palette vs gradient controls by mode.

A diversion can also declare `presets?: PresetGroup[]` — named groups (independent axes) whose options each patch a subset of config. The config panel renders a dropdown per group above the form; picking one applies the patch through the normal config→URL path, and the dropdown shows "Custom" once a manual edit drifts off the preset. Flow Field ships **Flow** (motion) and **Color** (palette) groups.

## Stack

Vite · React 19 · TypeScript · Zod 4 (one schema → form + URL + types) · React Router · Vitest. The config⇆URL codec and the schema-driven form are custom and live in `src/framework/`.

See [`VISION.md`](VISION.md) for the north-star and [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design spec. Planned work, bugs, and shipped history all live in **[GitHub Issues](https://github.com/MattAltermatt/diversion/issues)** and **[Releases](https://github.com/MattAltermatt/diversion/releases)** — the single source of truth.

## Credits / Inspiration

Some diversions reimplement algorithms pioneered by **Jared Tarbell** ([complexification.net](http://www.complexification.net/)) — e.g. _Sand Stroke_ and _[Substrate](http://www.complexification.net/gallery/machines/substrate/)_. These are independent clean-room reimplementations of the published algorithms, written from scratch in TypeScript — not ports of his source. Original work © Jared Tarbell.

Others reimplement classic [**xscreensaver**](https://www.jwz.org/xscreensaver/) hacks (© Jamie Zawinski and the original hack authors) — e.g. _Squiral_, after the `squiral` hack by **Jeff Epler** (1999). Again clean-room reimplementations of the mechanics, with the look upgraded to fit this gallery — not ports of the C source. _Demon_ reimplements the `demon` hack — **David Griffeath's cyclic cellular automaton** — on three grids with a gallery hue-ring. _Logarithmic Circles_ ports the `logarithmiccircles` hack, whose shader is **"B/W logarithmic circles II"** by **mrange** ([Shadertoy `mljcWR`](https://www.shadertoy.com/view/mljcWR), released **CC0**).

_Golden Apollonian_ is a near-verbatim GLSL port of **"Golden apollian"** by **mrange** (Mårten Rånge) ([Shadertoy `WlcfRS`](https://www.shadertoy.com/view/WlcfRS), released **CC0**) — adapted to the WebGL2 fullscreen-triangle host with the ring/sun colours, fisheye, kaleidoscope mode, and plane depth exposed as gallery knobs; the fractal, plane-marcher, and lighting are the author's.

_Doyle Spiral_ is built on **Robin Houston's** Doyle-spiral numerics ([gist 6096562](https://gist.github.com/robinhouston/6096562), 2013) — a clean-room TypeScript reimplementation of the Newton solve for the generators; the loxodromic-flow presentation and rendering are original to this gallery. (Doyle spirals are due to **Peter Doyle**.)

_Ablation_'s and _Salvage_'s **Pictures** source draws on **92 pixel-art sprites** released under **CC0 1.0** on [OpenGameArt](https://opengameart.org/): items from **jetrel**'s [16x16 RPG items](https://opengameart.org/content/16x16-rpg-items) and [RPG item set](https://opengameart.org/content/rpg-item-set), villagers from **fleurman**'s [Tiny characters set](https://opengameart.org/content/tiny-characters-set), animals from **Clint Bellanger**'s [Tiny Creatures](https://opengameart.org/content/tiny-creatures), monsters from **AndHeGames**' [Assorted 32x32 creatures](https://opengameart.org/content/assorted-32x32-creatures), critters from **GrafxKid**'s [Various creatures](https://opengameart.org/content/various-creatures), food from **Sanglorian**'s [64 16x16 food sprites](https://opengameart.org/content/64-16x16-food-sprites) and **maruki**'s [16x16px food items](https://opengameart.org/content/16x16px-food-items), furniture from **Jannax**'s [Home objects](https://opengameart.org/content/home-objects) and **NaRNeRZz**'s [Misc household items](https://opengameart.org/content/misc-household-items-and-more), and lamps from **Reactorcore**'s [Lamps, lights n torches](https://opengameart.org/content/lamps-lights-n-torches). The sprites are used as-is at their native size — sliced out of their sheets by `scripts/slice-sprites.mjs`, never resampled (one sheet is published as an exact 2× export of its 32px art and is point-sampled back down, a round trip the script asserts is pixel-identical). CC0 requires no attribution; the artists are credited here and per-sprite in `public/pictures/credits.json` regardless.

_Neural CA_ runs the pretrained **Self-Organising Textures** neural cellular automata of **Alexander Mordvintsev & Eyvind Niklasson** ([Distill, 2021](https://distill.pub/selforg/2021/textures/)). Its weights (`models.json`) and the reference update math derive from the authors' open-source [**Hexells**](https://github.com/znah/hexells) project, used under the **Apache License 2.0** (see `src/diversions/neural-ca/HEXELLS-LICENSE.txt`); the WebGL2 engine is a clean-room TypeScript reimplementation of that pipeline.

## License

[MIT](LICENSE) © MattAltermatt
