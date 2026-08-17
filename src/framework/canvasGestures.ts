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
 *  that overrides it. Under jsdom an unstyled canvas computes to 'auto' (NOT '' — an
 *  earlier version of this comment said so and was wrong), so this returns false there
 *  unless a test sets it, which is the safe direction: inert, never hijacking a gesture
 *  the browser still owns. Setting `cv.style.touchAction = 'none'` exercises the true
 *  branch, so both are testable. */
export function gesturesYielded(cv: HTMLCanvasElement): boolean {
  if (typeof getComputedStyle !== 'function') return false
  return getComputedStyle(cv).touchAction === 'none'
}

/** Does the document behind this canvas have somewhere to scroll?
 *
 *  Only one mount in the app can answer yes: the Config preview below 820px, which is
 *  `position: sticky` over a form the viewer came to scroll (theme.css). Play is
 *  `position: fixed; inset: 0`, the Config split above 820px is `100dvh` +
 *  `overflow: hidden` with the scroll living in `.config-panel` — which is NOT an
 *  ancestor of any canvas — and gallery tiles are not interactive at all.
 *
 *  Deliberately the SCROLLING ELEMENT only, not an ancestor walk. An ancestor walk
 *  needs `getComputedStyle` per element to tell `overflow: hidden` (which grows
 *  scrollHeight but scrolls nothing) from `auto`, and this runs on every wheel event —
 *  60-120/s on an inertial fling, on a page already running a GPU sim. Two layout
 *  reads is the cheap, exact answer for the surfaces that exist. A future scrollable
 *  container BETWEEN a canvas and the root would not be seen; there is none today. */
export function pageScrolls(cv: HTMLCanvasElement): boolean {
  const doc = cv.ownerDocument
  const se = doc?.scrollingElement ?? doc?.documentElement
  if (!se) return false
  return se.scrollHeight - se.clientHeight > 1
}

/** May this canvas consume a wheel event — i.e. call `preventDefault()` on it?
 *
 *  Three-part answer, and the middle part is the whole point of #294:
 *
 *   - not a gallery thumbnail (`drivenByViewer`);
 *   - AND either nothing behind it can scroll, so there is no contest at all,
 *   - OR the viewer asked for zoom specifically, with `ctrlKey`.
 *
 *  `ctrlKey` is not a hack: a trackpad PINCH is delivered as a wheel event with
 *  `ctrlKey` set by every major engine, and ctrl+wheel is the long-standing keyboard
 *  spelling of the same intent. So the escape hatch is the gesture a viewer would
 *  reach for anyway, and it hands the three cameras trackpad pinch-zoom for free.
 *
 *  What it deliberately does NOT use is `gesturesYielded`. That was the obvious fix
 *  and it is the wrong shape: `touch-action` is a TOUCH property with no bearing on
 *  wheel, so keying wheel policy on it works only by coincidence of which rule the
 *  820px media query happens to override — and it would leave that mount able to pan
 *  and double-click-reset with a mouse but never to zoom, which is worse than either
 *  a live camera or an inert one. Gate each device on the contest it actually has. */
export function wheelOwned(cv: HTMLCanvasElement, e: { ctrlKey: boolean }): boolean {
  if (!drivenByViewer(cv)) return false
  return e.ctrlKey || !pageScrolls(cv)
}

/** One pointer being tracked for a pinch, in CLIENT coordinates. */
interface PinchPoint {
  x: number
  y: number
}

/** A single increment of a two-finger pinch. */
export interface PinchStep {
  /** Multiply the camera's zoom by this. 1 is no change. */
  scale: number
  /** Midpoint between the two fingers, in CLIENT coordinates — the point the caller
   *  should keep pinned while it scales, exactly as the wheel pins the cursor. */
  cx: number
  cy: number
}

export interface PinchTracker {
  /** Feed every pointerdown. Non-touch pointers are ignored: a pinch is a finger
   *  gesture, and letting a mouse into the map would let a click during a touch drag
   *  synthesize a scale. */
  down(e: PointerEvent): void
  /** Feed every pointermove. Returns a step only while exactly two fingers are down. */
  move(e: PointerEvent): PinchStep | null
  /** Feed pointerup AND pointercancel. When a two-finger pinch drops back to one
   *  finger, returns the finger still down so the caller can hand the pan back to it
   *  without a jump — its `last` position must be re-seeded, or the next move applies
   *  the whole distance travelled during the pinch in one step. */
  up(e: PointerEvent): { pointerId: number; x: number; y: number } | null
  /** True while two or more fingers are down: the caller must not also pan. */
  active(): boolean
}

/** Pure two-pointer bookkeeping for a pinch (#295), shared by the three diversions
 *  that own their canvas listeners.
 *
 *  It lives here, and only this much lives here, on purpose. The gesture DECODING is
 *  identical for all three and is the part with the traps (a zero divisor, a third
 *  finger, the 2-to-1 handover); the view transform it feeds is not — those three
 *  cameras have different fit bases, pan clamps and even y-sign conventions, all of
 *  which mirror a line of each diversion's own WGSL. Hoisting the transform too would
 *  invert the black-box rule and make the framework own a world it cannot interpret. */
export function createPinchTracker(): PinchTracker {
  const pts = new Map<number, PinchPoint>()
  let prevDist = 0

  const firstTwo = (): [PinchPoint, PinchPoint] | null => {
    const it = pts.values()
    const a = it.next()
    const b = it.next()
    return a.done || b.done ? null : [a.value, b.value]
  }
  const spanOf = (): number => {
    const two = firstTwo()
    // Zero unless EXACTLY two are down: with a third finger there is no stable pair
    // to measure against, so the pinch idles rather than jumping between pairs.
    return two && pts.size === 2 ? Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y) : 0
  }

  return {
    down(e) {
      if (e.pointerType !== 'touch') return
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      prevDist = spanOf()
    },
    move(e) {
      if (!pts.has(e.pointerId)) return null
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const two = firstTwo()
      if (!two || pts.size !== 2) return null
      const d = Math.hypot(two[0].x - two[1].x, two[0].y - two[1].y)
      // prevDist is 0 for the frame a pair first forms or re-forms. Dividing by it
      // would be Infinity, and a Math.min/max clamp PROPAGATES a non-finite value
      // rather than correcting it — the same way `movementX` being undefined
      // destroyed the view in #290.
      const scale = prevDist > 0 ? d / prevDist : 1
      prevDist = d
      return { scale, cx: (two[0].x + two[1].x) / 2, cy: (two[0].y + two[1].y) / 2 }
    },
    up(e) {
      if (!pts.has(e.pointerId)) return null
      const wasPinching = pts.size === 2
      pts.delete(e.pointerId)
      prevDist = spanOf()
      const left = pts.size
      if (!wasPinching || left !== 1) return null
      const [pointerId, p] = [...pts.entries()][0]
      return { pointerId, x: p.x, y: p.y }
    },
    active: () => pts.size >= 2,
  }
}
