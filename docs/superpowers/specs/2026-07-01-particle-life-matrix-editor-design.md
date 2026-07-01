# Particle Life — live interaction-matrix editor

**Date:** 2026-07-01
**Status:** designed — brainstormed + view-mockup-verified in Chrome (full-grid inline wins). Pending implementation. Issue #204.
**Scope:** Expose the hidden per-species attract/repel matrix as a **live, editable, share-linkable** grid in the config UI of the **Particle Life (GPU)** diversion (`particle-life-gpu`). The matrix logic is shared with the CPU `particle-life` variant (`particle-life/matrix.ts`); this spec ships the GPU variant first and leaves a clean seam to mirror later. Related backlog: demon #77 (a bespoke editable grid, same UI primitive).

---

## 0. Why

Today the interaction matrix — the `n×n` table of attract/repel coefficients that grows every structure — is **derived from the seed and never exposed** (`matrix.ts`: *"the interaction matrix is DERIVED from the seed … never edited cell-by-cell"*). The only way to change "what red attracts to" is to reroll the seed and hope. This turns the piece from a slot-machine into an **instrument**: see the whole ruleset at a glance, drag one relationship, watch the broth reorganize live, and share the world you tuned via the URL.

The plumbing is already half-there: `writeMatrix(res, cfg)` re-uploads the matrix to the GPU, and `update()` already calls it when symmetry / attractBias change — so live matrix edits ride the existing live-apply path (no realloc, no re-setup).

---

## 1. Data model — the grid IS the matrix

The editable matrix becomes a real **schema field** so it round-trips in the share-link (the codec keystone — a link is a permanent snapshot):

```ts
matrix: z.array(z.number().min(-1).max(1)).optional()
  .meta({ section: 'Forces', ui: 'matrix', label: 'Interaction matrix', help: '…' })
```

- **Flat, row-major, length `n²`** where `n` = `colors` (Species). `matrix[i*n + j]` = how species `i` (feeler / row) feels about species `j` (neighbour / column). Range `[-1, +1]`.
- **Optional.** `undefined` (the default) means *derive from seed* — exactly today's behavior. A value is present **only when the user has hand-edited** ("Custom").

### Truth model
The grid always shows the **actual matrix in effect**. **Seed / Symmetry / Attraction-bias are "generators"** that fill it. Editing any cell captures a full-matrix snapshot into `cfg.matrix` and flips the control to **Custom**.

### Generator-vs-Custom behavior (the footgun rule)
```
Symmetry          LIVE TRANSFORM on the current grid, never a reroll.
                  → Symmetric: mirror the upper triangle onto the lower
                    (m[j*n+i] = m[i*n+j]) — folds the current values.
                  → Asymmetric: no value change; pairs simply unlock.
                  Operates on cfg.matrix (deriving one first if undefined).
                  No seed involvement → no surprise wipe.

Seed              TRUE REGENERATE. Changing the seed = "roll a new world":
                  clears cfg.matrix (→ undefined), grid re-derives. Seed is
                  structural for the GPU sim (re-setup) anyway. Expected.

Attraction-bias   TRUE REGENERATE (whole-table generator). Because it's a
                  casual slider, GUARD it: when Custom is active, changing
                  it asks first — inline confirm "Regenerate matrix? This
                  discards your edits [Regenerate] [Cancel]". Cancel reverts
                  the slider. When NOT custom, it regenerates silently (today's
                  behavior). rMax/beta/forceScale/friction do NOT touch the
                  matrix (they're force-shape, not the coefficient table).

Species (count/colors)  STRUCTURAL rebuild. A different n needs a different-
                  size matrix, so cfg.matrix is cleared and re-derived at the
                  new n. Custom can't survive a dimension change. Expected.
```

