import type { DiversionMeta } from '../../framework/types'

/** Gallery card + routing identity. Split from index.ts so the registry can
 *  eager-glob every diversion's identity while lazy-importing its code (#288). */
export const meta = {
  id: 'potts',
  title: 'Potts Grain Growth',
  description: 'The Q-state Potts model as annealing metal: a mosaic of coloured grains whose '
    + 'boundaries cost energy, so a Monte-Carlo anneal has big grains swallow small ones. The '
    + 'polycrystal coarsens forever — stained-glass cells whose walls sweep and straighten.',
  kind: '2d',
} as const satisfies DiversionMeta
