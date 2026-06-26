# 🌀 Diversion

A personal web gallery of small, screensaver-like generative-art pieces — **diversions**. Each one is unrelated in content (a particle flow field today, a cellular automaton tomorrow), but they all share one framework and one design ethos. The framework owns the *chrome*; a diversion only has to draw.

## What's here

- **A framework** that gives every diversion two screens for free:
  - **Config screen** — controls on the left, a live preview on the right.
  - **Animation screen** — a full-viewport canvas (fullscreen-able) whose entire configuration lives in the URL, so any look is a shareable link.
- **One reference diversion** — **Flow Field**, particles drifting through a noise-driven vector field.

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
  resize(state, size) { /* optional */ },
  teardown(state) { /* optional */ },
}
export default myDiversion
```

**The framework owns the rAF loop** and gives you pause, tab-hidden auto-pause, an FPS readout, and fullscreen. You just draw a frame.

### The five UX invariants (non-negotiable)

1. **Readability is key** — legible type, no decorative-over-legible tradeoffs.
2. **Hide nothing** — every param visible, nested groups expanded, live values shown.
3. **Add help when confusing** — `.meta({ help })` renders as persistent inline subtext.
4. **Sliders only when bounded** — `ui:'slider'` needs `min`/`max`; open-ended numbers use `ui:'number'`.
5. **Err toward more contrast** — high-contrast palette, crisp borders.

## Control vocabulary

`slider` · `number` · `segmented` (enum) · `toggle` (bool) · `color` (swatch) · `group` (nested, expanded). More get added when a diversion needs them.

## Stack

Vite · React 19 · TypeScript · Zod 4 (one schema → form + URL + types) · React Router · Vitest. The config⇆URL codec and the schema-driven form are custom and live in `src/framework/`.

See [`docs/superpowers/specs/`](docs/superpowers/specs/) for the design spec and [`ROADMAP.md`](ROADMAP.md) for where this is headed.
