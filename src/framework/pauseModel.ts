/** Every reason the animation loop might be paused. Paused if ANY is true. */
export interface PauseSources {
  manual: boolean // user pressed the pause button
  hidden: boolean // tab/document not visible
  reduced: boolean // OS prefers-reduced-motion, not yet opted out of (#39)
  offscreen: boolean // wrapper scrolled out of view (#6)
  lost: boolean // WebGL context lost; stays paused until restored (#124)
}

export const shouldPause = (s: PauseSources): boolean =>
  s.manual || s.hidden || s.reduced || s.offscreen || s.lost

/** Nothing is freezing the loop. The neutral starting point for a mount that has
 *  not yet heard from its host. */
export const RUNNING: PauseSources = {
  manual: false,
  hidden: false,
  reduced: false,
  offscreen: false,
  lost: false,
}

/** Field-wise equality, so a host that re-reports an unchanged set doesn't churn
 *  a re-render in whatever is listening. */
export const samePauseSources = (a: PauseSources, b: PauseSources): boolean =>
  a.manual === b.manual &&
  a.hidden === b.hidden &&
  a.reduced === b.reduced &&
  a.offscreen === b.offscreen &&
  a.lost === b.lost

/** Does this browser have the Screen Wake Lock API at all?
 *
 *  Gating the toggle on this is deliberate: a control that renders, presses and
 *  silently does nothing is a defect, not a graceful degradation. (The repo
 *  already ships one — `requestFullscreen` is a no-op on iPhone — and it is
 *  documented as a defect precisely so it isn't copied.)
 *
 *  Takes the navigator rather than reading the global so it stays pure and
 *  testable. TS 6's lib.dom types `Navigator.wakeLock` as always-present, which
 *  it isn't at runtime, so this probes structurally. */
export const hasWakeLock = (nav: unknown): boolean => {
  const lock = (nav as { wakeLock?: { request?: unknown } } | null | undefined)?.wakeLock
  return typeof lock?.request === 'function'
}

export interface WakeLockIntent {
  /** The viewer turned the toggle on. Battery is their call, so it defaults off. */
  requested: boolean
  /** `hasWakeLock(navigator)` — the API exists in this browser. */
  supported: boolean
  /** The host's live pause sources. */
  pause: PauseSources
}

/** Hold the screen awake iff the viewer asked for it, the API exists, and the
 *  animation is ACTUALLY RUNNING.
 *
 *  Keying off `shouldPause` is what makes this correct for free on every pause
 *  source: a manually paused, reduced-motion-frozen, scrolled-away or
 *  context-lost piece is a still image, and a still image has no claim on the
 *  viewer's battery. It also covers `hidden` — which doubles as the
 *  re-request seam, since the platform drops the lock on tab-hide and this flips
 *  back to true the moment the document is visible again. */
export const shouldHoldWakeLock = (i: WakeLockIntent): boolean =>
  i.requested && i.supported && !shouldPause(i.pause)
