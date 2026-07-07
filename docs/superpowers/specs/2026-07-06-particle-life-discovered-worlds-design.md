# Particle Life — "Discovered Worlds" seed gallery (#214)

**Status:** design approved 2026-07-06
**Diversion:** `src/diversions/particle-life-gpu/`
**Kind:** pure data + one preset-group refactor (no engine change)

## 🎯 Goal

Most random Particle Life configs produce mediocre broth; a few grow gorgeous
cells, gliders, or chase-tails, and finding them today is pure luck. Surface a
curated set of **hand-picked worlds** as a preset axis so a viewer can jump
straight to a known-beautiful config — while every visit still starts from a
fresh soup, so the world is recognizable but never the exact same frame twice.

## 🪨 Load-bearing decision: identity is `matrixSeed`, NOT `seed`

The issue's original note ("patch `{ seed, ... }`") is wrong against the codec
contract:

- `seed` is `randomizeOnFreshLoad: true` → `encodeConfig` **never emits it**, and
  every fresh visit / share rerolls it. A seed-based preset value is silently
  discarded on Play navigation. It cannot carry a curated world.
- `matrixSeed` is a normal encoded field ("*a shared link keeps this value…
  share a ruleset that reseeds its soup each visit*"). The matrix is
  `buildMatrix(colors, matrixSeed || seed, symmetry, attractBias)`, so
  `matrixSeed` **is** the who-chases-whom ruleset — exactly what makes a world
  sing.

**A curated world = FIXED RULES (`matrixSeed`) + FRESH SOUP each visit (`seed`
rerolls).** Same species-relationship character grows every time; the exact
starting arrangement is new on every load. This matches the framework's existing
"seedless link reseeds each visit" ethos and is a feature, not a bug, for a
screensaver gallery. We do **not** pin the exact soup (no `includePinned`
machinery) — a frozen exact instance would read as a static screenshot.

### Reproducibility rule (curation discipline)

A world must be reproducible from `matrixSeed` **alone** (given the other pinned
matrix inputs). Because the matrix derives from
`buildMatrix(colors, matrixSeed, symmetry, attractBias)`, a world only reproduces
if the patch pins **all four**: `matrixSeed, colors, symmetry, attractBias`.
Curators therefore find worlds by **sweeping `matrixSeed`** — never by
hand-editing the `matrix` array. A world preset must NOT patch the explicit
`matrix` field (leaving it `undefined` keeps it derived from `matrixSeed`, which
is the whole point).

## 🧱 Structure: "Worlds" replaces "Feel"

Today: two preset axes — **Feel** (`forceScale, friction, beta, attractBias,
symmetry`) and **Look** (palette/glow/trails/…). A curated world must own its
dynamics to *guarantee* its beauty, which overlaps Feel entirely. So Feel is
absorbed, not coexisted-with:

- **Worlds axis** (replaces Feel) — the "which world?" axis. Two kinds of entry,
  same key-set:
  - 🎲 **Random** (top): the current Calm / Balanced / Lively presets, now with
    `matrixSeed: 0` (rules follow the rerolling `seed`) → "roll me a fresh random
    world at this energy." Behavior identical to today's Feel presets.
  - 🌍 **Curated** (below): named worlds with `matrixSeed: N` + tuned dynamics.
- **Look axis** — unchanged. Fully independent (disjoint key-set), so any world ×
  any look combine freely.

Two clean, truly-independent axes. `matchPresets` stays valid (equal key-set per
group; the two axes touch disjoint keys). Picking a world then editing a dynamics
knob correctly flips Worlds → "Custom".

### World patch key-set (8 keys, uniform across every Worlds option)

```ts
{ matrixSeed, colors, symmetry, attractBias,   // the four matrix-defining fields
  forceScale, friction, beta, rMax }           // energy/feature-scale that locks the look
```

Left as **free knobs** (not in any world patch, so worlds work at any taste):
`count`, `worldSize`, `speed`, `breathe*`, and everything on the Look axis.

Example `presets.ts`:
```ts
export const particleLifeGpuPresets: PresetGroup<ParticleLifeGpuConfig>[] = [
  {
    label: 'Worlds',
    options: [
      { name: '🎲 Calm',     patch: { matrixSeed: 0, colors: 6, symmetry: 'Symmetric',  attractBias: 0.15, forceScale: 0.6, friction: 0.08,  beta: 0.32, rMax: 80 } },
      { name: '🎲 Balanced', patch: { matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.10, forceScale: 1.0, friction: 0.04,  beta: 0.30, rMax: 80 } },
      { name: '🎲 Lively',   patch: { matrixSeed: 0, colors: 6, symmetry: 'Asymmetric', attractBias: 0.05, forceScale: 1.6, friction: 0.025, beta: 0.28, rMax: 80 } },
      // curated worlds appended below (matrixSeed:N), captured in Stage 2:
      // { name: 'Coral Reef', patch: { matrixSeed: 42, colors: 5, symmetry: 'Asymmetric', attractBias: 0.20, forceScale: 1.1, friction: 0.05, beta: 0.28, rMax: 95 } },
      // …
    ],
  },
  { label: 'Look', options: [ /* unchanged */ ] },
]
```

## 🔬 Curation workflow (two-stage)

Beauty here is **dynamic** — a still screenshot lies; a world's magic is in the
motion. So curation cannot be fully automated or judged from stills alone.

**Stage 1 — pre-screen solo (no user time).** Scripted sweep in Chrome: pin
`seed` constant, step `matrixSeed = 1..N`, let each settle ~20s, screenshot.
Reject obviously-dead configs (collapsed to a dot, frozen, one flat color) by
variance/structure. → shortlist of ~15–20 "has real structure" candidates.
Sweeping `matrixSeed` with `seed` pinned isolates the *rules* (same soup,
different who-chases-whom).

**Stage 2 — live taste pass (user + lead).** Drive the shortlist live in Chrome.
User flags keepers watching the **motion**. Before capture, confirm each keeper
still sings when the soup rerolls (the "fresh soup each visit" promise). For each
keeper, capture the 8-key patch → one `presets.ts` line; name it (lead proposes
evocative names — Coral Reef, Jellyfish, Chase Chains — user confirms).

**Chrome methodology notes:** load `…/play?matrixSeed=N&seed=1&mute=1` (pin seed
for Stage-1 comparability; drop `seed` in Stage 2 to watch fresh soups). Avoid
long `setTimeout` in the tab (rAF throttle gotcha) — use short waits and let real
foreground time pass. particle-life-gpu does not persist runs (#226 is boxcar2d
only), so a seedless load simply rerolls — no resume interference.

## 📦 Scope & sequencing

Build the mechanism **and** curate a starter batch, ship **together** in one PR —
an empty Worlds axis (just the 3 renamed Random entries) delivers nothing new;
the curated worlds *are* the value. Curation runs against current code (set
`matrixSeed` in the Advanced field), so no chicken-and-egg. Target **~6–8 starter
worlds**; `presets.ts` lets us append more anytime later without a spec.

## ✅ Testing

- Update/extend the presets test: assert one `Worlds` group + one `Look` group;
  every `Worlds` option patches the same 8 keys (`matchPresets` equal-key-set
  invariant); the 🎲 Random options carry `matrixSeed: 0`; curated options carry
  `matrixSeed !== 0`.
- Guard the reproducibility rule: no `Worlds` option patches the `matrix` field.
- `matchPresets` round-trip: applying a world's patch then reading it back matches
  that world; a one-field drift flips to "Custom".
- Confirm the existing seed/codec keystone + `seedContract` tests are untouched
  (this feature adds no `randomizeOnFreshLoad` fields and doesn't alter `seed`).

## 🚫 Non-goals

- No engine/shader change. No new schema fields. No `seed`-pinning / frozen
  instances. No automated "beauty" scoring. No connection-line rendering (#211,
  wontfix).
```