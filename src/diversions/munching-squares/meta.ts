import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'munching-squares',
  title: 'Munching Squares',
  description: 'The classic HAKMEM display hack: lighting cell (x, y) when y = x XOR t and '
    + 'stepping t folds a pulsing triangular XOR mosaic that shimmers through a cycling palette.',
  kind: '2d',
} as const satisfies DiversionMeta
