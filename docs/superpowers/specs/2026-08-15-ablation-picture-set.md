# Ablation: a bundled pixel-art sprite set

**Issue:** #278 (second half) · **Date:** 2026-08-15 · **Status:** shipped

The first half of #278 shipped: Ablation can peel a picture the viewer chooses off
their own disk. That picture is `local` — it never enters a URL, so a link you
share shows the recipient a contour map instead. This second half ships the
codec-safe counterpart: **a set of individual pixel-art sprites committed under
`public/`, selected by a normal encodable field**, so a shared link carries the
picture. A finished sprite does not re-peel itself the way an upload does — the
next one in the set comes up.

> **Design history.** This spec originally described bundling pixel-art
> *landscape scenes* sorted into seven genres. That was wrong, and the correction
> came from the user: the interesting picture is not a scene but a **single
> object** — a sword, a potion, a little character — blown up chunky and taken
> apart. The genre layer went with it. The sourcing work behind the old design is
> recorded in §7 because its conclusions still hold.

## Scope

Ships: a `Pictures` source mode, 26 CC0 sprites mined from two sprite sheets, a
flat curated picker, seeded rotation with prefetch, an in-memory picture store,
alpha-aware quantization, a matte that makes each picture a solid rectangle, and
a contrast floor derived from the background rather than hard-coded.

