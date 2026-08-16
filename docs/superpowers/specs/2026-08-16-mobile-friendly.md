# Mobile-friendly gallery, and the road to a PWA

**Issue:** #284 · **Date:** 2026-08-16 · **Status:** in progress

A gallery of full-screen generative pieces is an obvious fit for a phone propped
on a shelf. Today the site is desktop-only in practice — not because anything is
mobile-hostile by design, but because **there is not one `@media` query in the
project** and `src/framework/theme.css` is the only stylesheet. Every route is a
desktop-fixed layout that survives a phone, or doesn't, by coincidence.

This spec covers the foundation: making the three routes usable under a finger,
and taking the safe-area decision early so a later PWA pass is purely additive.

## Scope

Ships: a first breakpoint, a reflowed Config screen, a Play chrome that doesn't
occlude its own controls, touch-wake for the idle chrome, `dvh` sizing,
safe-area-aware overlay offsets, a scoped `touch-action` seam, a Wake Lock
toggle, and a web app manifest with `display: standalone`.

Does not ship: a service worker (own branch, own risk — see §7), edge-to-edge
`viewport-fit=cover` beyond what safe-area padding requires, and code-splitting
the diversion registry (filed separately — see §8).

## What was already true, and must not be re-discovered

Verified in Chrome device emulation at 390×844×3, mobile+touch, before any
design work:

