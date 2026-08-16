import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'canopy',
  title: 'Canopy',
  description: 'Branching plants race for light, evolving toward runaway height until the cost of trunk reins them back.',
  kind: '2d',
} as const satisfies DiversionMeta
