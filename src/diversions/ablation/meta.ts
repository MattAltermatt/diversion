import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'ablation',
  title: 'Ablation',
  description: 'Turrets ride a track and peel a contour map, one colour at a time.',
  kind: '2d',
} as const satisfies DiversionMeta
