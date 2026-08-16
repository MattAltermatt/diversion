import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'tour',
  title: 'Tour',
  description: 'A travelling salesman untangles his route: a chaotic web of crossing lines through '
    + 'scattered cities straightens, edge by edge, into an elegant crossing-free loop — then fresh '
    + 'cities scatter and it begins again.',
  kind: '2d',
} as const satisfies DiversionMeta
