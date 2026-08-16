import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'foam',
  title: 'Foam Coarsening',
  description: 'A 2D soap froth that coarsens forever: smooth curved cell walls meet at Plateau '
    + 'junctions, small bubbles shrink and pop, and the survivors grow without bound — curvature-'
    + 'driven grain growth on eight order-parameter fields.',
  kind: 'webgl',
} as const satisfies DiversionMeta
