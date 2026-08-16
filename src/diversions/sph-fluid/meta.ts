import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'sph-fluid',
  title: 'SPH Fluid',
  description: 'A body of liquid that pools, sloshes and splashes in a tilting tank.',
  kind: '2d',
} as const satisfies DiversionMeta
