# Copy share link button (#12) — design

## Goal

One-click "Copy share link" on the config and play screens: copies the
shareable URL to the clipboard and shows a brief "copied" confirmation, so
sharing doesn't require manually selecting the address bar. Pairs with the
now-shipped full-snapshot share links (#4) — a copied link is a permanent
snapshot of the current config.

## Decisions (from brainstorm)

- **Both screens copy the PLAY url** (`/d/<slug>/play?<snapshot>`). "Share
  link" means one canonical thing — the animation — consistent across both
  screens. The config screen does NOT copy its own config URL. (Q1 → A)
- **Placement** (Q2): config screen — beside `Open animation ↗` at the
  bottom of the control panel (the two "leaving this screen" actions form a
  natural pair). Play screen — next to the `← config` link in the top
  chrome, so it auto-hides with the rest of the chrome when idle.

## Component

`src/framework/CopyLinkButton.tsx` — one reusable, independently tested unit
(honors the framework's black-box rule; the screens just pass a URL).

```tsx
CopyLinkButton({ href, className? })
```

- `href` is the **relative** play path (e.g. `/d/flow-field/play?seed=…`).
  On click the button copies the **absolute** URL:
  `window.location.origin + href` via `navigator.clipboard.writeText(...)`.
- Local `copied` boolean state. Label: **`🔗 Copy link`** by default →
  **`✓ Copied`** on success for **1500ms**, then reverts.
- The revert timeout is cleared on unmount (no setState-after-unmount; no
  dangling timer).
- `min-width` is pinned to fit the wider of the two labels so the button
  never reflows / shifts under the cursor (no-jump-under-cursor rule).
- Clipboard failure (insecure context, permission denied, missing API) is
  caught; the label stays **`🔗 Copy link`** rather than falsely claiming
  success. No legacy `document.execCommand` fallback — both targets
  (localhost dev, https GitHub Pages) support the async Clipboard API.

## Wiring

- `src/routes/ConfigScreen.tsx`: render `<CopyLinkButton href={playHref} />`
  beside the existing `Open animation ↗` link. `playHref` already exists.
- `src/routes/PlayScreen.tsx`: render
  `<CopyLinkButton href={`/d/${diversion.id}/play${search}`} />` next to the
  `← config` link, inside the chrome that fades on idle. `search` is the
  current `useLocation().search` (the live snapshot the play screen was
  opened with).

## Styling

New `.copy-link-btn` rule in `src/framework/theme.css`, visually consistent
with the existing `.open-btn` / `.play-back` affordances. On the play screen
the button sits inside the `.play-screen` chrome and inherits its idle-fade
behavior (no extra CSS needed for that — it's a child of the faded region).

## Tests

`src/framework/CopyLinkButton.test.tsx` (@testing-library/react, Vitest fake
timers, a mocked `navigator.clipboard.writeText`):

1. Click → `writeText` called once with the **absolute** URL
   (`window.location.origin + href`), not the relative `href`.
2. After a successful click the label shows `✓ Copied`.
3. After 1500ms the label reverts to `🔗 Copy link`.
4. If `writeText` rejects, the label does **not** swap to `✓ Copied`.

## Out of scope

- Copying a link from the gallery tiles.
- QR codes, short links, or any link-shortening service.
- Copying the config (non-play) URL — explicitly decided against (Q1).
</content>
</invoke>
