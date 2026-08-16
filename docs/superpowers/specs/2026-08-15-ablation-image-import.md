# Ablation: import real images as ablation targets

**Issue:** #278 · **Date:** 2026-08-15 · **Status:** design approved

Ablation eats a procedurally generated contour map. This adds a second picture
source: an image the viewer picks off their own disk, quantized to a chosen
number of colours and peeled by exactly the same machinery.

## Scope

Ships: **upload only** — a file picker, a quantizer, and the cycling behaviour.

Does not ship, and becomes a follow-up issue: a curated/bundled set, and
fetching free images off the web. The wall there is not taste, it is CORS —
drawing a cross-origin image onto a canvas taints it, and `getImageData()`
then throws, so pixels cannot be read off an arbitrary URL unless the host
sends permissive CORS headers. Practically that means the later feature is a
*curated* set (committed, or proxied from a source we control), which is also
the only version where "stays G-rated" is a promise rather than a hope.

## Why this fits Ablation without touching the sim

The erosion machinery is already source-agnostic. `front.ts` walks each lane
for the outermost survivor and reads `field.idx[cell]`; it has no idea whether
those indices came from noise. `buildField` already ends in a **quantile cut**,
so "every band is present and roughly equally massed" is a property of the
quantizer, not of the noise.

So a real image is a **swap of the sampler**. `newField()` is a pure synchronous
function called from exactly three places — `createState`, the picture-complete
branch in `step`, and `resizeState` — and everything downstream (`crew`,
`exposedHistogram`, the baked buffer, the retirement tests) is unchanged.

## 1. Schema: an explicit `Source` mode

`showWhen.equals` only validates against **enum** siblings, so "is an image
set" cannot gate anything. That forces an explicit mode field — which is better
UX regardless, because it makes the two worlds legible instead of "upload a
file and watch half the controls change".

| Section | Field | UI | Notes |
|---|---|---|---|
| Picture | `source` | `segmented` | `Contours` \| `Image`, default `Contours` — **new** |
| Picture | `image` | `image` | file picker + thumbnail, `showWhen source=Image` — **new** |
| Picture | `colors` | `slider` 2–24, default 6 | `showWhen source=Image` — **new** |
| Picture | `cellSize` | `slider` | unchanged, both modes |
| Picture | `featureSize` | `slider` | `showWhen source=Contours` |
| Picture | `roughness` | `slider` | `showWhen source=Contours` |
| Color | `palette` | `colorList` | `showWhen source=Contours` |
| Color | *derived swatches* | read-only strip | `showWhen source=Image` |
| Color | `background` | `color` | unchanged, both modes |

**Band count stays `palette.length` in Contours and becomes `colors` in Image.**
Unifying them was considered and rejected: the palette's help text promises
"the LENGTH of this list is the number of bands", and every existing shared
link depends on that. Two sources of truth for one number is a smell, but
breaking every link in the wild is worse, and the mode field makes which one
applies unambiguous at the point of use (`bandsFor(cfg)`).

The derived swatch strip is **read-only** in this pass. Making the extracted
colours editable is a reconcile problem — a re-quantize invalidates the edits —
and belongs in its own slot. Backlog it.

## 2. Framework: two small additions

Both are genuinely reusable; neither is Ablation-shaped.

### `ui:'image'` control

`src/framework/controls/ImagePicker.tsx` — the first file input in the
codebase. Renders `<input type="file" accept="image/*">`, a thumbnail of the
current pick, and a clear button.

On pick it decodes the file, **downsamples to 512px on the long edge**, stores
the pixels in a module-level map, and sets the field to a generated **id**. The
config holds the id, never the pixels: the config object stays small, `update()`
diffing stays a string compare, and nothing large is ever handed to the codec.

512px is generous — the sampler only ever reduces to `cols×rows`, which tops out
around 250×150 at `cellSize 2`.

### `local` meta flag

`encodeConfig`'s skip-set is currently exactly `freshLoadKeys(schema)` —
the fields flagged `randomizeOnFreshLoad`. That flag cannot be reused for the
image field, because it *also* drives `applyFreshLoadRandomization`, which would
try to roll a random **string**.

The two concepts are genuinely different and both are needed:

- `randomizeOnFreshLoad` (the seed) — **pin-only**: omitted by default, and
  emitted when `includePinned` is set, so copy-link-with-seed reproduces the
  exact world.
- `local: true` (the image) — **browser-local**: never emitted, `includePinned`
  or not. A recipient does not have the file, so pinning the id would encode a
  dangling reference.

So `encodeConfig` becomes:

```
skip = localKeys(schema) ∪ (includePinned ? ∅ : freshLoadKeys(schema))
```

`applyFreshLoadRandomization` keeps keying strictly on `randomizeOnFreshLoad`
and is untouched.

`codecSweep.test.ts` needs **no** change, which is worth stating so nobody
"fixes" it: the sweep builds its expected key set from leaves that carry a value
*in defaults*, and `image` is `z.string().optional()` with no default. It is
already excluded for the same reason a Custom-only matrix override is. The
never-emitted-when-set guarantee is covered by a targeted `urlCodec` test
instead.

A shared link therefore carries `source=Image` but no image, and must fall back
cleanly — see §5.

## 3. Persistence and the async seam

Pixels live in `localStorage` under one versioned slot (`ablation.image.v1`),
holding the downsampled 512px data URL plus its id. **Fail-soft on every read**:
corrupt, stale-version, or quota-exceeded returns null and the piece runs
Contours. One slot only — one uploaded image at a time keeps the store bounded
and the UI honest.

