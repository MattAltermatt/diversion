---
name: new-diversion
description: Use when adding a new diversion (a screensaver-like generative-art piece) to this Diversion project — e.g. "add a diversion", "new diversion", "scaffold a <name> diversion", "add a flow-field-style piece", or starting any new entry under src/diversions/. Walks the fixed contract so the piece auto-registers and gets the config screen, URL-driven animation screen, pause/fps/fullscreen for free.
---

# Adding a new diversion

A diversion is a self-contained generative-art piece that plugs into the shared framework. You write a Zod schema + a draw lifecycle; the framework gives you the gallery tile, the config screen (form + live preview), the URL-driven full-screen animation screen, pause, tab-hidden auto-pause, an FPS readout, and fullscreen — for free. New folders under `src/diversions/<slug>/` are auto-discovered by the registry (Vite globs); there is no registration step — but since #288 a folder needs **both** `meta.ts` (identity, eager) and `index.ts` (code, lazily loaded). Miss `meta.ts` and the piece silently never appears.

Read `CLAUDE.md` and `src/framework/types.ts` before starting. Mirror the reference diversion `src/diversions/flow-field/`.

## The five UX invariants (MUST — implement in the first pass)

1. **Readability is key.** 2. **Discoverable, not buried** — every param stays discoverable and carries help when its effect isn't obvious. Values needn't be on-screen 100% of the time: collapsible sections, subpanels, and `showWhen` mode-swaps are fine as long as the control is easy to find and its value returns when you open the section / switch the controlling field. 3. **Add inline help** when a param is confusing (`.meta({ help })`, persistent — not hover-only). 4. **Sliders only when bounds are defined** — `ui:'slider'` requires `min`+`max`; open-ended numbers use `ui:'number'`. 5. **Err toward more contrast.**

## Checklist

1. **Pick a slug + kind.** Kebab-case slug (folder name == `id`). `kind: '2d'` (Canvas 2D) or `'webgl'` (WebGL2). Create `src/diversions/<slug>/`.

2. **Write the schema** (`schema.ts`) — one Zod object, one source of truth for the form, the URL codec, and the `Config` type. Every field carries `.meta({...})`:
   - `ui`: `'slider' | 'number' | 'segmented' | 'toggle' | 'color' | 'group'`
   - always `label`; add `help` when non-obvious
   - `'slider'` → also `min`, `max`, `step`; `'segmented'` → `options` (mirror the enum); `'group'` → nest a `z.object(...).default({...}).meta({ ui:'group', label })`
   - Every field needs a `.default(...)` (the codec derives defaults and omits them from share URLs).
   - Include a `seed` field if the piece is random, and make randomness **seeded** (see step 4) so the same seed reproduces the same look.

   ```ts
   import { z } from 'zod'
   export const mySchema = z.object({
     count: z.number().int().min(10).max(5000).default(800)
       .meta({ ui: 'slider', min: 10, max: 5000, step: 10, label: 'Count' }),
     seed: z.number().int().default(1)
       .meta({ ui: 'number', step: 1, label: 'Seed',
               help: 'Any integer. Same seed → same pattern.' }),
   })
   export type MyConfig = z.infer<typeof mySchema>
   ```

3. **Write the simulation** in a framework-agnostic module (e.g. `myPiece.ts`) — pure functions that take a context + config + size and draw. Keep DOM/browser-instantiating imports out so it stays unit-testable. Drive motion by `dt` (ms) so speed is frame-rate independent.

4. **Seed your randomness.** Do NOT use global `Math.random()` — it breaks the "same seed → same pattern" promise. Reuse `mulberry32` from `src/diversions/flow-field/noise.ts` (exported), seeded from `config.seed`. If particles/agents respawn over time, they must respawn from the seeded stream too.

5. **Write `meta.ts`** — the gallery card + routing identity. **Required (#288):** the
   registry eager-globs `meta.ts` for identity and lazy-globs `index.ts` for code, so a
   folder without a `meta.ts` silently vanishes from the gallery and 404s its route —
   no type error, nothing thrown. `contract.test.ts` fails loudly if you forget it.

   ```ts
   import type { DiversionMeta } from '../../framework/types'

   export const meta = {
     id: 'my-slug',            // MUST equal the folder name — routing keys on it
     title: 'My Title',
     description: 'One-line gallery blurb.',
     kind: '2d',
   } as const satisfies DiversionMeta
   ```

   `as const satisfies` is load-bearing: it keeps `kind` at its literal type so
   `defineDiversion<typeof mySchema, State, '2d'>` still resolves the right context.
   Do **not** put `schema` here — it belongs with the code, and hoisting it into the
   eager half costs +142 kB gzipped in the entry chunk.

6. **Write `index.ts`** — the `Diversion<Config>` default export, spreading `...meta`:

   ```ts
   import type { Diversion, RenderContext, Size } from '../../framework/types'
   import { mySchema, type MyConfig } from './schema'
   import { meta } from './meta'

   const myDiversion: Diversion<MyConfig> = {
     ...meta,                 // never restate id/title/description/kind here
     schema: mySchema,
     setup(ctx, config, size) { /* build state, return it */ },
     frame(state, ctx, t, dt) { /* draw ONE frame — framework owns the loop */ },
     resize(state, size) { /* optional */ },
     teardown(state) { /* optional — free GPU/listeners; matters for a screensaver */ },
   }
   export default myDiversion
   ```

   - `frame` must NOT call `requestAnimationFrame` itself.
   - This is a **screensaver**: it runs unattended for a long time. Don't leak (allocate per-frame sparingly, free resources in `teardown`), and make sure `pause`/tab-hidden truly stops all work (the framework handles the loop; just don't spin your own timers).

7. **HiDPI is handled for you.** For `kind:'2d'` the framework scales the context by DPR and hands `setup`/`resize` **CSS-pixel** sizes — draw in CSS pixels, use `lineWidth ≈ 1`. For `kind:'webgl'` you get device pixels (for `gl.viewport`).

8. **Test** (`*.test.ts`, co-located, Vitest):
   - If random: a determinism test (same seed → identical initial state; different seed → different). See `flow-field/flowField.test.ts`.
   - Any pure helper (noise, math) gets a unit test.
   - Run `npx vitest run` (all green) and `npx tsc -b --noEmit` (clean).

9. **Verify in Chrome** (chrome-devtools MCP, never a built-in preview) on the dev server (`npm run dev`, port 5180):
   - Gallery tile previews live · config screen renders every control + expanded groups + inline help · editing updates the preview AND the URL (defaults omitted) · `/d/<slug>/play?...` reconstructs the look from the URL · fullscreen + pause work · console clean.
   - **It must look good** — verify the actual aesthetics at full size, not just that it renders.

10. **Commit** on a `feature/...` branch. Planning lives in GitHub Issues, not in a
    changelog — this repo has no `CHANGELOG.md`/`ROADMAP.md` on purpose. File any
    follow-ups as issues, and close the issue this diversion came from.
