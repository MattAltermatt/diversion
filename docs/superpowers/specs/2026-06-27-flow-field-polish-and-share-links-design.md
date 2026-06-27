# Flow Field polish + share-link robustness — design

**Date:** 2026-06-27
**Issues:** #4 (share-link robustness), #38 (default → named preset), #40 (gradient color preset), plus a folded-in blend-default + blend-help tweak surfaced during a live white-out investigation.

## Summary

One batch across the URL codec (the keystone) and the Flow Field diversion:

1. **#4 — make share links permanent snapshots.** Stop omitting defaults; encode every field with flat, full-name URL keys; degrade per-field on decode so one stale value can't nuke a whole link.
2. **#38 — kill Custom/Custom on first load.** Make the schema defaults equal a real named Flow + Color pair (Silk + Mariners) so both dropdowns resolve to names on a fresh load.
3. **Blend default + help.** Default blend `screen → normal` (color-true out of the box), and add bulleted inline help explaining what blend *is* (closing a discoverability gap behind the "single pale color washes to white" surprise).
4. **#40 — a second gradient-mode color preset** so `mode: 'gradient'` is exercised by more than just Spectrum.

The white-out the investigation chased is **not a bug** — it is the additive nature of `screen`/`lighter` blend (overlaps drive every channel toward white; `#ffe08a` is worst-case because red is already 255). `normal` (source-over) keeps each stroke's true color. Verified numerically and visually. No rendering-code change is needed for blend; `normal` is already wired.

---

## 1. #4 — URL codec: full-snapshot, flat names, graceful decode

**End goal:** a shared link is a permanent, faithful snapshot. Opening it after any number of default changes, retunes, or new presets reproduces the exact image the sharer saw. The URL is the project's entire persistence layer, so its format is a contract.

**Locked premises (user directives):** full snapshot (no omit-defaults "trick"), flat param structure, full human-meaningful names, group nesting dropped in the URL (`color.colors → colors`). Arrays stay comma-separated `#rrggbbaa`. No version marker.

Decisions (from a 3-agent design duel — pragmatic-minimalist vs explicit-contract vs longevity adversary):

