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
