import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'ant-colony',
  title: 'Ant Colony',
  description: 'Pheromone foraging: a near-optimal supply network self-assembles from purely local ant rules.',
  kind: '2d',
} as const satisfies DiversionMeta
