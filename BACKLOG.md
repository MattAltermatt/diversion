# 🗃️ Diversion Backlog

Deferred ideas and known-minor items. Pull forward when a concrete diversion or verify needs it.

## Framework

- **Live-update hook** — `diversion.update?(state, config)` so the config screen's preview reflects edits *without* re-running `setup`. Today, changing any control re-runs `setup` (re-randomizes the flow field). The respawn lifecycle makes the reset quick and not jarring, but a true update path would be smoother and is required if a future diversion is expensive to rebuild. **Mechanism, not tuning.**
- **Captured static thumbnails** — the gallery uses live mini-previews (fine at small scale). At ~dozens of diversions, switch to a captured still per tile (the `AnimationHost` already has a thumbnail-capture seam). Lazy-load + code-split per diversion at that point too.
- **More control types** — vector / 2D-pad, gradient editor, multi-color ramp. Add when a diversion's schema needs one.
- **Record-to-GIF / share-image export** — capture a clip or still of the running animation.
- **Diversion-owned loop escape hatch** — only if a future piece genuinely needs custom timing the framework loop can't provide.
- **`ZodTypeAny` → `ZodType`** — minor: `fieldMeta.ts` / `SchemaForm.tsx` use the deprecated `ZodTypeAny` alias. Swap to `ZodType` (cosmetic; tsc passes today).

## Content (Phase 2 candidates)

- Cellular automata — Conway's Life, Lenia (continuous CA).
- Boids / flocking.
- **Raymarched WebGL shader** — proves the `kind: 'webgl'` context path. Highest-value next piece.
- Lissajous curves / harmonograph.
- Reaction–diffusion (Gray–Scott).
- Starfield / hyperspace (the literal screensaver classic).

## Deploy

- Remote GitHub repo (the old `MattAltermatt/diversion` was deleted; recreate) + static deploy pipeline. Needs approval.
