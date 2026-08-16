import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'fuzzyflakes',
  title: 'Fuzzyflakes',
  description: 'A calm field of soft, plush snowflakes — each with K-fold symmetry — '
    + 'drifting on a gentle breeze and slowly rotating across a deep field.',
  kind: '2d',
} as const satisfies DiversionMeta
