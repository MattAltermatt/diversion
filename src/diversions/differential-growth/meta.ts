import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'differential-growth',
  title: 'Differential Growth',
  description: 'A self-avoiding curve buckling into brain-coral folds.',
  kind: '2d',
} as const satisfies DiversionMeta
