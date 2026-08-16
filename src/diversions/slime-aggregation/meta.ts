import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'slime-aggregation',
  title: 'Slime Aggregation',
  description: 'Starving amoebae relay a rotating cAMP wave and stream chemotactically along it, branching into rivers that converge into a body — the Dictyostelium slime mold aggregation.',
  kind: '2d',
} as const satisfies DiversionMeta
