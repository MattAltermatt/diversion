import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'interference',
  title: 'Interference',
  description: 'Clean-room port of Hannu Mallat’s 1998 xscreensaver hack "interference" — '
    + 'circular ripples from several moving sources sum into a shifting, colour-cycled '
    + 'wave-height field.',
  kind: 'webgl',
} as const satisfies DiversionMeta
