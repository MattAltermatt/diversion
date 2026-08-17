/** The seam for the handful of diversions that attach their OWN canvas listeners
 *  instead of declaring `onPointer` — today the three GPU pieces with a drag-pan /
 *  wheel-zoom camera (`particle-life-gpu`, `swarmalators`, `swarm-chemistry`),
 *  whose gestures the `onPointer` sample cannot express (no wheel, no pointer id,
 *  no capture).
 *
 *  Those listeners live outside React, so they never see `AnimationHost`'s
 *  `interactive` prop. Before #290 each one re-derived it as `clientWidth >= 480`
 *  — which is TRUE of a gallery thumbnail at viewports around 530-628px, where the
 *  grid collapses to one column and a tile canvas is ~510px wide. A wheel over such
 *  a tile then reached `preventDefault()` under `{ passive: false }` and blocked
 *  page scroll, on a plain mouse, no touch device involved.
 *
 *  The host knows the answer; it now publishes it on the element and this reads it
 *  back, so there is one derivation instead of three guesses. */

/** Attribute `AnimationHost` stamps on the canvas. Exported so the writer and the
 *  reader cannot drift apart on the string. */
export const INTERACTIVE_ATTR = 'data-interactive'

/** Is this mount one the viewer drives (Play, the Config preview, fullscreen),
 *  rather than a gallery thumbnail?
 *
 *  A missing attribute reads as NOT interactive, deliberately: of the two ways to be
 *  wrong, a camera that goes inert is a visible, recoverable annoyance, while a tile
 *  that eats the page's scroll is neither. */
export function drivenByViewer(cv: HTMLCanvasElement): boolean {
  return cv.getAttribute(INTERACTIVE_ATTR) === 'true'
}

/** Has the framework actually taken the browser's touch gestures off this canvas?
 *
 *  `drivenByViewer` answers "is this mount viewer-driven"; this answers the separate
 *  question "may a FINGER drag here mean something other than scrolling". They come
 *  apart on exactly one surface, and it matters: below 820px the Config screen scrolls
 *  with a sticky preview, and `theme.css` deliberately hands the gesture back there
 *  (`.config-preview .anim-canvas--interactive { touch-action: auto }`) because pinning
 *  a dead zone over the top 45% of a form you came to scroll is worse than losing a
 *  pan. That mount is still `interactive`, so without this check a touch drag would
 *  pan the camera *and* scroll the page at once.
 *
 *  Reads the COMPUTED style rather than the class, since the media query is the thing
 *  that overrides it. Under jsdom it computes to '' and this returns false — the safe
 *  direction: inert, never hijacking a gesture the browser still owns. */
export function gesturesYielded(cv: HTMLCanvasElement): boolean {
  if (typeof getComputedStyle !== 'function') return false
  return getComputedStyle(cv).touchAction === 'none'
}