This rehydrate is the only genuinely async path. A same-session upload populates
the module store *before* `update()` fires, so `setup()` sees it synchronously.
A reload does not.

Handled with the **neural-ca ready-flag shape**: the store exposes a monotonic
version counter; `setup()` builds a Contours field if the store is cold, and
`frame()` checks the counter each tick (an integer compare) and rebuilds when it
moves. No promise is awaited inside a sync framework hook.

The rebuild is **immediate, not deferred to the next picture boundary**. A lap
runs ~25 minutes at the slowest Track speed, so "wait for this picture to
finish" would mean a reload shows the wrong picture for the rest of the session.
Rehydrate fires within a frame or two of mount, before anything meaningful has
been peeled, so an immediate rebuild reads as the picture simply loading.

## 4. The quantizer

`src/diversions/ablation/quantize.ts` — diversion-local, not framework. It is
generic in shape but has exactly one consumer; promote it only when a second
piece wants it.

Pipeline:

1. **Box-downsample** the stored image to `cols×rows`. Averaging is the right
   filter here — this is a hard reduction, and point-sampling a photo down to
   200 cells aliases badly.
2. **Convert to OKLab.** Perceptual grouping is the whole point of "like is
   grouped with like"; clustering in sRGB groups by voltage, not by appearance.
3. **k-means, k = `colors`**, k-means++ init **seeded from `cfg.seed`**,
   ~15 iterations. Determinism is a test keystone in this repo — "same seed =
   same run" — so the RNG must be the seeded one, never `Math.random`.
4. **Contrast-stretch the centroid lightness** so the darkest lands at or near
   black and the lightest at or near white, hue preserved. Without this, k=2 on
   a seascape returns two tinted centroids (`#1a2430` / `#d8cfc0`) rather than
   the stark two-tone the control implies. Also serves UX invariant #5.
5. Emit `{ idx, palette }` — the per-cell indices and the derived hex list that
   feeds the read-only swatch strip and every downstream draw.

**The result is cached** keyed on `(imageId, colors, cols, rows)`. It is stable
for a fixed key, so a re-peel reuses it and only resets `alive` — a cycled image
picture is *cheaper* than a cycled procedural one, not more expensive.

## 5. Behaviour

**Cycling.** A finished image picture re-peels the same image. The variation
between cycles comes free from `crew()`'s RNG, which keeps advancing: the Mixed
shuffle, the turret jitter, and the Unison lock pick all differ. No new
mechanism.

**Live edits.** `source`, `image`, and `colors` all change `idx` or the band
count, so all three join `applyConfig`'s **structural** list and force a clean
teardown + `setup`. Attempting to apply them live would leave `geom`/`field`/
`bandAlive` describing different pictures.

**Missing image.** `source=Image` with no id in the store — a shared link, a
cleared slot, a failed rehydrate — renders Contours. The mode field stays as the
viewer set it, so picking a file lights the image up without a second step.

## 6. One behaviour to pin with a test, not fix

`crew()` allocates turrets from the **whole-picture** histogram. The existing
comment justifies that for noise: every contour band reaches the border
somewhere, so no turret starts with nothing to shoot.

A photograph breaks that premise. A band can be **entirely interior** — a dark
pupil, a signature in the middle of a poster — so its turrets have nothing to
strike until the outer layers peel away. They blank-lap, eject, requeue, and
cycle harmlessly.

This is **not** a hang: retirement keys on `bandAlive === 0`, which is false for
an interior band, so those turrets stay in rotation and start firing the moment
their colour is exposed. It is a real early-picture idle, and it should be
pinned by a test asserting the picture still completes and coverage still holds
with a synthetic interior-only band — not papered over by allocating from the
exposed histogram, which would starve interior bands later in the picture.

## Testing

- **Quantizer determinism** — same (image, seed, colors) ⇒ identical `idx` and
  palette, across repeated runs.
- **k=2 contrast** — a synthetic gradient quantized to 2 returns near-black and
  near-white centroids, guarding the stretch.
- **Codec** — an `image` field never appears in `encodeConfig` output, with or
  without `includePinned`; `codecSweep` skips it; a `source=Image` link
  round-trips and decodes to a runnable Contours config.
- **Interior band** — a synthetic field with a band touching no border still
  completes, and `aliveCount` reaches 0.
- **Cycling** — a completed image picture re-peels the same `idx` with `alive`
  reset, and the quantize cache is not recomputed.
- **Fail-soft store** — corrupt JSON, wrong version, and a throwing
  `localStorage` each return null rather than throwing.
- **Structural apply** — `source`/`image`/`colors` each return false from
  `applyConfig`.

## Files

```
src/framework/fieldMeta.ts          FieldUi += 'image'; FieldMeta += local?
src/framework/urlCodec.ts           localKeys(); encodeConfig skip-set union
src/framework/controls/ImagePicker.tsx   new control (+ test)
src/framework/SchemaForm.tsx        case 'image'
src/framework/imageStore.ts         module store + localStorage (+ test)
src/framework/color.ts              srgbToOklab / oklabToHex (+ test)
src/diversions/ablation/quantize.ts new (+ test)
src/diversions/ablation/schema.ts   source / image / colors, showWhen wiring
src/diversions/ablation/field.ts    buildFieldFromIndices()
src/diversions/ablation/ablation.ts newField branch, structural list, bandsFor
```
