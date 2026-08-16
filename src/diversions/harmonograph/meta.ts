import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'harmonograph',
  title: 'Harmonograph',
  description: 'A mechanical drawing toy: decaying pendulums swing a pen through delicate '
    + 'near-Lissajous rosettes that spiral inward, fade, and reseed — thin luminous threads on a dark ground.',
  kind: '2d',
} as const satisfies DiversionMeta
