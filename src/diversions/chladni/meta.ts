import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'chladni',
  title: 'Chladni Figures',
  description: 'Sand on a vibrating plate settling into standing-wave nodal figures.',
  kind: '2d',
} as const satisfies DiversionMeta
