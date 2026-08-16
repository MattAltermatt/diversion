import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'forest-fire',
  title: 'Forest Fire',
  description: 'The classic self-organized-criticality automaton: a forest regrows forever while '
    + 'rare lightning ignites fires of every size — from a single tree to a grid-spanning front — '
    + 'that sweep outward and green over again.',
  kind: '2d',
} as const satisfies DiversionMeta