`presets.ts` "Feel" options patch `attractBias`/`symmetry` — picking one therefore regenerates the matrix (consistent with the generator rule); a preset never carries a `matrix`. `matchPresets` is unaffected (it compares the fields each group declares; `matrix` isn't in any group).

---

## 2. The `ui: 'matrix'` SchemaForm control

A new **config-aware** control (it needs sibling fields, unlike the one-field-at-a-time norm): `colors` (grid size), `palette` (header swatch colors), `symmetry` (mirror-mode + transform). It receives the whole `config` + `onChange(nextConfig)` so it can read siblings and, on Species/Symmetry/Seed interactions, write the derived/cleared matrix. Registered in `SchemaForm` by the `ui: 'matrix'` meta tag; lives in `framework/controls/MatrixEditor.tsx`.

**Layering — the control stays generic; the diversion owns its math.** A framework control must not import diversion-specific code (`buildMatrix` lives in `particle-life/matrix.ts`). Resolve this the way the framework already passes behavior through `.meta({...})`: the matrix field carries a **`deriveFrom(config): number[]` callback** in its meta, e.g.

```ts
matrix: z.array(z.number().min(-1).max(1)).optional()
  .meta({ section: 'Forces', ui: 'matrix', label: 'Interaction matrix',
          deriveFrom: (c) => [...buildMatrix(c.colors, c.seed, c.symmetry, c.attractBias)] })
```

The control calls `meta.deriveFrom(config)` whenever it needs the seed-derived table (display-when-not-custom, seed a fresh Custom snapshot on first edit, Reset). `buildMatrix` thus stays in the diversion; the control knows nothing about particle-life. (`SchemaForm.asObject`-style meta reading already exists; `deriveFrom` is just another optional meta field — typed on the meta interface.)

### Layout (inline, responsive, collapsible)
- Rendered inside a collapsible `<Subpanel label="Interaction matrix">` in the left config form. The live animation is already in the right pane, so edit-and-watch is free — **no modal/overlay** (deferred; see §6).
- CSS grid `grid-template-columns: <header> repeat(n, 1fr)` inside the ~284px panel; **cell size = panelWidth / n** (3 species ≈ 86px … 8 species ≈ 32px). Fewer species → bigger cells.
- **Species swatches** (from `paletteColors(palette, n)`) on both the top axis (neighbours) and left axis (feelers). **Diagonal cells** (self-attraction) get a visible border.
- **Cell fill** encodes the value: attract (+) → `--accent-2` blue, repel (−) → red, dark near 0, brightness ∝ |value|. Numeric value printed in-cell only when `n ≤ 5` (bigger cells); otherwise the color is the at-a-glance signal and the exact number lives in the readout.

### Read-direction cues (kill the ambiguity — the #1 UX finding)
1. **Axis labels + one-line key** under the grid: *"cell = how the LEFT species feels about the TOP species."* Top axis captioned "…is drawn to →", left axis "this species ↓".
2. **Natural-language readout** (replaces a bare "A → B: value"): hover/drag a cell →
   *"Silver is drawn to navy · +0.9"* / *"Gold repels navy · −1.0"* (verb chosen by sign; swatches shown beside the words; each species named by a short color label if one is cheaply available, else its ordinal "species N" — no new color-naming dependency required).
3. **Hover highlight**: hovering a cell lights up its row swatch + column swatch so the pair is unmistakable.

### Edit gesture
- **Vertical drag** on a cell: press, drag up = more attract, down = more repel; value clamps to `[-1, 1]`, updates live, and the GPU sim reorganizes under the cursor. Sensitivity ~0.008/px (tunable in Chrome).
- **Double-click** a cell → inline numeric entry for an exact value (precision escape hatch).
- In **Symmetric** mode, dragging cell `(i,j)` mirrors `(j,i)` simultaneously.
- **"Reset to seed"** button + a **Custom** badge (shown once `cfg.matrix` diverges from the seed-derived table).

### Deriving on demand
The control needs the seed-derived matrix to (a) display when not custom, (b) seed a fresh Custom snapshot on first edit, (c) re-derive on Reset. It calls the existing `buildMatrix(n, seed, symmetry, bias)` (pure, already imported via `pack.ts`) — no new math.

---

## 3. Codec

- **Encode only when Custom.** `encodeConfig` emits the `matrix` key only when `cfg.matrix` is defined. An un-edited config stays seedless/short and rolls a fresh world each visit exactly as today (the seed remains the sole `randomizeOnFreshLoad` field; `matrix` is a normal, non-randomized field).
- **Format:** flat, `_`-joined, 2-decimal fixed floats (values are `[-1,1]`, 2 dp is imperceptible). 8 species → 64 values ≈ 320 chars — acceptable in a URL. Follows the existing array-field encoding convention (see `colorList`); reuse the codec's array path, don't special-case if avoidable.
- **Decode degrades per-field.** If the `matrix` key is missing → derive from seed. If present but **length ≠ n²** (e.g. someone hand-edits `colors` in the URL) or any value is NaN/out-of-range → **discard and fall back to seed-derivation** (never break the rest of the config). Guarded by a new `matrixCodec.test.ts` and folded into the existing codec resilience tests.

---

## 4. GPU wiring (`gpu.ts` / `index.ts`)

- `writeMatrix(res, cfg)` currently rebuilds from seed via `packMatrix(colors, seed, symmetry, bias)`. Change it to **prefer `cfg.matrix` when defined** (upload it directly, validated to length `n²`), else fall back to `packMatrix(...)` as today. One branch; no shader change.
- `update()`: matrix edits are **live-applicable** (return `true`). Detect a `matrix` change (reference or shallow value) and call `writeMatrix`. Symmetry/attractBias already trigger `writeMatrix`; under the generator rule they now first mutate `cfg.matrix` in the control layer, so `writeMatrix` still just reads `cfg`.
- Structural fields unchanged: `count`, `colors`, `seed`, `worldSize` still return `false` (full re-setup). Because `colors` clears `matrix`, a re-setup always has a consistent-length (or undefined) matrix.
- `pack.ts`: `packMatrix` stays the seed generator; add nothing there beyond an optional passthrough if convenient. Keep pack pure/unit-tested.

---

## 5. Testing (Vitest, co-located)

- `MatrixEditor.test.tsx` — renders `n×n` cells for a given `colors`; reflows on Species change; drag updates the value + calls `onChange` with a length-`n²` `matrix`; Symmetric mirrors the partner; Reset clears `cfg.matrix`; readout verb flips with sign.
- `matrixCodec.test.ts` — round-trip a Custom matrix (encode→decode bit-close at 2 dp); missing key → undefined (derive); wrong-length / NaN → discarded, rest of config survives; un-edited config emits **no** `matrix` key (keystone: seedless share link).
- Extend `pack.test.ts` — `writeMatrix` prefers `cfg.matrix` over the seed-derived table when present; falls back when absent/invalid.
- Generator rule unit coverage — Symmetry transform symmetrizes current values (no seed touch); Seed/Species clear `matrix`; bias-while-custom path (confirm gate is UI, unit-test the clear/keep logic).
- Anti-regression: the existing `urlKeys.test.ts` + codec resilience suite must stay green (new `matrix` leaf key is globally unique → flat key, guard confirms).

---

## 6. Out of scope (backlog / later)

- **Expand-to-overlay** roomy editor (bigger cells at 8 species) — the inline grid fits and the preview is already adjacent; defer unless 8×8 feels cramped in real use.
- **Mirror to the CPU `particle-life` variant** — same `MatrixEditor` control + a `matrix` field on its schema + the same `writeMatrix`-equivalent in its sim. Straightforward follow-up once the GPU version is verified.
- **Reroll-matrix-only** (#205) composes naturally here (reroll fills the grid without touching the soup) but is its own issue.
- **Curated "discovered worlds"** (#214) — Custom matrices captured while verifying become preset candidates.
- Force-curve variants (#206) and the other filed ideas (#207–#214) are independent.

---

## 7. Tunable constants (verify in Chrome)

- Drag sensitivity `~0.008` value/px.
- In-cell number threshold `n ≤ 5`.
- Cell min size / gap for the 8-species case (readability vs fit).
- Confirm-gate copy for the bias regenerate.

None are gameplay-balance numbers; all are UI feel, tune freely during verify.