Does not ship: fetching arbitrary images off the web (#286 — CORS-blocked), any
on-screen credit chrome, and a larger roster (tracked separately).

## Why sprites, and why they suit this piece

**Pixel art is already quantized.** Ablation reduces a picture to at most 24 flat
bands. A photograph quantized to six colours loses the thing that made it worth
looking at; a 16×16 sprite carries 8–15 colours to begin with, so the k-means
returns close to the artist's own palette.

**A sprite is small enough that the sampler is exact.** `downsample` box-averages
source pixels per cell, but `x1 = max(x0 + 1, …)` means that when the source is
smaller than the cell grid each cell spans exactly one source pixel — the average
IS that pixel. A 16×16 sprite is always far below the grid, so no resampling ever
happens and the palette survives intact.

**The consequence is a feature, not a limitation.** Turning `cellSize` down on a
16×16 sprite reveals no new detail, because there is none to reveal — it just puts
more, smaller cells inside each sprite pixel. So `cellSize` stops being a detail
knob and becomes purely a *how long does this take* knob, while `Colors` keeps
doing what it always did. This was the property the user explicitly wanted.

## 1. Schema: a third source mode

| Section | Field | UI | Notes |
|---|---|---|---|
| Picture | `source` | `segmented` | `Contours` \| `Pictures` \| `Yours`, default `Contours` — **changed** |
| Picture | `picture` | `select` | slug or `shuffle`, default `shuffle`, `showWhen source=Pictures` — **new** |
| Picture | `image` | `image` | unchanged, `showWhen source=Yours` |
| Picture | `colors` | `slider` 2–24 | `showWhen source=['Pictures','Yours']` — **widened** |
| Picture | `cellSize` | `slider` | unchanged, all three modes |
| Color | `background` | `color` | default `#05070a` → **`#2b2620`** |

`showWhen.equals` already accepted `string | string[]`, so widening `colors`
needed no framework change.

**The rename breaks a `?source=Image` link.** Per-field codec degradation reverts
the invalid enum to `Contours` and the rest of the link survives. The cost is near
zero: `image` is `local`, so such a link never carried a picture anyway.

### `picture` is a normal field, and that is the point

No `local`, no `randomizeOnFreshLoad`. It encodes and decodes like any other
field, which is the entire reason this half exists. Contrast `image`, which is
`local: true` precisely because it names something that lives only in one browser.

### `Select` gained value/label/group options

`Select` used each option string as *both* value and visible label, which would
have forced either `picture=Silver%20Sword` in URLs or `silver-sword` as the
visible label. `fieldMeta.options` widened to `string[] | SelectOption[]` with
`<optgroup>` support. The string form is untouched, so no existing caller changed.
(The grouping is currently unused — it was built for the abandoned genre layer and
is kept because it costs nothing and the roster will grow.)

## 2. Where the pixels live: `framework/pictureStore.ts`

A new store, deliberately **not** `imageStore`. That store is one localStorage
slot holding the viewer's upload; routing a rotation through it would clobber that
upload every time the picture changed. The new store is in-memory only — a
bundled sprite is a static asset the browser already HTTP-caches — and keyed by
stable slug, so there is no id-cannot-survive-reload problem and no
`currentImage()` fallback to reason about.

```ts
ensurePicture(slug: string): Promise<void>   // fire-and-forget; safe every frame
getPicture(slug: string): StoredImage | null
pictureVersion(): number
subscribe(fn: () => void): () => void
```

**Fail-soft, and asserted.** A 404, a rejected fetch, or an undecodable payload
leaves the slot empty and the piece falls back to the contour map. It writes
localStorage **never** — guarded by a test, because a regression there is
invisible and destroys user data.

`ensurePicture` returns its settle promise purely so tests can await completion.
This is load-bearing: without it the fail-soft tests asserted "the slot is still
empty" *before the error path had run*, and a mutation storing garbage on every
failure survived all four of them.

## 3. Rotation

`newPicture` resolves the active list from `picture` (all slugs, or one), orders it
by a **seeded shuffle from `cfg.seed`** so a pinned seed reproduces the sequence,
and indexes it by `generation`. When a picture starts, the next one prefetches. An
undecoded sprite falls back to contours and the version-watch in `step()` swaps it
in the moment pixels land. A single-slug selection never advances — `generation %
1` is always 0, so no special case.

`applyConfig` treats a `picture` change as **structural**: it is a different
picture entirely, and a live-apply would keep peeling the old one.

## 4. Transparency, and the matte

A sprite is a figure on a transparent surround, and Ablation had no notion of a
cell that was never alive.

- `downsample` skips pixels below `ALPHA_CUT = 128` and returns a `coverage` mask.
  Transparent pixels are excluded from clustering too — otherwise the void wins
  itself a cluster and becomes a band the turrets hunt.
- `buildFieldFromIndices` takes that mask and starts uncovered cells **dead**.
  Everything downstream already reasons in terms of `alive` — `buildFront` walks
  each lane for the outermost survivor, `crew` counts `bandAlive` over live cells,
  the picture completes at `aliveCount === 0` — so a cell that was never alive
  behaves exactly like one a turret cleared.

That alone gives a figure floating in space with beams crossing the void. The user
asked instead for a **solid rectangle**, so `Pictures` mode enables `matte`: the
void becomes a real band at index 0, every image colour shifts up one, coverage
goes all-1s, and `bandsFor` returns `colors + 1`. `colors` still means "colours
pulled out of the artwork" — counting the matte would make its help text a lie.

**The matte must not collide with the artwork.** First attempt put it at the
contrast floor, which is also where the sprite's darkest band lands, and the
character's outline dissolved into the card. The artwork now starts `MATTE_GAP =
0.14` above the floor, giving a strict three-level hierarchy:

```text
ground   #2b2620          what a cleared cell reveals
matte    at the floor     darkest thing above the ground, so clearing it reads
artwork  floor + 0.14 ↑   cannot collide with the card behind it
```

A test asserts every image band is strictly lighter than the matte. That property
is what keeps the silhouette readable and is not obvious enough to survive a
refactor unguarded.

## 5. The contrast floor is derived, not constant

`quantize.ts` had `L_FLOOR = 0.40` — the floor that lifts the darkest band off the
ground so it does not become invisible. It was calibrated against the near-black
`#05070a` the piece shipped with, **and only against that**:

```text
ground                darkest band at L 0.40     required
#05070a  (old)              1.96  ✅              1.88
#2b2620  (new)              1.47  ❌
#d9cdb8  (light)            6.57  ✅  but lightest band 1.22 ❌
```

So warming the ground would have reintroduced the exact vanishing-dark-band
failure the constant exists to prevent. `contrastFloor(background)` now binary-
searches OKLab L for a band clearing 1.88 at worst-case hue (a saturated violet
carries the least relative luminance at a given L, so the whole hue circle is
tested rather than a neutral). It independently reproduces 0.390 for `#05070a`,
which is how we know the derivation is right, and is clamped never to fall below
the historical 0.40.

`quantKey` includes `background` — without it a ground change would be a stale
cache hit and the picture would keep its old, possibly invisible, dark end.

**Known consequence, not fixed here:** Contours at defaults is now lower contrast
— the default ramp's darkest stop measures 1.70 against the new ground, under the
floor. Palette *presets* are unaffected because each patches its own `background`.
Lifting the default ramp's dark end is a colour-tuning change and was left alone.

## 6. Assets on disk

```text
public/pictures/<slug>.png    native size (14x14 … 16x16), PNG, alpha required
public/pictures/credits.json  slug, title, author, sourceUrl, license
scripts/slice-sprites.mjs     throwaway; not imported by the app
src/diversions/ablation/pictures.ts   generated + committed registry
```

**No resampling happens at any stage.** A sprite is committed at its native size
and Ablation scales it onto the cell grid at runtime. Any resize would need
nearest-neighbour to avoid manufacturing colours the artist never used, and not
resizing at all is strictly safer than resizing correctly.

**Alpha is mandatory and enforced.** `slice-sprites.mjs` throws if an extracted
sprite has no alpha channel. This caught a real failure: jetrel's item sheet has
*no* alpha and sits on an opaque olive-grey, so the first render had a grey slab
covering half the frame — the backdrop had become a real colour band. Sheets
without alpha declare a `bgKey`, keyed out by **flood fill from the border**
rather than a global colour replace, which would punch holes through grey parts of
blades and helms.

Credits live in `credits.json` and the README. Nothing appears on screen. CC0
requires no attribution; we credit anyway and record the source URL per entry.

## 7. Sourcing

Verified by probe, 2026-08-15:

```text
source              page    files                        verdict
------------------  ------  ---------------------------  --------------------------
OpenGameArt          200    direct curl → real file      fully scriptable
itch.io              200    CSRF-gated POST, no link     NOT scriptable
GitHub CC0 repos      —     raw.githubusercontent        fully scriptable
```

Two findings from the abandoned scene-hunt that still matter:

**OpenGameArt is a game-*asset* library, not a scene library.** A paginated sweep
of 1,473 CC0 2D-art candidates yielded plenty of tilesets, sprite sheets and title
cards but few framed scenes. That is precisely why mining sheets for individual
sprites works so much better than hunting for compositions.

**Search results paginate at 25.** An earlier sweep read only page 0 of each tag
and concluded several genres were empty; paginated, the candidate pool tripled.
Any "this category is thin" conclusion drawn from an unpaginated sweep is worthless.

Licence provenance is the real cost. A CC0 tag on either platform is
author-declared and platform-unverified, so sourcing is biased toward multi-sprite
sheets from named authors — one licence statement covering many sprites — and
every entry records the page it was claimed from.

**Current roster (26):** 18 items from jetrel's `16x16-rpg-items` and 8 villagers
from fleurman's `tiny-characters-set`, both CC0.

## 8. Testing

- Registry integrity — unique url-safe slugs, provenance on every entry, no
  collision with the shuffle sentinel.
- Rotation — seeded determinism, wrap, single-slug never advances, unknown
  selection degrades to everything so a stale link still plays.
- `pictureStore` — fail-soft on 404 / rejected fetch / bad payload, fetches once
  per slug, retries after failure, and **never writes localStorage**. All four
  fail-soft cases mutation-checked.
- `contrastFloor` — reproduces 0.40 on the historical ground, rises as the ground
  lightens, clamps, and the solved floor genuinely clears 1.88 at worst-case hue.
- Matte — adds exactly one band at index 0 without inventing an image colour,
  every cell alive, matte strictly darker than every image band.
- Codec — `picture` round-trips and is not in `localKeys`; `image` still is.
- `Select` — the plain `string[]` form renders unchanged; the object form splits
  value from label and groups.
