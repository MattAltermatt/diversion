import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'termite-sorting',
  title: 'Termite Sorting',
  description: 'Blind termites tidy a scattered mess of chips into a few color-sorted piles — order from local ignorance.',
  kind: '2d',
} as const satisfies DiversionMeta
