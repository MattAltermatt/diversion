import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'force-graph',
  title: 'Force-Directed Graph',
  description: 'A knotted tangle of nodes and links springs apart — communities bloom into clusters and settle into an elegant network, then reseeds.',
  kind: '2d',
} as const satisfies DiversionMeta