### 1a. Full snapshot — drop omit-defaults
`encodeConfig` no longer compares against `schema.parse({})` to omit defaults. Every leaf is emitted. A URL with every param present never consults current defaults on decode → immune to default drift (the literal #4 ask). Editing URLs get longer; the user has explicitly accepted that ("does not have to be easily readable, as long as we can parse out meaning").

### 1b. Flat naming — leaf-name-when-unique, dotted fallback (P1)
URL key = the leaf's final path segment **when that name is globally unique within the schema**, else the full dotted path. Deterministic, no per-diversion declaration. For Flow Field every leaf is unique, so the four nested color leaves flatten:

```
color.mode   → mode
color.colors → colors
color.source → source
color.stops  → stops
```

Implementation: a `buildUrlKeyMap(schema)` helper derives both directions (dottedPath→urlKey and urlKey→dottedPath) from the existing `leafTypes` walk by counting final-segment occurrences. `encodeConfig` emits `urlKey`; `decodeConfig` reverses it.

**Collision guard (CI test):** a Vitest test imports every diversion schema and asserts each schema's leaf names are globally unique (no dotted fallback needed today). A future colliding leaf becomes a **build break**, not a silently-broken link. The explicit `.meta({ urlKey })` escape hatch is intentionally NOT built now (YAGNI; revisit if a real collision lands).

### 1c. Legacy dotted-key decode fallback
`decodeConfig` translates an incoming key via the reverse map, falling back to the raw key (`?? rawKey`) so any already-shared dotted-key URL (`color.colors=…`) still decodes. Free back-compat; no migration needed.

### 1d. Per-field graceful degradation (the real durability win)
Today decode ends in a single `schema.safeParse(out)` that returns **all defaults** if *any* field fails. Under full-snapshot every field is in every URL, so a future range-tighten / enum-rename / regex-change on one field would wipe the entire link. Replace with per-field validation:

- Keep a `path → zodNode` map alongside `leafTypes` (or extend it to carry the node).
- For each decoded param, validate the single value against its leaf node before `setPath`. On failure, **skip** it (the field keeps its default from the cloned baseline).
- A final whole-object `safeParse` remains as the typed-result/​safety net (still falls back to full defaults only if the assembled object is somehow invalid, which per-field validation makes near-impossible).

Net: worst case degrades from "total link death" to "one stale field resets, the rest survive."

### 1e. Arrays + version marker
Arrays stay comma-separated, per-element `encodeURIComponent` (already collision-safe, already tested). No `?v=` marker — full-snapshot solves default-drift; a wholesale reshape would be a new diversion slug, not a URL version.

### Tests (#4)
- Rewrite the omit-defaults tests → assert full-snapshot (all fields present).
- Update expected keys to flat names (`colors`, `mode`, `source`, `stops`).
- New: per-field degradation — a URL with one out-of-range / bad-enum / bad-hex field keeps every *other* field and defaults only the bad one.
- New: legacy dotted-key URL still decodes.
- New: cross-schema leaf-name uniqueness assertion.
- Keep all round-trip / coercion / array-separator / 8-digit-hex tests (semantics unchanged; only key names differ).

---

## 2. #38 — default lands on a named preset (Silk + Mariners)

Make the schema defaults equal a real named pair so `matchPresets` resolves both axes on first load.

**Flow → retune Silk (option A).** The user's chosen default flow is Silk with two sliders moved. Bake them into the **Silk** preset (keep the name):

```
Silk: noiseScale 0.0014, fieldDrift 0.05→0.71, speed 0.24→0.15,
      lifespan 6.5, trailLength 72, particles 7200, particleSize 0.8, fadeTrails true
```

**Color → Mariners with normal blend.** Change the **Mariners** color preset's `blend` from `'screen'` to `'normal'` (each color preset still carries its own ideal blend — Nebula etc. stay `screen`).

**Schema defaults** become Silk(updated) + Mariners(normal):

```
particles 7200, particleSize 0.8, noiseScale 0.0014, fieldDrift 0.71,
speed 0.15, lifespan 6.5, seed 10847 (unchanged), blend 'normal',
fadeTrails true, trailLength 72, background '#050810',
color: { mode 'palette', colors ['#2a5cf066','#4d9bff66','#ffc22e66','#ffe08a66'],
         source 'flow-angle', stops <FALLBACK_STOPS, unchanged> }
```

`seed` is excluded from preset matching (the 🎲 stays independent), so it does not affect the match.

**Acceptance:** fresh `/d/flow-field` with no query string shows **Flow = Silk** and **Color = Mariners** (not Custom/Custom).

---

## 3. Blend default + help

- **Default blend `screen → normal`** in the schema (consistent with Mariners-now-normal). Color presets that want glow set `blend: 'screen'` explicitly, so they are unaffected.
- **Bulleted help on the BLEND control** (UX invariant: inline help when confusing; persistent):

```
How overlapping ribbons combine:
- normal (default): each particle's true color
- screen: glows and mixes; dense areas wash to white
- lighter: stronger glow; whites out fastest
```

- **Render bullets:** add `white-space: pre-line;` to `.ctl-help` in `theme.css` (harmless to existing single-line helps) and author the help string with `\n- ` lines.
- Blend enum stays `['lighter','screen','normal']` (keep `lighter`; no `lighten` added this round — the user narrowed to "normal is the default").

---

## 4. #40 — second gradient-mode color preset

Add one `mode: 'gradient'` color preset alongside Spectrum to exercise the gradient path with more variety. Constraints: no pure white, alpha `0x66` (40%), background near-black.

Concrete starting preset — **"Dusk"**, a smooth indigo → magenta → warm-amber ramp that contrasts with Spectrum's full rainbow:

```
Dusk: background '#06060f', blend 'screen',
      gradient(['#3b2d8f66', '#c43b9a66', '#ff8a3b66'])
```

Stops are cosmetic and may be tweaked at verify (color-expert refinement optional). `screen` matches the gradient family (Spectrum); revisit at verify if it washes out.

---

## Files touched

- `src/framework/urlCodec.ts` — full-snapshot, `buildUrlKeyMap`, per-field degradation, legacy fallback.
- `src/framework/urlCodec.test.ts` — rewrite omit-defaults tests; add degradation / legacy-key / flat-name tests.
- new/extended test — cross-schema leaf-name uniqueness (imports the registry / all diversion schemas).
- `src/diversions/flow-field/schema.ts` — new defaults (Silk+Mariners), `blend` default `'normal'`, bulleted blend help.
- `src/diversions/flow-field/presets.ts` — retune Silk; Mariners → normal; add #40 gradient preset.
- `src/framework/theme.css` — `.ctl-help { white-space: pre-line }`.

## Verification

- Unit: `npx vitest run` green (codec, degradation, uniqueness, existing anti-regression).
- Chrome (chrome-devtools MCP, port 5180): fresh `/d/flow-field` shows Silk/Mariners, color-true normal blend, no white-out; copy the (now full-snapshot, flat-name) URL and reload → identical image; toggle BLEND and read the bulleted help; #40 gradient preset renders.
- User-verify before FF-merge.
