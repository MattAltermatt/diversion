import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'wander',
  title: 'Wander',
  description: 'Random-walking pens weave luminous, slowly hue-shifting ribbons across the dark, '
    + 'growing an ever-larger meandering tapestry that gently fades and renews. After xscreensaver’s Wander.',
  kind: '2d',
} as const satisfies DiversionMeta