- **Touch input already works.** `AnimationHost` listens on Pointer Events
  (`AnimationHost.tsx:357-361`), including the `pointercancel` case. The
  `onPointer` seam (#9) needs no changes to receive a finger.
- **The viewport meta is correct** — `width=device-width, initial-scale=1.0`
  (`index.html:6`).
- **Backgrounded tabs already auto-pause** the rAF loop (`AnimationHost.tsx:279`).
- **The gallery is already lazy** and mounts *fewer* live hosts on a phone than on
  desktop — 4 in one column at 390px versus 12 in three columns at 1440px, well
  under `MAX_LIVE_GPU = 6` (`gpuBudget.ts:20`). The WebGL-context ceiling is
  *less* pressured on mobile, not more. The over-mount worry was backwards.
- 2D diversions draw in CSS pixels with a DPR-scaled backing store (clamped at
  DPR 2, `AnimationHost.tsx:148`), so they are already density-correct.

## The defects, measured

### 1. Play occludes its own controls — the worst of them

`.play-chrome` (`theme.css:685`, `z-index: 2`, non-wrapping flex row) and
`.anim-bar` (`theme.css:643`, `z-index: auto`) are absolutely positioned from
opposite edges with hard-coded px. At 390px they overlap by 134px and
`.play-chrome` wins. Hit-tested at each button's own centre:

```text
element              x    right   center      hit-test result        reachable
.play-chrome        16     368    (192,29)    🔗 Copy link           true
  ⏸  Pause         308     338    (323,27)    📌 Copy this world     FALSE
  ⛶  Fullscreen    346     376    (361,27)    📌 Copy this world     FALSE
```

**Pause and Fullscreen are physically un-tappable in portrait**; tapping them
copies a link. Derived collision threshold: any viewport under **524px**. At
320px on a diversion that also renders `🆕 New run` (`PlayScreen.tsx:105-120`),
`.play-chrome` measures 447px inside a 320px viewport and that button is
*entirely off-screen*, clipped rather than scrollable.

Touch-target sizes compound it: `.anim-bar button` is 30×30 (`theme.css:651`),
the play pills measure 28–30 tall, and `.sw` toggles are 38×20 — none of which
clears the 44px guidance, and the toggles miss even WCAG 2.2 AA's 24px floor.

### 2. The idle chrome cannot be woken by touch

`PlayScreen.tsx:66-79` auto-hides after 2500 ms and wakes on **`mousemove` and
`keydown` only**. A tap usually recovers via a synthesized compatibility
`mousemove`; **a drag emits none**, so dragging on Falling Sand — the one
diversion with `onPointer` — never brings the chrome back, and
`.play-screen.idle` sets `pointer-events: none` on both layers
(`theme.css:717-721`).

In a browser tab this is survivable because browser-back exists. **In
`display: standalone` on iOS there is no back button**, so this is a hard
prerequisite for the manifest, not a polish item.

### 3. Config is a 70px sliver

`.config-screen` is `grid-template-columns: 320px 1fr; height: 100vh; overflow:
hidden` (`theme.css:117-120`). At 390px that computes to `320px 70px`. The
preview is a sliver and `.config-actions` — pinned by `margin-top: auto`
(`theme.css:577`) — sits off the right edge.

### 4. `100vh` is the only `vh` in the repo, and it is already wrong

`theme.css:119`. On mobile Safari `100vh` resolves to the **large** viewport
(URL bar retracted), so the panel's scroll range extends under the toolbar while
`overflow: hidden` forbids scrolling the page to reveal it. The comment on line
120 — *"the page itself never scrolls"* — is false there. The same CSS is
correct in standalone, where there is no URL bar. `100dvh` is right in both.

### 5. Fullscreen is a silent no-op on iPhone

`AnimationHost.tsx:451` calls `el.requestFullscreen?.()`. Per MDN compat,
`Element.requestFullscreen` on iOS Safari is **iPad-only**. The optional chain
swallows it: the button renders, presses, and does nothing, forever, on the
single most important device for this project's premise. This is why the
manifest matters — **installed standalone is the only chromeless route on
iPhone.**

## The decision: Config reflows, it does not overlay

Two designs were built and rendered at 390×844
(`docs/mockups/2026-08-16-mobile-config.html`):

- **A — stacked, sticky preview.** Preview pins to the top at
  `clamp(240px, 45vh, 420px)`; the control panel flows beneath it and the page
  scrolls normally.
- **B — bottom sheet.** Full-bleed canvas with the controls in a 65%-height sheet
  resting as a 44px peek strip.

**A ships.** The mockup decided it rather than the argument: with B's sheet open,
the part of Falling Sand you came to look at — the pile — is *behind the sheet*,
and you tune against empty sky. B's full-bleed win only exists when the sheet is
down, which is not the state you configure in; and when you do want full-bleed,
that is what Play is for. A additionally needs **zero JSX changes** (the flip
rides on `grid-template-areas`), fixes the clipped Play button as a side effect
of nothing being forced into 320px, and introduces no drag-versus-sheet
ambiguity.

Breakpoint is **820px**, derived rather than round: 320px panel + ~500px of
usable preview is the width below which side-by-side cannot work at all.

**The mechanism that makes it work.** `.anim-canvas` is `position: absolute;
inset: 0` (`theme.css:621`) and `.anim-host` is `height: 100%`, both resolving
against `.config-preview` — which today gets its height for free from grid
stretch inside `100vh`. Drop to `height: auto` and that free height disappears,
so `.config-preview` needs an **intrinsic** height. That is the entire change,
one property on one existing selector inside one media query. `AnimationHost`'s
`ResizeObserver` (#7, `AnimationHost.tsx:261`) already exists to catch
container-driven resizes and absorbs the reflow with no framework change.

## `touch-action`: scoped to the diversions that need it

The Config document becomes scrollable under design A, which makes a touch-drag
on the preview canvas ambiguous. With `touch-action: auto` the browser claims the
first vertical move and fires `pointercancel`, which `AnimationHost.tsx:355` maps
to `'leave'` — so a paint stroke degrades to a single dab. It does not crash; it
silently truncates.

A blanket rule on `.anim-canvas` is **wrong**: the same class is used by all 137
gallery tiles (`AnimationHost.tsx:459` is the only `<canvas>` in the project, and
Gallery, Config and Play all mount it), on a 50,419px-tall scrolling page.
`touch-action` is honoured by the compositor whether or not a JS listener exists,
so a global rule kills gallery scrolling outright.

`pan-y` is also wrong: Falling Sand paints in **both** axes
(`falling-sand/index.ts:64`), so `pan-y` would hand every vertical drag to the
scroller and kill half the interaction.

The fix mirrors the existing house pattern — `.mcell { touch-action: none }` at
`theme.css:733`, which `MatrixEditor` already pairs with `setPointerCapture` and
is the one touch-correct drag control in the repo:

```tsx
// AnimationHost.tsx:459
<canvas
  key={diversion.kind}
  ref={canvasRef}
  className={diversion.onPointer ? 'anim-canvas anim-canvas--interactive' : 'anim-canvas'}
/>
```

Only one diversion declares `onPointer` today, so the blast radius is one piece —
but every future one inherits the seam automatically.

## Safe area: decided now, not in the PWA pass

`grep "env(safe-area" src/` returns **zero** hits and `index.html:6` has no
`viewport-fit`. Today that is survivable: iOS keeps a non-`cover` layout inside
the safe area.

But an immersive standalone screensaver wants `viewport-fit=cover`, and the
moment it lands **every hard-coded overlay offset becomes wrong**:

```text
.anim-bar      top:12px  right:14px    theme.css:643
.play-chrome   top:14px  left:16px     theme.css:685
.animate-pill  top:14px  left:16px     theme.css:152
.reset-pill    top:50px  left:16px     theme.css:166
```

So the offsets are authored as `calc(Npx + env(safe-area-inset-*))` **in this
phase**. Doing it later means redoing the responsive pass. This is the one
genuine reverse dependency from the PWA half back into layout, and taking it
early is what makes foundation-first safe.

## Wake Lock

`navigator.wakeLock` needs no user gesture (MDN enumerates exactly four
`NotAllowedError` causes and transient activation is not among them), works in a
plain browser tab, and is supported in Chrome 84+, Firefox 126+, Safari 16.4+.
One sharp edge: **iOS 16.4–18.3 does not honour it in standalone Home Screen web
apps** (webkit.org/b/254545), fixed in 18.4 — so installing could *break* it on
older iOS. Wake lock is therefore not an argument for standalone; it stands alone.

Two placement rules, both load-bearing:

- **It lives in `PlayScreen` only, never `AnimationHost`** — the host mounts on
  every gallery tile, so a per-host lock would hold the screen awake while merely
  browsing. `PlayScreen` is already where `resumeConfig`/`armPersistence` live.
- **It keys off `shouldPause()`** (`pauseModel.ts:10`) — hold the screen awake iff
  the animation is actually running. That yields correct behaviour for free on
  every pause source, and `pauseModel` is a pure tested module, so it is testable
  without a browser.

The lock is released by the platform on tab-hide and **must be re-requested** on
`visibilitychange`. Reuse the existing listener at `AnimationHost.tsx:279`'s
level rather than adding a second one.

Holding a wake lock is a battery decision the viewer should own, so it is a
**toggle in the play chrome**, defaulting off, gated on API availability so it
does not appear on browsers that lack it.

## Manifest

`start_url` and `scope` are both `"./"` — they resolve against the manifest URL,
giving `/diversion/` in prod and `/` in dev, matching
`vite.config.ts:10`'s conditional base. The SPA already derives its router
basename the same way (`App.tsx:7-8`).

**Omit `id`.** It resolves against `start_url`'s *origin*, and
`mattaltermatt.github.io` is a shared origin across every Project Page — so
`"id": "./"` would collide with any other PWA shipped from a sibling repo.
Omitted, it defaults to the full `start_url`, which is unique.

`public/` holds only `favicon.svg` and `icons.svg`; **iOS ignores SVG favicons
for home-screen icons**, so 192×192 and 512×512 PNGs plus an `apple-touch-icon`
must be generated. A `theme-color` meta sets the standalone status-bar colour.

Deep links currently return **HTTP 404 with an `index.html` body** (`deploy.yml:29`
copies `dist/index.html` to `404.html`). Browsers render it so sharing works — but
a `start_url` other than `/diversion/` would 404 and **block install**. Pin it to
the gallery root.

## Out of scope, deliberately

**§7 — Service worker.** Deferred to its own branch. It gates nothing: iOS
Add-to-Home-Screen needs only a manifest; only *Chrome's* install prompt requires
a service worker with a fetch handler. It is the only piece with an
irreversibility tail, since an installed SW persists on users' machines until
explicitly killed. When it happens: `vite-plugin-pwa` (Vite content-hashes assets,
so a hand-written SW cannot carry a static precache list), `globPatterns` set
explicitly — Workbox's default `**/*.{js,wasm,css,html}` misses the 1.165MB
neural-ca weights and all 26 Ablation sprites — and `maximumFileSizeToCacheInBytes`
raised, because the main bundle is at 91% of the 2MiB default past which Workbox
silently drops it from the manifest with a green build.

**§8 — Registry code-splitting.** `registry.ts:4-6` globs all 137 diversions with
`eager: true`, producing one 594KB gzipped chunk and a measured **5.1s
first-contentful-paint on Slow 4G**. This is the single highest-impact mobile
defect and neither half of this issue addresses it — no layout change and no
service worker helps a first visit. It is a build-architecture change touching
every diversion, so it is filed separately rather than absorbed here.

Related, and worth fixing whenever §8 is taken up: `vite.config.ts:9` gates
`base` on `command === 'build'`, so `npm run preview` serves the prod bundle at
`/` while the router expects `/diversion` — which is why the production bundle
had effectively never been run locally.

## Verification

- Unit: `pauseModel`-keyed wake-lock decisions; the `onPointer` → className
  branch on `AnimationHost`.
- Anti-regression: a test asserting `.anim-canvas` alone never carries
  `touch-action: none` — the regression that silently kills gallery scrolling.
- Chrome: hit-test every Play control at 320px, 390px and landscape, asserting
  `reachable: true` — the defect that started this was invisible to a
  render-only check.
- The desktop layout must be byte-identical above 820px; all existing tests green.
